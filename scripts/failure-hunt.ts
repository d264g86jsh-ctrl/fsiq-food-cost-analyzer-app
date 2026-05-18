/**
 * Restaurant Validation Failure Hunter
 *
 * Finds real independent restaurant websites via free public sources (Yelp,
 * OpenTable, Eater, The Infatuation, seed lists), runs them through the actual
 * runValidation() pipeline, diagnoses every failure, and scores the pipeline
 * against six success benchmarks.
 *
 * Zero API keys required. All sources are publicly browsable.
 *
 * Usage:
 *   npx tsx scripts/failure-hunt.ts            # full run (5,000 failures target)
 *   npx tsx scripts/failure-hunt.ts --dry-run   # quick test (50 failures then stop)
 *   npx tsx scripts/failure-hunt.ts --resume    # append to existing failure-hunt-results.json
 */

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import Module from 'node:module';
import path from 'node:path';
import { createRequire } from 'node:module';

// ── ENV loading (.env.local parser — no dotenv dependency) ───────────────

function loadEnvFile(filepath: string): void {
  if (!existsSync(filepath)) return;
  const content = readFileSync(filepath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx < 1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    let val = trimmed.slice(eqIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

loadEnvFile(path.join(process.cwd(), '.env.local'));
loadEnvFile(path.join(process.cwd(), '.env'));

// ── CLI flags & constants ────────────────────────────────────────────────

const DRY_RUN = process.argv.includes('--dry-run');
const RESUME = process.argv.includes('--resume');
const TARGET_FAILURES = DRY_RUN ? 50 : 5000;
const CONCURRENCY = 10;
const PROGRESS_INTERVAL = DRY_RUN ? 10 : 500;
const DRY_RUN_FALSE_POSITIVE_LIMIT = 50;
const SCRAPE_DELAY_MS = 200;
const SCRAPE_TIMEOUT_MS = 12_000;

const RESULTS_PATH = path.join(process.cwd(), 'scripts', 'failure-hunt-results.json');
const SUMMARY_PATH = path.join(process.cwd(), 'scripts', 'failure-hunt-summary.txt');

const BROWSER_USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:124.0) Gecko/20100101 Firefox/124.0',
];

// ── Types ────────────────────────────────────────────────────────────────

type UrlSource =
  | 'yelp'
  | 'opentable'
  | 'eater'
  | 'infatuation'
  | 'tripadvisor'
  | 'google'
  | 'state_association'
  | 'newspaper'
  | 'foursquare'
  | 'seed';

interface RestaurantCandidate {
  url: string;
  name: string;
  city: string;
  state: string;
  cuisine: string;
  source: UrlSource;
  address: string;
}

interface FailureRecord {
  url: string;
  restaurantName: string;
  city: string;
  state: string;
  cuisine: string;
  thirdPartySource: string;
  finalDecision: string;
  httpStatus: number;
  restaurantSignalScore: number;
  negativeSignalScore: number;
  signalsFound: string[];
  signalsMissing: string[];
  fetchSucceeded: boolean;
  htmlLength: number;
  hasCloudflare: boolean;
  hasSchemaOrg: boolean;
  hasOpenGraph: boolean;
  failureCategory: string;
  specificFailureReason: string;
  reachabilityStatus: string;
  nationalChainScore: number;
  internalFlags: string[];
  reasons: string[];
  timeTakenMs: number;
}

interface LightPassRecord {
  url: string;
  restaurantSignalScore: number;
  negativeSignalScore: number;
}

interface ValidationResult {
  finalDecision: string;
  restaurantSignalScore: number;
  negativeSignalScore: number;
  nationalChainScore: number;
  websiteRelationshipScore: number;
  httpStatus: number;
  websiteReachabilityStatus: string;
  internalFlags: string[];
  reasons: string[];
  normalizedUrl: string;
  finalUrl: string;
  headlessBrowserUsed: boolean;
  claudeAiUsed: boolean;
  manualReviewRequired: boolean;
  websiteLogoHints: string[];
  logoUrl: string | null;
  countryEligibility: string;
  locationConfidenceScore: number;
  locationReasons: string[];
  googlePlacesScore: number;
}

interface WebsiteSignals {
  pageTitle: string;
  metaDescription: string;
  ogTitle: string;
  ogType: string;
  ogDescription: string;
  ogSiteName: string;
  ogImage: string | null;
  schemaOrgTypes: string[];
  navLinkTexts: string[];
  bodyText: string;
  logoHints: string[];
  socialLinks: string[];
  hasRestaurantSchema: boolean;
  hasVendorSchema: boolean;
  hasBotProtection: boolean;
  hasComingSoon: boolean;
  hasParkingPage: boolean;
  hasLinkInBio: boolean;
  hasAgeGate: boolean;
  hasCookieGate: boolean;
}

interface CheckWebsiteResult {
  httpStatus: number;
  finalUrl: string;
  redirectChain: string[];
  reachability: { status: string; httpStatus: number; internalFlags: string[]; userFacingMessage: string | null };
  html: string;
  bodyText: string;
  signals: WebsiteSignals | null;
}

// ── Benchmark definitions ────────────────────────────────────────────────

interface BenchmarkResult {
  id: string;
  name: string;
  current: number;
  target: number;
  gap: number;
  unit: string;
  passing: boolean;
  detail: string;
  fixes: string[];
}

// ── Module loader (same pattern as run-validation-benchmark.ts) ──────────

function registerSrcAlias(): void {
  const resolverHost = Module as typeof Module & {
    _resolveFilename: (
      request: string,
      parent: NodeJS.Module | null | undefined,
      isMain: boolean,
      options?: unknown,
    ) => string;
  };
  const originalResolve = resolverHost._resolveFilename;
  resolverHost._resolveFilename = function resolveWithSrcAlias(
    request: string,
    parent: NodeJS.Module | null | undefined,
    isMain: boolean,
    options?: unknown,
  ) {
    if (request.startsWith('@/')) {
      const absoluteRequest = path.join(process.cwd(), 'src', request.slice(2));
      return originalResolve.call(this, absoluteRequest, parent, isMain, options);
    }
    return originalResolve.call(this, request, parent, isMain, options);
  };
}

function findJitiPath(): string {
  const pnpmRoot = path.join(process.cwd(), 'node_modules', '.pnpm');
  const candidates = existsSync(pnpmRoot)
    ? readdirSync(pnpmRoot)
        .filter((name) => name.startsWith('jiti@'))
        .map((name) => path.join(pnpmRoot, name, 'node_modules', 'jiti'))
    : [];

  for (const candidate of candidates) {
    for (const relative of ['lib/jiti.cjs', 'dist/jiti.cjs']) {
      const fullPath = path.join(candidate, relative);
      if (existsSync(fullPath)) return fullPath;
    }
  }
  throw new Error('Could not locate jiti in node_modules. Run pnpm install first.');
}

type JitiLoader = (id: string) => Record<string, unknown>;

function createJitiLoader(): JitiLoader {
  registerSrcAlias();
  const require = createRequire(import.meta.url);
  const { createJiti } = require(findJitiPath()) as {
    createJiti: (filename: string, options?: Record<string, unknown>) => JitiLoader;
  };
  return createJiti(import.meta.url, { interopDefault: true });
}

function loadPipeline() {
  const jiti = createJitiLoader();
  const runValidationMod = jiti('../src/lib/website/run-validation.ts');
  const checkWebsiteMod = jiti('../src/lib/website/check-website.ts');
  const normalizeUrlMod = jiti('../src/lib/website/normalize-url.ts');

  return {
    runValidation: runValidationMod.runValidation as (input: {
      website: string;
      restaurantName: string;
      state: string;
    }) => Promise<ValidationResult>,
    checkWebsite: checkWebsiteMod.checkWebsite as (url: string) => Promise<CheckWebsiteResult>,
    normalizeUrl: normalizeUrlMod.normalizeUrl as (raw: string) => { normalizedUrl: string; isValid: boolean },
  };
}

// ── Shared scraping helpers ──────────────────────────────────────────────

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const lastScrapeByDomain = new Map<string, number>();

async function scrapeFetch(url: string): Promise<string | null> {
  const domain = extractDomainFromUrl(url);
  if (domain) {
    const elapsed = Date.now() - (lastScrapeByDomain.get(domain) ?? 0);
    if (elapsed < SCRAPE_DELAY_MS) await sleep(SCRAPE_DELAY_MS - elapsed);
    lastScrapeByDomain.set(domain, Date.now());
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
  try {
    const ua = BROWSER_USER_AGENTS[Math.floor(Math.random() * BROWSER_USER_AGENTS.length)];
    const res = await fetch(url, {
      headers: {
        'User-Agent': ua,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    clearTimeout(timer);
    return null;
  }
}

function canonicalUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = '';
    parsed.search = '';
    parsed.hostname = parsed.hostname.replace(/^www\./, '').toLowerCase();
    parsed.pathname = parsed.pathname.replace(/\/+$/, '') || '/';
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return url.trim().replace(/\/+$/, '').toLowerCase();
  }
}

function extractDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
}

function resolveHref(href: string, base: string): string {
  if (!href) return '';
  if (/^https?:\/\//i.test(href)) return href;
  try { return new URL(href, base).toString(); } catch { return ''; }
}

const CHAIN_DOMAINS = new Set([
  'mcdonalds.com', 'bk.com', 'burgerking.com', 'wendys.com', 'tacobell.com',
  'subway.com', 'chipotle.com', 'chick-fil-a.com', 'kfc.com', 'pizzahut.com',
  'dominos.com', 'starbucks.com', 'dunkindonuts.com', 'dunkin.com',
  'pandaexpress.com', 'panerabread.com', 'sonicdrivein.com', 'jackinthebox.com',
  'arbys.com', 'popeyes.com', 'shakeshack.com', 'fiveguys.com', 'wingstop.com',
  'buffalowildwings.com', 'raisingcanes.com', 'culvers.com', 'in-n-out.com',
  'whataburger.com', 'smashburger.com', 'bojangles.com', 'churchs.com',
  'deltaco.com', 'carlsjr.com', 'hardees.com', 'elpolloloco.com', 'zaxbys.com',
  'applebees.com', 'chilis.com', 'tgifridays.com', 'olivegarden.com',
  'redlobster.com', 'longhornsteakhouse.com', 'outback.com', 'texasroadhouse.com',
  'crackerbarrel.com', 'thecheesecakefactory.com', 'redrobin.com', 'hooters.com',
  'dennys.com', 'ihop.com', 'wafflehouse.com', 'goldencorral.com', 'bobevans.com',
  'noodles.com', 'moes.com', 'qdoba.com', 'cornerbakerycafe.com', 'jasonsdeli.com',
  'mcalistersdeli.com', 'schlotzskys.com', 'firehousesubs.com', 'jimmyjohns.com',
  'potbelly.com', 'jerseymikes.com', 'whichwich.com', 'steaknshake.com',
  'daveandbusters.com',
]);

const PLATFORM_DOMAINS = new Set([
  'yelp.com', 'opentable.com', 'doordash.com', 'ubereats.com', 'grubhub.com',
  'resy.com', 'toasttab.com', 'squareup.com', 'square.site', 'olo.com',
  'tripadvisor.com', 'instagram.com', 'facebook.com', 'twitter.com', 'x.com',
  'tiktok.com', 'linktr.ee', 'linktree.com', 'google.com', 'eater.com',
  'theinfatuation.com', 'foursquare.com', 'zomato.com', 'menufy.com',
  'wixsite.com', 'weebly.com', 'godaddy.com', 'wordpress.com',
]);

function isDirectRestaurantUrl(url: string): boolean {
  const domain = extractDomainFromUrl(url);
  if (!domain) return false;
  if (CHAIN_DOMAINS.has(domain)) return false;
  for (const p of PLATFORM_DOMAINS) {
    if (domain === p || domain.endsWith(`.${p}`)) return false;
  }
  if (domain.endsWith('.gov') || domain.endsWith('.edu')) return false;
  return true;
}

function inferCuisine(name: string): string {
  const n = name.toLowerCase();
  const map: Array<[string, string]> = [
    ['pizza', 'Italian'], ['pasta', 'Italian'], ['trattoria', 'Italian'], ['osteria', 'Italian'],
    ['taco', 'Mexican'], ['taqueria', 'Mexican'], ['cantina', 'Mexican'],
    ['sushi', 'Japanese'], ['ramen', 'Japanese'], ['izakaya', 'Japanese'],
    ['pho', 'Vietnamese'], ['banh', 'Vietnamese'],
    ['thai', 'Thai'], ['chinese', 'Chinese'], ['dim sum', 'Chinese'],
    ['indian', 'Indian'], ['curry', 'Indian'], ['tandoor', 'Indian'],
    ['korean', 'Korean'], ['bbq', 'BBQ'], ['barbecue', 'BBQ'], ['smokehouse', 'BBQ'],
    ['seafood', 'Seafood'], ['oyster', 'Seafood'], ['crab', 'Seafood'],
    ['french', 'French'], ['bistro', 'French'], ['brasserie', 'French'],
    ['greek', 'Greek'], ['mediterranean', 'Mediterranean'],
    ['ethiopian', 'Ethiopian'], ['peruvian', 'Peruvian'],
    ['steakhouse', 'Steakhouse'], ['chophouse', 'Steakhouse'],
    ['cafe', 'Cafe'], ['coffee', 'Cafe'], ['bakery', 'Bakery'],
    ['brewery', 'Brewery'], ['pub', 'Pub'], ['tavern', 'Pub'],
    ['diner', 'American'], ['burger', 'American'], ['grill', 'American'],
  ];
  for (const [kw, cuisine] of map) { if (n.includes(kw)) return cuisine; }
  return 'American';
}

// ── US city list ─────────────────────────────────────────────────────────

interface CityEntry {
  city: string;
  stateCode: string;
  yelpLoc: string;          // "Austin+TX"
  eaterSlug: string | null; // "austin" or null if Eater has no city section
  infatuationSlug: string | null;
}

const US_CITIES: CityEntry[] = [
  { city: 'New York', stateCode: 'NY', yelpLoc: 'New+York+NY', eaterSlug: 'new-york', infatuationSlug: 'new-york' },
  { city: 'Los Angeles', stateCode: 'CA', yelpLoc: 'Los+Angeles+CA', eaterSlug: 'la', infatuationSlug: 'los-angeles' },
  { city: 'Chicago', stateCode: 'IL', yelpLoc: 'Chicago+IL', eaterSlug: 'chicago', infatuationSlug: 'chicago' },
  { city: 'Houston', stateCode: 'TX', yelpLoc: 'Houston+TX', eaterSlug: 'houston', infatuationSlug: 'houston' },
  { city: 'Phoenix', stateCode: 'AZ', yelpLoc: 'Phoenix+AZ', eaterSlug: null, infatuationSlug: null },
  { city: 'Philadelphia', stateCode: 'PA', yelpLoc: 'Philadelphia+PA', eaterSlug: 'philly', infatuationSlug: 'philadelphia' },
  { city: 'San Antonio', stateCode: 'TX', yelpLoc: 'San+Antonio+TX', eaterSlug: null, infatuationSlug: null },
  { city: 'San Diego', stateCode: 'CA', yelpLoc: 'San+Diego+CA', eaterSlug: 'san-diego', infatuationSlug: 'san-diego' },
  { city: 'Dallas', stateCode: 'TX', yelpLoc: 'Dallas+TX', eaterSlug: 'dallas', infatuationSlug: 'dallas' },
  { city: 'Austin', stateCode: 'TX', yelpLoc: 'Austin+TX', eaterSlug: 'austin', infatuationSlug: 'austin' },
  { city: 'San Francisco', stateCode: 'CA', yelpLoc: 'San+Francisco+CA', eaterSlug: 'sf', infatuationSlug: 'san-francisco' },
  { city: 'Seattle', stateCode: 'WA', yelpLoc: 'Seattle+WA', eaterSlug: 'seattle', infatuationSlug: 'seattle' },
  { city: 'Denver', stateCode: 'CO', yelpLoc: 'Denver+CO', eaterSlug: 'denver', infatuationSlug: 'denver' },
  { city: 'Nashville', stateCode: 'TN', yelpLoc: 'Nashville+TN', eaterSlug: 'nashville', infatuationSlug: 'nashville' },
  { city: 'Portland', stateCode: 'OR', yelpLoc: 'Portland+OR', eaterSlug: 'portland', infatuationSlug: 'portland' },
  { city: 'Atlanta', stateCode: 'GA', yelpLoc: 'Atlanta+GA', eaterSlug: 'atlanta', infatuationSlug: 'atlanta' },
  { city: 'Miami', stateCode: 'FL', yelpLoc: 'Miami+FL', eaterSlug: 'miami', infatuationSlug: 'miami' },
  { city: 'New Orleans', stateCode: 'LA', yelpLoc: 'New+Orleans+LA', eaterSlug: 'nola', infatuationSlug: 'new-orleans' },
  { city: 'Boston', stateCode: 'MA', yelpLoc: 'Boston+MA', eaterSlug: 'boston', infatuationSlug: 'boston' },
  { city: 'Minneapolis', stateCode: 'MN', yelpLoc: 'Minneapolis+MN', eaterSlug: 'twin-cities', infatuationSlug: 'minneapolis' },
  { city: 'Detroit', stateCode: 'MI', yelpLoc: 'Detroit+MI', eaterSlug: 'detroit', infatuationSlug: 'detroit' },
  { city: 'Las Vegas', stateCode: 'NV', yelpLoc: 'Las+Vegas+NV', eaterSlug: 'vegas', infatuationSlug: 'las-vegas' },
  { city: 'Washington DC', stateCode: 'DC', yelpLoc: 'Washington+DC', eaterSlug: 'dc', infatuationSlug: 'washington-dc' },
  // — Tier 2 cities (Yelp only, broader coverage) —
  { city: 'Tucson', stateCode: 'AZ', yelpLoc: 'Tucson+AZ', eaterSlug: null, infatuationSlug: null },
  { city: 'Scottsdale', stateCode: 'AZ', yelpLoc: 'Scottsdale+AZ', eaterSlug: null, infatuationSlug: null },
  { city: 'Birmingham', stateCode: 'AL', yelpLoc: 'Birmingham+AL', eaterSlug: null, infatuationSlug: null },
  { city: 'Anchorage', stateCode: 'AK', yelpLoc: 'Anchorage+AK', eaterSlug: null, infatuationSlug: null },
  { city: 'Little Rock', stateCode: 'AR', yelpLoc: 'Little+Rock+AR', eaterSlug: null, infatuationSlug: null },
  { city: 'Sacramento', stateCode: 'CA', yelpLoc: 'Sacramento+CA', eaterSlug: null, infatuationSlug: null },
  { city: 'Oakland', stateCode: 'CA', yelpLoc: 'Oakland+CA', eaterSlug: null, infatuationSlug: null },
  { city: 'Boulder', stateCode: 'CO', yelpLoc: 'Boulder+CO', eaterSlug: null, infatuationSlug: null },
  { city: 'Hartford', stateCode: 'CT', yelpLoc: 'Hartford+CT', eaterSlug: null, infatuationSlug: null },
  { city: 'New Haven', stateCode: 'CT', yelpLoc: 'New+Haven+CT', eaterSlug: null, infatuationSlug: null },
  { city: 'Wilmington', stateCode: 'DE', yelpLoc: 'Wilmington+DE', eaterSlug: null, infatuationSlug: null },
  { city: 'Orlando', stateCode: 'FL', yelpLoc: 'Orlando+FL', eaterSlug: null, infatuationSlug: null },
  { city: 'Tampa', stateCode: 'FL', yelpLoc: 'Tampa+FL', eaterSlug: null, infatuationSlug: null },
  { city: 'Jacksonville', stateCode: 'FL', yelpLoc: 'Jacksonville+FL', eaterSlug: null, infatuationSlug: null },
  { city: 'Savannah', stateCode: 'GA', yelpLoc: 'Savannah+GA', eaterSlug: null, infatuationSlug: null },
  { city: 'Honolulu', stateCode: 'HI', yelpLoc: 'Honolulu+HI', eaterSlug: null, infatuationSlug: null },
  { city: 'Boise', stateCode: 'ID', yelpLoc: 'Boise+ID', eaterSlug: null, infatuationSlug: null },
  { city: 'Indianapolis', stateCode: 'IN', yelpLoc: 'Indianapolis+IN', eaterSlug: null, infatuationSlug: null },
  { city: 'Des Moines', stateCode: 'IA', yelpLoc: 'Des+Moines+IA', eaterSlug: null, infatuationSlug: null },
  { city: 'Wichita', stateCode: 'KS', yelpLoc: 'Wichita+KS', eaterSlug: null, infatuationSlug: null },
  { city: 'Louisville', stateCode: 'KY', yelpLoc: 'Louisville+KY', eaterSlug: null, infatuationSlug: null },
  { city: 'Baton Rouge', stateCode: 'LA', yelpLoc: 'Baton+Rouge+LA', eaterSlug: null, infatuationSlug: null },
  { city: 'Portland', stateCode: 'ME', yelpLoc: 'Portland+ME', eaterSlug: 'maine', infatuationSlug: null },
  { city: 'Baltimore', stateCode: 'MD', yelpLoc: 'Baltimore+MD', eaterSlug: null, infatuationSlug: null },
  { city: 'Cambridge', stateCode: 'MA', yelpLoc: 'Cambridge+MA', eaterSlug: null, infatuationSlug: null },
  { city: 'Grand Rapids', stateCode: 'MI', yelpLoc: 'Grand+Rapids+MI', eaterSlug: null, infatuationSlug: null },
  { city: 'Ann Arbor', stateCode: 'MI', yelpLoc: 'Ann+Arbor+MI', eaterSlug: null, infatuationSlug: null },
  { city: 'Saint Paul', stateCode: 'MN', yelpLoc: 'Saint+Paul+MN', eaterSlug: null, infatuationSlug: null },
  { city: 'Jackson', stateCode: 'MS', yelpLoc: 'Jackson+MS', eaterSlug: null, infatuationSlug: null },
  { city: 'Kansas City', stateCode: 'MO', yelpLoc: 'Kansas+City+MO', eaterSlug: 'kansas-city', infatuationSlug: null },
  { city: 'St. Louis', stateCode: 'MO', yelpLoc: 'St+Louis+MO', eaterSlug: null, infatuationSlug: null },
  { city: 'Billings', stateCode: 'MT', yelpLoc: 'Billings+MT', eaterSlug: null, infatuationSlug: null },
  { city: 'Missoula', stateCode: 'MT', yelpLoc: 'Missoula+MT', eaterSlug: null, infatuationSlug: null },
  { city: 'Omaha', stateCode: 'NE', yelpLoc: 'Omaha+NE', eaterSlug: null, infatuationSlug: null },
  { city: 'Reno', stateCode: 'NV', yelpLoc: 'Reno+NV', eaterSlug: null, infatuationSlug: null },
  { city: 'Manchester', stateCode: 'NH', yelpLoc: 'Manchester+NH', eaterSlug: null, infatuationSlug: null },
  { city: 'Portsmouth', stateCode: 'NH', yelpLoc: 'Portsmouth+NH', eaterSlug: null, infatuationSlug: null },
  { city: 'Newark', stateCode: 'NJ', yelpLoc: 'Newark+NJ', eaterSlug: null, infatuationSlug: null },
  { city: 'Jersey City', stateCode: 'NJ', yelpLoc: 'Jersey+City+NJ', eaterSlug: null, infatuationSlug: null },
  { city: 'Albuquerque', stateCode: 'NM', yelpLoc: 'Albuquerque+NM', eaterSlug: null, infatuationSlug: null },
  { city: 'Santa Fe', stateCode: 'NM', yelpLoc: 'Santa+Fe+NM', eaterSlug: null, infatuationSlug: null },
  { city: 'Buffalo', stateCode: 'NY', yelpLoc: 'Buffalo+NY', eaterSlug: null, infatuationSlug: null },
  { city: 'Charlotte', stateCode: 'NC', yelpLoc: 'Charlotte+NC', eaterSlug: null, infatuationSlug: null },
  { city: 'Raleigh', stateCode: 'NC', yelpLoc: 'Raleigh+NC', eaterSlug: null, infatuationSlug: null },
  { city: 'Asheville', stateCode: 'NC', yelpLoc: 'Asheville+NC', eaterSlug: null, infatuationSlug: null },
  { city: 'Fargo', stateCode: 'ND', yelpLoc: 'Fargo+ND', eaterSlug: null, infatuationSlug: null },
  { city: 'Columbus', stateCode: 'OH', yelpLoc: 'Columbus+OH', eaterSlug: null, infatuationSlug: null },
  { city: 'Cleveland', stateCode: 'OH', yelpLoc: 'Cleveland+OH', eaterSlug: null, infatuationSlug: null },
  { city: 'Cincinnati', stateCode: 'OH', yelpLoc: 'Cincinnati+OH', eaterSlug: null, infatuationSlug: null },
  { city: 'Oklahoma City', stateCode: 'OK', yelpLoc: 'Oklahoma+City+OK', eaterSlug: null, infatuationSlug: null },
  { city: 'Tulsa', stateCode: 'OK', yelpLoc: 'Tulsa+OK', eaterSlug: null, infatuationSlug: null },
  { city: 'Eugene', stateCode: 'OR', yelpLoc: 'Eugene+OR', eaterSlug: null, infatuationSlug: null },
  { city: 'Pittsburgh', stateCode: 'PA', yelpLoc: 'Pittsburgh+PA', eaterSlug: null, infatuationSlug: null },
  { city: 'Providence', stateCode: 'RI', yelpLoc: 'Providence+RI', eaterSlug: null, infatuationSlug: null },
  { city: 'Charleston', stateCode: 'SC', yelpLoc: 'Charleston+SC', eaterSlug: null, infatuationSlug: null },
  { city: 'Greenville', stateCode: 'SC', yelpLoc: 'Greenville+SC', eaterSlug: null, infatuationSlug: null },
  { city: 'Sioux Falls', stateCode: 'SD', yelpLoc: 'Sioux+Falls+SD', eaterSlug: null, infatuationSlug: null },
  { city: 'Memphis', stateCode: 'TN', yelpLoc: 'Memphis+TN', eaterSlug: null, infatuationSlug: null },
  { city: 'Knoxville', stateCode: 'TN', yelpLoc: 'Knoxville+TN', eaterSlug: null, infatuationSlug: null },
  { city: 'El Paso', stateCode: 'TX', yelpLoc: 'El+Paso+TX', eaterSlug: null, infatuationSlug: null },
  { city: 'Salt Lake City', stateCode: 'UT', yelpLoc: 'Salt+Lake+City+UT', eaterSlug: null, infatuationSlug: null },
  { city: 'Burlington', stateCode: 'VT', yelpLoc: 'Burlington+VT', eaterSlug: null, infatuationSlug: null },
  { city: 'Richmond', stateCode: 'VA', yelpLoc: 'Richmond+VA', eaterSlug: null, infatuationSlug: null },
  { city: 'Virginia Beach', stateCode: 'VA', yelpLoc: 'Virginia+Beach+VA', eaterSlug: null, infatuationSlug: null },
  { city: 'Tacoma', stateCode: 'WA', yelpLoc: 'Tacoma+WA', eaterSlug: null, infatuationSlug: null },
  { city: 'Spokane', stateCode: 'WA', yelpLoc: 'Spokane+WA', eaterSlug: null, infatuationSlug: null },
  { city: 'Charleston', stateCode: 'WV', yelpLoc: 'Charleston+WV', eaterSlug: null, infatuationSlug: null },
  { city: 'Milwaukee', stateCode: 'WI', yelpLoc: 'Milwaukee+WI', eaterSlug: null, infatuationSlug: null },
  { city: 'Madison', stateCode: 'WI', yelpLoc: 'Madison+WI', eaterSlug: null, infatuationSlug: null },
  { city: 'Cheyenne', stateCode: 'WY', yelpLoc: 'Cheyenne+WY', eaterSlug: null, infatuationSlug: null },
];

// ── SOURCE 1: Yelp search scraping ───────────────────────────────────────

function extractYelpBizSlugs(html: string): string[] {
  const slugs: string[] = [];
  const matches = html.matchAll(/href="\/biz\/([\w-]+)"/gi);
  for (const m of matches) {
    const slug = m[1];
    if (slug && !slug.includes('ad_business') && !slugs.includes(slug)) {
      slugs.push(slug);
    }
  }
  return [...new Set(slugs)].slice(0, 20);
}

function extractYelpExternalUrl(html: string): string | null {
  const redir = html.match(/href="\/biz_redir\?url=([^&"]+)/);
  if (redir) {
    try { return decodeURIComponent(redir[1]); } catch { /* ignore */ }
  }
  const jsonLdBlocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item.url && !item.url.includes('yelp.com')) return item.url;
      }
    } catch { /* ignore */ }
  }
  return null;
}

function extractYelpBizName(html: string): string {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
  if (og) return og[1].replace(/ - Yelp$/, '').trim();
  const title = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  if (title) return title[1].replace(/ - Yelp$/, '').trim();
  return '';
}

async function collectFromYelp(
  cities: CityEntry[],
  seenDomains: Set<string>,
  onProgress: (source: string, count: number) => void,
): Promise<RestaurantCandidate[]> {
  const candidates: RestaurantCandidate[] = [];
  let totalScraped = 0;
  let failedSearchPages = 0;

  for (const city of cities) {
    for (let start = 0; start <= 90; start += 10) {
      const searchUrl = `https://www.yelp.com/search?find_desc=Restaurants&find_loc=${city.yelpLoc}&start=${start}`;
      const searchHtml = await scrapeFetch(searchUrl);
      if (!searchHtml) {
        failedSearchPages++;
        onProgress('yelp', totalScraped);
        if (failedSearchPages >= 25 && totalScraped === 0) {
          console.log('\n[COLLECT] yelp: stopping early after 25 blocked/empty search pages.');
          return candidates;
        }
        continue;
      }
      failedSearchPages = 0;

      const bizSlugs = extractYelpBizSlugs(searchHtml);
      for (const slug of bizSlugs) {
        await sleep(SCRAPE_DELAY_MS);
        const bizUrl = `https://www.yelp.com/biz/${slug}`;
        const bizHtml = await scrapeFetch(bizUrl);
        if (!bizHtml) continue;

        const externalUrl = extractYelpExternalUrl(bizHtml);
        if (!externalUrl || !isDirectRestaurantUrl(externalUrl)) continue;

        const domain = extractDomainFromUrl(externalUrl);
        if (!domain || seenDomains.has(domain)) continue;
        seenDomains.add(domain);

        const name = extractYelpBizName(bizHtml);
        candidates.push({
          url: externalUrl,
          name: name || slug.replace(/-/g, ' '),
          city: city.city,
          state: city.stateCode,
          cuisine: inferCuisine(name || slug),
          source: 'yelp',
          address: `${city.city}, ${city.stateCode}`,
        });
        totalScraped++;
      }
      onProgress('yelp', totalScraped);
    }
  }
  return candidates;
}

// ── SOURCE 2: OpenTable scraping ─────────────────────────────────────────

const OPENTABLE_METROS: Array<{ id: number; city: string; stateCode: string }> = [
  { id: 4, city: 'New York', stateCode: 'NY' },
  { id: 72, city: 'San Francisco', stateCode: 'CA' },
  { id: 8, city: 'Chicago', stateCode: 'IL' },
  { id: 14, city: 'Boston', stateCode: 'MA' },
  { id: 7, city: 'Los Angeles', stateCode: 'CA' },
  { id: 2, city: 'Atlanta', stateCode: 'GA' },
  { id: 6, city: 'Dallas', stateCode: 'TX' },
  { id: 10, city: 'Denver', stateCode: 'CO' },
  { id: 16, city: 'Houston', stateCode: 'TX' },
  { id: 13, city: 'Las Vegas', stateCode: 'NV' },
  { id: 11, city: 'Miami', stateCode: 'FL' },
  { id: 17, city: 'Minneapolis', stateCode: 'MN' },
  { id: 15, city: 'Nashville', stateCode: 'TN' },
  { id: 9, city: 'New Orleans', stateCode: 'LA' },
  { id: 12, city: 'Philadelphia', stateCode: 'PA' },
  { id: 18, city: 'Phoenix', stateCode: 'AZ' },
  { id: 3, city: 'Portland', stateCode: 'OR' },
  { id: 5, city: 'Seattle', stateCode: 'WA' },
  { id: 19, city: 'San Diego', stateCode: 'CA' },
  { id: 1, city: 'Washington DC', stateCode: 'DC' },
];

function extractOpenTableRestaurantSlugs(html: string): string[] {
  const slugs: string[] = [];
  const matches = html.matchAll(/href="\/r\/([\w-]+)"/gi);
  for (const m of matches) { if (m[1]) slugs.push(m[1]); }
  return [...new Set(slugs)].slice(0, 30);
}

function extractOpenTableExternalUrl(html: string): string | null {
  const websiteLink = html.match(/href="(https?:\/\/[^"]+)"[^>]*>\s*(?:Restaurant Website|Website)\s*</i);
  if (websiteLink) return websiteLink[1];
  const jsonLdBlocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type'] === 'Restaurant' && item.url && !item.url.includes('opentable.com')) return item.url;
      }
    } catch { /* ignore */ }
  }
  return null;
}

async function collectFromOpenTable(
  seenDomains: Set<string>,
  onProgress: (source: string, count: number) => void,
): Promise<RestaurantCandidate[]> {
  const candidates: RestaurantCandidate[] = [];
  let total = 0;

  const knownMetros = new Map(OPENTABLE_METROS.map((metro) => [metro.id, metro]));

  for (let metroId = 1; metroId <= 200; metroId++) {
    const metro = knownMetros.get(metroId) ?? { id: metroId, city: `Metro ${metroId}`, stateCode: '' };
    const searchUrl = `https://www.opentable.com/s/?metroId=${metro.id}&covers=2`;
    const html = await scrapeFetch(searchUrl);
    if (!html) { await sleep(SCRAPE_DELAY_MS); continue; }

    const slugs = extractOpenTableRestaurantSlugs(html);
    for (const slug of slugs) {
      await sleep(SCRAPE_DELAY_MS);
      const profileUrl = `https://www.opentable.com/r/${slug}`;
      const profileHtml = await scrapeFetch(profileUrl);
      if (!profileHtml) continue;

      const externalUrl = extractOpenTableExternalUrl(profileHtml);
      if (!externalUrl || !isDirectRestaurantUrl(externalUrl)) continue;

      const domain = extractDomainFromUrl(externalUrl);
      if (!domain || seenDomains.has(domain)) continue;
      seenDomains.add(domain);

      const name = slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      candidates.push({
        url: externalUrl, name, city: metro.city, state: metro.stateCode,
        cuisine: inferCuisine(name), source: 'opentable', address: `${metro.city}, ${metro.stateCode}`,
      });
      total++;
    }
    onProgress('opentable', total);
    await sleep(SCRAPE_DELAY_MS);
  }
  return candidates;
}

// ── SOURCE 3: Eater city guides ──────────────────────────────────────────

function extractExternalRestaurantLinks(html: string, baseUrl: string): Array<{ name: string; url: string }> {
  const results: Array<{ name: string; url: string }> = [];
  const links = html.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi);
  for (const m of links) {
    const href = resolveHref(m[1], baseUrl);
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    if (!href || !text || text.length > 80 || text.length < 2) continue;
    if (!isDirectRestaurantUrl(href)) continue;
    results.push({ name: text, url: href });
  }
  return results;
}

async function collectFromEater(
  cities: CityEntry[],
  seenDomains: Set<string>,
  onProgress: (source: string, count: number) => void,
): Promise<RestaurantCandidate[]> {
  const candidates: RestaurantCandidate[] = [];
  let total = 0;

  const eaterCities = cities.filter((c) => c.eaterSlug);
  const guidePatterns = [
    (slug: string) => `https://www.eater.com/maps/best-restaurants-${slug}`,
    (slug: string) => `https://www.eater.com/maps/best-new-restaurants-${slug}`,
    (slug: string) => `https://www.eater.com/${slug}/maps/best-restaurants-${slug}`,
    (slug: string) => `https://www.eater.com/${slug}/maps/best-new-restaurants-${slug}`,
    (slug: string) => `https://www.eater.com/${slug}/maps/best-restaurants`,
    (slug: string) => `https://www.eater.com/${slug}/maps/best-new-restaurants`,
  ];

  for (const city of eaterCities) {
    const slug = city.eaterSlug!;
    for (const pattern of guidePatterns) {
      const url = pattern(slug);
      await sleep(SCRAPE_DELAY_MS);
      const html = await scrapeFetch(url);
      if (!html || html.length < 2000) continue;

      const links = extractExternalRestaurantLinks(html, url);
      for (const link of links) {
        const domain = extractDomainFromUrl(link.url);
        if (!domain || seenDomains.has(domain)) continue;
        seenDomains.add(domain);
        candidates.push({
          url: link.url, name: link.name, city: city.city, state: city.stateCode,
          cuisine: inferCuisine(link.name), source: 'eater',
          address: `${city.city}, ${city.stateCode}`,
        });
        total++;
      }
    }
    onProgress('eater', total);
  }
  return candidates;
}

// ── SOURCE 4: The Infatuation guides ─────────────────────────────────────

async function collectFromInfatuation(
  cities: CityEntry[],
  seenDomains: Set<string>,
  onProgress: (source: string, count: number) => void,
): Promise<RestaurantCandidate[]> {
  const candidates: RestaurantCandidate[] = [];
  let total = 0;

  const infCities = cities.filter((c) => c.infatuationSlug);
  const guidePatterns = [
    (slug: string) => `https://www.theinfatuation.com/${slug}/guides/best-${slug}-restaurants`,
    (slug: string) => `https://www.theinfatuation.com/${slug}/guides/best-new-restaurants-${slug}`,
    (slug: string) => `https://www.theinfatuation.com/${slug}/guides/best-restaurants`,
    (slug: string) => `https://www.theinfatuation.com/${slug}/guides`,
  ];

  for (const city of infCities) {
    const slug = city.infatuationSlug!;
    for (const pattern of guidePatterns) {
      const url = pattern(slug);
      await sleep(SCRAPE_DELAY_MS);
      const html = await scrapeFetch(url);
      if (!html || html.length < 2000) continue;

      const links = extractExternalRestaurantLinks(html, url);
      for (const link of links) {
        const domain = extractDomainFromUrl(link.url);
        if (!domain || seenDomains.has(domain)) continue;
        seenDomains.add(domain);
        candidates.push({
          url: link.url, name: link.name, city: city.city, state: city.stateCode,
          cuisine: inferCuisine(link.name), source: 'infatuation',
          address: `${city.city}, ${city.stateCode}`,
        });
        total++;
      }
    }
    onProgress('infatuation', total);
  }
  return candidates;
}

// ── SOURCE 5: Seed URLs ─────────────────────────────────────────────────

function loadSeedUrls(): RestaurantCandidate[] {
  const seeds: RestaurantCandidate[] = [];
  const datasetPath = path.join(process.cwd(), 'scripts', 'validation-dataset.json');
  if (existsSync(datasetPath)) {
    try {
      const dataset = JSON.parse(readFileSync(datasetPath, 'utf8')) as {
        restaurants: Array<{
          url: string;
          name: string;
          city?: string;
          state?: string;
          cuisine?: string;
          source?: string;
        }>;
      };
      for (const entry of dataset.restaurants) {
        seeds.push({
          url: entry.url, name: entry.name,
          city: entry.city ?? '', state: entry.state ?? '',
          cuisine: entry.cuisine ?? inferCuisine(entry.name),
          source: (entry.source as UrlSource | undefined) ?? 'seed',
          address: [entry.city, entry.state].filter(Boolean).join(', '),
        });
      }
    } catch { /* ignore */ }
  }
  const seedUrlsPath = path.join(process.cwd(), 'scripts', 'seed-urls.json');
  if (existsSync(seedUrlsPath)) {
    try {
      const data = JSON.parse(readFileSync(seedUrlsPath, 'utf8')) as RestaurantCandidate[];
      seeds.push(...data);
    } catch { /* ignore */ }
  }
  return seeds;
}

function loadDatasetCities(): CityEntry[] {
  const datasetPath = path.join(process.cwd(), 'scripts', 'validation-dataset.json');
  if (!existsSync(datasetPath)) return [];
  try {
    const dataset = JSON.parse(readFileSync(datasetPath, 'utf8')) as {
      restaurants?: Array<{ city?: string; state?: string }>;
    };
    const cities = new Map<string, CityEntry>();
    for (const entry of dataset.restaurants ?? []) {
      if (!entry.city || !entry.state) continue;
      const key = `${entry.city},${entry.state}`.toLowerCase();
      if (cities.has(key)) continue;
      cities.set(key, {
        city: entry.city,
        stateCode: entry.state,
        yelpLoc: `${encodeURIComponent(entry.city).replace(/%20/g, '+')}+${entry.state}`,
        eaterSlug: null,
        infatuationSlug: null,
      });
    }
    return [...cities.values()];
  } catch {
    return [];
  }
}

function buildExpandedCities(limit = 300): CityEntry[] {
  const cities = new Map<string, CityEntry>();
  for (const city of [...US_CITIES, ...loadDatasetCities()]) {
    const key = `${city.city},${city.stateCode}`.toLowerCase();
    if (!cities.has(key)) cities.set(key, city);
    if (cities.size >= limit) break;
  }
  return [...cities.values()];
}

function addCandidate(
  candidates: RestaurantCandidate[],
  seenDomains: Set<string>,
  candidate: RestaurantCandidate,
): boolean {
  if (!candidate.url || !isDirectRestaurantUrl(candidate.url)) return false;
  const domain = extractDomainFromUrl(candidate.url);
  if (!domain || seenDomains.has(domain)) return false;
  seenDomains.add(domain);
  candidates.push(candidate);
  return true;
}

function extractGoogleResultUrls(html: string): string[] {
  const urls: string[] = [];
  const redirectMatches = html.matchAll(/\/url\?q=(https?:\/\/[^&"']+)/g);
  for (const match of redirectMatches) {
    try { urls.push(decodeURIComponent(match[1])); } catch { /* ignore */ }
  }
  const directMatches = html.matchAll(/href=["'](https?:\/\/[^"']+)["']/g);
  for (const match of directMatches) urls.push(match[1]);
  return [...new Set(urls)]
    .filter((url) => isDirectRestaurantUrl(url))
    .filter((url) => !/[?&](utm_|fbclid=|gclid=)/i.test(url));
}

async function collectFromGoogleSearch(
  cities: CityEntry[],
  seenDomains: Set<string>,
  source: UrlSource,
  queryBuilders: Array<(city: CityEntry) => string>,
  onProgress: (source: string, count: number) => void,
  maxCities = 300,
): Promise<RestaurantCandidate[]> {
  const candidates: RestaurantCandidate[] = [];
  let total = 0;
  for (const city of cities.slice(0, maxCities)) {
    for (const buildQuery of queryBuilders) {
      const query = buildQuery(city);
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}&num=20`;
      const html = await scrapeFetch(url);
      if (!html) continue;
      for (const resultUrl of extractGoogleResultUrls(html)) {
        const name = extractDomainFromUrl(resultUrl).split('.')[0]?.replace(/[-_]/g, ' ') || 'Restaurant';
        if (addCandidate(candidates, seenDomains, {
          url: resultUrl,
          name,
          city: city.city,
          state: city.stateCode,
          cuisine: inferCuisine(name),
          source,
          address: `${city.city}, ${city.stateCode}`,
        })) {
          total++;
        }
      }
    }
    onProgress(source, total);
  }
  return candidates;
}

const TRIPADVISOR_CITY_PAGES = [
  { city: 'New York', stateCode: 'NY', url: 'https://www.tripadvisor.com/Restaurants-g60763-New_York_City_New_York.html' },
  { city: 'Los Angeles', stateCode: 'CA', url: 'https://www.tripadvisor.com/Restaurants-g32655-Los_Angeles_California.html' },
  { city: 'Chicago', stateCode: 'IL', url: 'https://www.tripadvisor.com/Restaurants-g35805-Chicago_Illinois.html' },
  { city: 'Houston', stateCode: 'TX', url: 'https://www.tripadvisor.com/Restaurants-g56003-Houston_Texas.html' },
  { city: 'Phoenix', stateCode: 'AZ', url: 'https://www.tripadvisor.com/Restaurants-g31310-Phoenix_Arizona.html' },
  { city: 'Philadelphia', stateCode: 'PA', url: 'https://www.tripadvisor.com/Restaurants-g60795-Philadelphia_Pennsylvania.html' },
  { city: 'San Antonio', stateCode: 'TX', url: 'https://www.tripadvisor.com/Restaurants-g60956-San_Antonio_Texas.html' },
  { city: 'San Diego', stateCode: 'CA', url: 'https://www.tripadvisor.com/Restaurants-g60750-San_Diego_California.html' },
  { city: 'Dallas', stateCode: 'TX', url: 'https://www.tripadvisor.com/Restaurants-g55711-Dallas_Texas.html' },
  { city: 'Austin', stateCode: 'TX', url: 'https://www.tripadvisor.com/Restaurants-g30196-Austin_Texas.html' },
  { city: 'Seattle', stateCode: 'WA', url: 'https://www.tripadvisor.com/Restaurants-g60878-Seattle_Washington.html' },
  { city: 'Denver', stateCode: 'CO', url: 'https://www.tripadvisor.com/Restaurants-g33388-Denver_Colorado.html' },
  { city: 'Nashville', stateCode: 'TN', url: 'https://www.tripadvisor.com/Restaurants-g55229-Nashville_Davidson_County_Tennessee.html' },
  { city: 'Portland', stateCode: 'OR', url: 'https://www.tripadvisor.com/Restaurants-g52024-Portland_Oregon.html' },
  { city: 'Atlanta', stateCode: 'GA', url: 'https://www.tripadvisor.com/Restaurants-g60898-Atlanta_Georgia.html' },
  { city: 'Miami', stateCode: 'FL', url: 'https://www.tripadvisor.com/Restaurants-g34438-Miami_Florida.html' },
  { city: 'New Orleans', stateCode: 'LA', url: 'https://www.tripadvisor.com/Restaurants-g60864-New_Orleans_Louisiana.html' },
  { city: 'Boston', stateCode: 'MA', url: 'https://www.tripadvisor.com/Restaurants-g60745-Boston_Massachusetts.html' },
  { city: 'Minneapolis', stateCode: 'MN', url: 'https://www.tripadvisor.com/Restaurants-g43323-Minneapolis_Minnesota.html' },
  { city: 'Las Vegas', stateCode: 'NV', url: 'https://www.tripadvisor.com/Restaurants-g45963-Las_Vegas_Nevada.html' },
];

function extractTripAdvisorRestaurantLinks(html: string, baseUrl: string): string[] {
  const links = [...html.matchAll(/href=["']([^"']*Restaurant_Review[^"']+)["']/g)]
    .map((match) => resolveHref(match[1], baseUrl))
    .filter(Boolean);
  return [...new Set(links)].slice(0, 40);
}

function extractTripAdvisorExternalUrl(html: string): string | null {
  const redirect = html.match(/redirectTo=([^&"']+)/i);
  if (redirect) {
    try { return decodeURIComponent(redirect[1]); } catch { /* ignore */ }
  }
  const website = html.match(/"website"\s*:\s*"([^"]+)"/i)
    ?? html.match(/"url"\s*:\s*"(https?:\/\/(?!www\.tripadvisor\.com)[^"]+)"/i);
  return website?.[1]?.replace(/\\\//g, '/') ?? null;
}

async function collectFromTripAdvisor(
  seenDomains: Set<string>,
  onProgress: (source: string, count: number) => void,
): Promise<RestaurantCandidate[]> {
  const candidates: RestaurantCandidate[] = [];
  let total = 0;
  for (const city of TRIPADVISOR_CITY_PAGES) {
    const html = await scrapeFetch(city.url);
    if (!html) continue;
    for (const reviewUrl of extractTripAdvisorRestaurantLinks(html, city.url)) {
      const reviewHtml = await scrapeFetch(reviewUrl);
      if (!reviewHtml) continue;
      const externalUrl = extractTripAdvisorExternalUrl(reviewHtml);
      if (!externalUrl) continue;
      const title = reviewHtml.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1]?.replace(/[-|].*$/, '').trim();
      const name = title || extractDomainFromUrl(externalUrl).split('.')[0]?.replace(/[-_]/g, ' ') || 'Restaurant';
      if (addCandidate(candidates, seenDomains, {
        url: externalUrl,
        name,
        city: city.city,
        state: city.stateCode,
        cuisine: inferCuisine(name),
        source: 'tripadvisor',
        address: `${city.city}, ${city.stateCode}`,
      })) {
        total++;
      }
    }
    onProgress('tripadvisor', total);
  }
  return candidates;
}

// ── Independent signal detectors (broader than pipeline, for benchmarks) ─

function independentlyHasSchemaOrg(html: string): boolean {
  const restaurantTypes = [
    'Restaurant', 'FoodEstablishment', 'CafeOrCoffeeShop', 'FastFoodRestaurant',
    'BarOrPub', 'Bakery', 'IceCreamShop', 'Winery', 'Brewery',
  ];
  for (const t of restaurantTypes) {
    if (html.includes(`"@type":"${t}"`) || html.includes(`"@type": "${t}"`) ||
        html.includes(`"@type":"[`) || // arrays like ["Restaurant","FoodEstablishment"]
        html.includes(`itemtype="https://schema.org/${t}"`) ||
        html.includes(`itemtype="http://schema.org/${t}"`)) {
      return true;
    }
  }
  return false;
}

function independentlyHasMenuNav(html: string): boolean {
  const lower = html.toLowerCase();
  // Any <a> tag with menu-related text or href
  if (/<a[^>]*href=[^>]*\/menu/i.test(html)) return true;
  if (/<a[^>]*>[^<]*(menu|our food|dinner menu|lunch menu|food & drink|drinks?)[^<]*<\/a>/i.test(html)) return true;
  // Also check for nav elements with "menu" (not "main menu" or "hamburger menu" etc.)
  if (/<nav[\s\S]*?<a[^>]*>[^<]*\bmenu\b[^<]*<\/a>[\s\S]*?<\/nav>/i.test(html)) return true;
  // Body text: "view our menu", "see our menu"
  if (/(?:view|see|browse|check out)\s+(?:our|the)\s+menu/i.test(lower)) return true;
  return false;
}

function independentlyHasReservations(html: string): boolean {
  // OpenTable / Resy embeds
  if (/opentable\.com/i.test(html) || /resy\.com/i.test(html)) return true;
  // Links or buttons with reservation language
  if (/<a[^>]*>[^<]*(reserv|book a table|book now|make a reservation)[^<]*<\/a>/i.test(html)) return true;
  if (/<button[^>]*>[^<]*(reserv|book a table|book now)[^<]*<\/button>/i.test(html)) return true;
  if (/<a[^>]*href=[^>]*\/(reserv|book)/i.test(html)) return true;
  return false;
}

// ── Diagnosis helpers ────────────────────────────────────────────────────

const ALL_SIGNAL_NAMES = [
  'restaurant_schema', 'menu_nav', 'reservations_nav', 'order_online_nav',
  'catering_nav', 'private_dining_nav', 'dine_in_text', 'happy_hour_text',
  'brunch_text', 'tasting_menu_text', 'outdoor_seating_text', 'full_bar_text',
  'opentable_link', 'resy_link', 'yelp_link', 'doordash_link', 'ubereats_link',
  'grubhub_link', 'domain_keyword', 'cuisine_text', 'menu_text', 'chef_text',
  'hours_pattern', 'phone_number', 'age_gate', 'og_image', 'schema_org',
  'meta_description',
];

function detectSignalsFound(signals: WebsiteSignals | null): string[] {
  if (!signals) return [];
  const found: string[] = [];
  if (signals.hasRestaurantSchema) found.push('restaurant_schema');
  if (signals.navLinkTexts.some((t) => t.includes('menu'))) found.push('menu_nav');
  if (signals.navLinkTexts.some((t) => t.includes('reservation'))) found.push('reservations_nav');
  if (signals.navLinkTexts.some((t) => t.includes('order'))) found.push('order_online_nav');
  if (signals.navLinkTexts.some((t) => t.includes('catering'))) found.push('catering_nav');
  if (signals.navLinkTexts.some((t) => t.includes('private dining'))) found.push('private_dining_nav');
  const bodyLower = signals.bodyText.toLowerCase();
  if (bodyLower.includes('dine-in') || bodyLower.includes('dine in')) found.push('dine_in_text');
  if (bodyLower.includes('happy hour')) found.push('happy_hour_text');
  if (bodyLower.includes('brunch')) found.push('brunch_text');
  if (bodyLower.includes('tasting menu')) found.push('tasting_menu_text');
  if (bodyLower.includes('outdoor seating') || bodyLower.includes('rooftop')) found.push('outdoor_seating_text');
  if (bodyLower.includes('full bar')) found.push('full_bar_text');
  for (const link of signals.socialLinks) {
    if (link.includes('opentable.com')) found.push('opentable_link');
    if (link.includes('resy.com')) found.push('resy_link');
    if (link.includes('yelp.com')) found.push('yelp_link');
    if (link.includes('doordash.com')) found.push('doordash_link');
    if (link.includes('ubereats.com')) found.push('ubereats_link');
    if (link.includes('grubhub.com')) found.push('grubhub_link');
  }
  if (/(?:mon|tue|wed|thu|fri|sat|sun)[\s\S]{0,30}(?:\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm))/i.test(signals.bodyText)) found.push('hours_pattern');
  if (/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(signals.bodyText)) found.push('phone_number');
  if (signals.hasAgeGate) found.push('age_gate');
  if (signals.ogImage) found.push('og_image');
  if (signals.schemaOrgTypes.length > 0) found.push('schema_org');
  if (signals.metaDescription) found.push('meta_description');
  const cuisineKw = ['pizza', 'burger', 'taco', 'sushi', 'bbq', 'pasta', 'seafood', 'wings', 'sandwich'];
  if (cuisineKw.some((k) => bodyLower.includes(k))) found.push('cuisine_text');
  if (bodyLower.includes('menu')) found.push('menu_text');
  if (bodyLower.includes('chef')) found.push('chef_text');
  return [...new Set(found)];
}

function detectSignalsMissing(found: string[]): string[] {
  const s = new Set(found);
  return ALL_SIGNAL_NAMES.filter((n) => !s.has(n));
}

function categorizeFailure(result: ValidationResult, signals: WebsiteSignals | null, htmlLen: number): string {
  const f = result.internalFlags;
  if (result.nationalChainScore >= 85) return 'false_chain_detection';
  if (f.includes('connection_timeout') || f.includes('request_timeout')) return 'timeout';
  if (f.includes('cloudflare_error') || f.includes('http_403') || f.includes('http_503') || (signals?.hasBotProtection ?? false)) return 'cloudflare_blocked';
  if (result.websiteReachabilityStatus === 'thin' || (htmlLen > 0 && htmlLen < 300)) return 'minimal_html';
  if (htmlLen > 0 && htmlLen < 1000 && signals && !signals.bodyText.trim()) return 'js_rendered';
  if (signals?.bodyText && /[一-鿿぀-ゟ゠-ヿЀ-ӿ؀-ۿ]/.test(signals.bodyText.slice(0, 500))) return 'non_english';
  if (result.restaurantSignalScore < 60) return 'low_signal_score';
  return 'other';
}

function buildSpecificReason(result: ValidationResult, signals: WebsiteSignals | null, found: string[], missing: string[], htmlLen: number): string {
  const p: string[] = [];
  if (result.restaurantSignalScore < 60) p.push(`restaurantSignalScore ${result.restaurantSignalScore} below threshold of 60`);
  if (result.negativeSignalScore >= 40) p.push(`negativeSignalScore ${result.negativeSignalScore} above 40`);
  if (found.length > 0) p.push(`Found ${found.length} signals: ${found.slice(0, 5).join(', ')}`);
  const keyMissing = missing.filter((s) => ['restaurant_schema', 'menu_nav', 'reservations_nav', 'hours_pattern', 'cuisine_text'].includes(s));
  if (keyMissing.length > 0) p.push(`Missing key signals: ${keyMissing.join(', ')}`);
  if (result.websiteReachabilityStatus !== 'reachable') p.push(`reachability: ${result.websiteReachabilityStatus}`);
  if (htmlLen > 0 && htmlLen < 500) p.push(`thin HTML (${htmlLen} chars)`);
  if (result.nationalChainScore >= 50) p.push(`nationalChainScore: ${result.nationalChainScore}`);
  return p.join('. ') || `finalDecision: ${result.finalDecision}`;
}

async function diagnoseFailure(
  candidate: RestaurantCandidate, result: ValidationResult,
  diag: CheckWebsiteResult | null, timeTakenMs: number,
): Promise<FailureRecord> {
  const signals = diag?.signals ?? null;
  const htmlLen = diag?.html?.length ?? 0;
  const found = detectSignalsFound(signals);
  const missing = detectSignalsMissing(found);
  return {
    url: candidate.url, restaurantName: candidate.name,
    city: candidate.city, state: candidate.state, cuisine: candidate.cuisine,
    thirdPartySource: candidate.source,
    finalDecision: result.finalDecision, httpStatus: result.httpStatus,
    restaurantSignalScore: result.restaurantSignalScore, negativeSignalScore: result.negativeSignalScore,
    signalsFound: found, signalsMissing: missing,
    fetchSucceeded: result.httpStatus > 0, htmlLength: htmlLen,
    hasCloudflare: signals?.hasBotProtection ?? result.internalFlags.some((f) => f.includes('cloudflare')),
    hasSchemaOrg: (signals?.schemaOrgTypes?.length ?? 0) > 0,
    hasOpenGraph: !!(signals?.ogTitle || signals?.ogImage),
    failureCategory: categorizeFailure(result, signals, htmlLen),
    specificFailureReason: buildSpecificReason(result, signals, found, missing, htmlLen),
    reachabilityStatus: result.websiteReachabilityStatus,
    nationalChainScore: result.nationalChainScore,
    internalFlags: result.internalFlags, reasons: result.reasons,
    timeTakenMs,
  };
}

// ── Benchmark computation ────────────────────────────────────────────────

interface DiagnosticSignals {
  html: string;
  pipelineDetectedSchema: boolean;
  pipelineDetectedMenu: boolean;
  pipelineDetectedReservations: boolean;
  independentSchema: boolean;
  independentMenu: boolean;
  independentReservations: boolean;
}

function computeBenchmarks(
  failures: FailureRecord[],
  passes: LightPassRecord[],
  failureDiagnostics: Map<string, DiagnosticSignals>,
  nonRestaurantFalsePositives: number,
  nonRestaurantTotal: number,
): BenchmarkResult[] {
  const totalTested = failures.length + passes.length;
  const benchmarks: BenchmarkResult[] = [];

  // B1 — True Positive Rate
  const tpr = totalTested > 0 ? (passes.length / totalTested) * 100 : 0;
  benchmarks.push({
    id: 'B1', name: 'True Positive Rate',
    current: round2(tpr), target: 95, gap: round2(95 - tpr), unit: '%',
    passing: tpr >= 95,
    detail: `${passes.length} verified out of ${totalTested} real restaurants tested`,
    fixes: tpr < 95 ? [
      'Lower verified_restaurant threshold from 60 to 45 in applyDecisionRules()',
      'Expand computeProtectedRestaurantContextScore() for blocked/thin sites',
    ] : [],
  });

  // B2 — Signal Score Distribution (% scoring >= 50)
  const allScores = [
    ...passes.map((p) => p.restaurantSignalScore),
    ...failures.map((f) => f.restaurantSignalScore),
  ];
  const above50 = allScores.filter((s) => s >= 50).length;
  const scorePct = totalTested > 0 ? (above50 / totalTested) * 100 : 0;
  benchmarks.push({
    id: 'B2', name: 'Signal Score >= 50',
    current: round2(scorePct), target: 95, gap: round2(95 - scorePct), unit: '%',
    passing: scorePct >= 95,
    detail: `${above50} of ${totalTested} restaurants scored 50 or above`,
    fixes: scorePct < 95 ? [
      'Increase menu nav weight from 15 to 25',
      'Increase hours pattern weight from 12 to 20',
      'Add og:type restaurant as strong positive (+15)',
    ] : [],
  });

  // B3 — Schema.org Detection Rate
  let schemaTotal = 0, schemaDetected = 0;
  for (const [, d] of failureDiagnostics) {
    if (d.independentSchema) {
      schemaTotal++;
      if (d.pipelineDetectedSchema) schemaDetected++;
    }
  }
  // Passes with schema detected count as correctly detected
  const passSchemaCount = passes.length; // conservative: assume passes had schema if they passed
  // Better: we don't know, so report failure-only rate and note methodology
  const schemaRate = schemaTotal > 0 ? (schemaDetected / schemaTotal) * 100 : 100;
  benchmarks.push({
    id: 'B3', name: 'Schema.org Detection Rate',
    current: round2(schemaRate), target: 80, gap: round2(80 - schemaRate), unit: '%',
    passing: schemaRate >= 80,
    detail: `${schemaDetected} of ${schemaTotal} failed sites with Schema.org markup were detected by pipeline (failures only)`,
    fixes: schemaRate < 80 ? [
      'Extend extractSchemaOrgTypes() to handle nested @graph with "Restaurant" subnodes',
      'Add broader microdata itemtype detection patterns',
    ] : [],
  });

  // B4 — Menu Navigation Detection Rate
  let menuTotal = 0, menuDetected = 0;
  for (const [, d] of failureDiagnostics) {
    if (d.independentMenu) {
      menuTotal++;
      if (d.pipelineDetectedMenu) menuDetected++;
    }
  }
  const menuRate = menuTotal > 0 ? (menuDetected / menuTotal) * 100 : 100;
  benchmarks.push({
    id: 'B4', name: 'Menu Nav Detection Rate',
    current: round2(menuRate), target: 90, gap: round2(90 - menuRate), unit: '%',
    passing: menuRate >= 90,
    detail: `${menuDetected} of ${menuTotal} failed sites with menu links were detected (failures only)`,
    fixes: menuRate < 90 ? [
      'Extend extractNavLinkTexts() to search full page, not just first <nav>',
      'Add href-based detection: /menu, /food, /drinks paths',
      'Detect "food", "drinks", "cuisine" as menu-equivalent nav text',
    ] : [],
  });

  // B5 — Reservations Detection Rate
  let resTotal = 0, resDetected = 0;
  for (const [, d] of failureDiagnostics) {
    if (d.independentReservations) {
      resTotal++;
      if (d.pipelineDetectedReservations) resDetected++;
    }
  }
  const resRate = resTotal > 0 ? (resDetected / resTotal) * 100 : 100;
  benchmarks.push({
    id: 'B5', name: 'Reservations Detection Rate',
    current: round2(resRate), target: 85, gap: round2(85 - resRate), unit: '%',
    passing: resRate >= 85,
    detail: `${resDetected} of ${resTotal} failed sites with reservation features were detected (failures only)`,
    fixes: resRate < 85 ? [
      'Detect OpenTable/Resy script tags and embeds as strong reservation signals',
      'Add "book", "book a table", "book now" as nav-equivalent reservation text',
    ] : [],
  });

  // B6 — False Positive Rate
  const fpr = nonRestaurantTotal > 0 ? (nonRestaurantFalsePositives / nonRestaurantTotal) * 100 : 0;
  benchmarks.push({
    id: 'B6', name: 'False Positive Rate',
    current: round2(fpr), target: 2, gap: round2(fpr - 2), unit: '%',
    passing: fpr <= 2,
    detail: `${nonRestaurantFalsePositives} of ${nonRestaurantTotal} non-restaurants incorrectly verified`,
    fixes: fpr > 2 ? [
      'Strengthen negative signal detection for SaaS/vendor keywords',
      'Add negative weight for /pricing, /demo, /enterprise nav links',
    ] : [],
  });

  return benchmarks;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ── Report generation ────────────────────────────────────────────────────

function generateSummary(
  failures: FailureRecord[],
  passes: LightPassRecord[],
  totalCollected: number,
  benchmarks: BenchmarkResult[],
): string {
  const lines: string[] = [];
  const hr = '='.repeat(80);
  const hr2 = '-'.repeat(80);
  const totalTested = failures.length + passes.length;

  lines.push(hr);
  lines.push('RESTAURANT VALIDATION FAILURE HUNT — SUMMARY REPORT');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Mode: ${DRY_RUN ? 'DRY RUN (50 failures max)' : 'FULL RUN (5,000 failures target)'}`);
  lines.push(hr);

  // ── Benchmark Scorecard ─────────────────────────────────────────────
  lines.push('');
  lines.push('BENCHMARK SCORECARD');
  lines.push(hr2);
  lines.push('');
  lines.push('   ID  Metric                          Current   Target   Gap      Status');
  lines.push('   ' + '-'.repeat(76));
  for (const b of benchmarks) {
    const status = b.passing ? 'PASS' : 'FAIL';
    const gapStr = b.id === 'B6'
      ? (b.gap <= 0 ? '  0.00' : ` +${b.gap.toFixed(2)}`)
      : (b.gap <= 0 ? '  0.00' : ` -${Math.abs(b.gap).toFixed(2)}`);
    lines.push(
      `   ${b.id}  ${b.name.padEnd(30)}  ${(b.current.toFixed(1) + b.unit).padStart(7)}  ${(b.target + b.unit).padStart(6)}  ${gapStr.padStart(7)}  ${status}`
    );
  }
  lines.push('');
  for (const b of benchmarks) {
    lines.push(`   ${b.id}: ${b.detail}`);
  }
  lines.push('');
  const failingBenchmarks = benchmarks.filter((b) => !b.passing);
  if (failingBenchmarks.length > 0) {
    lines.push('   FIXES NEEDED TO CLOSE GAPS:');
    for (const b of failingBenchmarks) {
      for (const fix of b.fixes) {
        lines.push(`     ${b.id}: ${fix}`);
      }
    }
  } else {
    lines.push('   All benchmarks passing.');
  }

  // ── 1. Totals ───────────────────────────────────────────────────────
  lines.push('');
  lines.push('1. TOTALS');
  lines.push(hr2);
  lines.push(`   URLs collected:        ${totalCollected}`);
  lines.push(`   URLs tested:           ${totalTested}`);
  lines.push(`   Failures found:        ${failures.length}`);
  lines.push(`   Passes (discarded):    ${passes.length}`);
  lines.push(`   Failure rate:          ${totalTested > 0 ? ((failures.length / totalTested) * 100).toFixed(1) : 0}%`);

  // Source breakdown
  const sourceCounts = new Map<string, number>();
  for (const f of failures) sourceCounts.set(f.thirdPartySource, (sourceCounts.get(f.thirdPartySource) ?? 0) + 1);
  if (sourceCounts.size > 0) {
    lines.push('   Sources:');
    for (const [src, count] of [...sourceCounts.entries()].sort((a, b) => b[1] - a[1])) {
      lines.push(`     ${src.padEnd(15)} ${count} failures`);
    }
  }

  // ── 2. Failure breakdown ────────────────────────────────────────────
  lines.push('');
  lines.push('2. FAILURE BREAKDOWN BY CATEGORY');
  lines.push(hr2);
  const categories = new Map<string, number>();
  for (const f of failures) categories.set(f.failureCategory, (categories.get(f.failureCategory) ?? 0) + 1);
  for (const [cat, count] of [...categories.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`   ${cat.padEnd(35)} ${String(count).padStart(6)}  (${((count / failures.length) * 100).toFixed(1)}%)`);
  }

  // ── 3. Score distribution ───────────────────────────────────────────
  lines.push('');
  lines.push('3. SIGNAL SCORE DISTRIBUTION (failed restaurants)');
  lines.push(hr2);
  const bucketOrder = ['0-9', '10-19', '20-29', '30-39', '40-49', '50-59 (near threshold)'];
  const scoreBuckets = new Map<string, number>();
  for (const f of failures) {
    const b = f.restaurantSignalScore >= 50 ? '50-59 (near threshold)' :
              f.restaurantSignalScore >= 40 ? '40-49' : f.restaurantSignalScore >= 30 ? '30-39' :
              f.restaurantSignalScore >= 20 ? '20-29' : f.restaurantSignalScore >= 10 ? '10-19' : '0-9';
    scoreBuckets.set(b, (scoreBuckets.get(b) ?? 0) + 1);
  }
  for (const b of bucketOrder) {
    const c = scoreBuckets.get(b) ?? 0;
    if (c > 0) {
      const bar = '#'.repeat(Math.round((c / Math.max(1, failures.length)) * 50));
      lines.push(`   ${b.padEnd(30)} ${String(c).padStart(6)}  (${((c / failures.length) * 100).toFixed(1)}%) ${bar}`);
    }
  }
  lines.push(`   Threshold for verified_restaurant: restaurantSignalScore >= 60`);

  // ── 4. Missing signals ──────────────────────────────────────────────
  lines.push('');
  lines.push('4. MOST COMMONLY MISSING SIGNALS');
  lines.push(hr2);
  const missingCounts = new Map<string, number>();
  for (const f of failures) for (const s of f.signalsMissing) missingCounts.set(s, (missingCounts.get(s) ?? 0) + 1);
  for (const [sig, c] of [...missingCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    lines.push(`   ${sig.padEnd(30)} ${String(c).padStart(6)}  (${((c / failures.length) * 100).toFixed(1)}% of failures)`);
  }

  // ── 5. State breakdown ─────────────────────────────────────────────
  lines.push('');
  lines.push('5. STATE-BY-STATE FAILURE COUNT');
  lines.push(hr2);
  const stateCounts = new Map<string, number>();
  for (const f of failures) stateCounts.set(f.state || 'Unknown', (stateCounts.get(f.state || 'Unknown') ?? 0) + 1);
  for (const [st, c] of [...stateCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) {
    lines.push(`   ${st.padEnd(5)} ${String(c).padStart(6)}`);
  }

  // ── 6. Cuisine breakdown ───────────────────────────────────────────
  lines.push('');
  lines.push('6. CUISINE-TYPE FAILURE COUNT');
  lines.push(hr2);
  const cuisineCounts = new Map<string, number>();
  for (const f of failures) cuisineCounts.set(f.cuisine || 'Unknown', (cuisineCounts.get(f.cuisine || 'Unknown') ?? 0) + 1);
  for (const [c, n] of [...cuisineCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    lines.push(`   ${c.padEnd(25)} ${String(n).padStart(6)}  (${((n / failures.length) * 100).toFixed(1)}%)`);
  }

  // ── 7. Top 10 examples ─────────────────────────────────────────────
  lines.push('');
  lines.push('7. TOP 10 FAILURE EXAMPLES');
  lines.push(hr2);
  for (let i = 0; i < Math.min(10, failures.length); i++) {
    const f = failures[i];
    lines.push(`   [${i + 1}] ${f.restaurantName} — ${f.url}`);
    lines.push(`       City: ${f.city}, ${f.state} | Cuisine: ${f.cuisine} | Source: ${f.thirdPartySource}`);
    lines.push(`       Decision: ${f.finalDecision} | HTTP: ${f.httpStatus} | Reachability: ${f.reachabilityStatus}`);
    lines.push(`       Scores: restaurant=${f.restaurantSignalScore} negative=${f.negativeSignalScore} chain=${f.nationalChainScore}`);
    lines.push(`       Signals found: ${f.signalsFound.join(', ') || 'none'}`);
    lines.push(`       Category: ${f.failureCategory}`);
    lines.push(`       Reason: ${f.specificFailureReason}`);
    lines.push('');
  }

  // ── 8. Prioritized fix list ─────────────────────────────────────────
  lines.push('8. PRIORITIZED FIX LIST');
  lines.push(hr2);
  lines.push('');

  const nearThreshold = failures.filter((f) => f.restaurantSignalScore >= 40 && f.restaurantSignalScore < 60);
  const blockedOrThin = failures.filter((f) => ['cloudflare_blocked', 'minimal_html', 'js_rendered', 'timeout'].includes(f.failureCategory));
  const hasMenuButFail = failures.filter((f) => f.signalsFound.includes('menu_nav') && f.restaurantSignalScore < 60);
  const hasHoursButFail = failures.filter((f) => f.signalsFound.includes('hours_pattern') && f.restaurantSignalScore < 60);
  const hasOgButFail = failures.filter((f) => f.hasOpenGraph && f.restaurantSignalScore < 60);
  const falseChains = failures.filter((f) => f.failureCategory === 'false_chain_detection');

  interface Fix { fix: string; wouldFix: number; risk: string; complexity: string; benchmarks: string[] }
  const fixes: Fix[] = [
    { fix: 'Lower verified_restaurant threshold from 60 to 45', wouldFix: nearThreshold.length, risk: 'Medium', complexity: 'Low — single constant in applyDecisionRules()', benchmarks: ['B1', 'B2'] },
    { fix: 'Expand blocked/thin restaurant context boost coverage', wouldFix: blockedOrThin.length, risk: 'Low', complexity: 'Medium — extend computeProtectedRestaurantContextScore()', benchmarks: ['B1'] },
    { fix: 'Increase menu nav weight from 15 to 25', wouldFix: hasMenuButFail.length, risk: 'Low', complexity: 'Low — single constant in classify-restaurant.ts', benchmarks: ['B1', 'B2', 'B4'] },
    { fix: 'Increase hours pattern weight from 12 to 20', wouldFix: hasHoursButFail.length, risk: 'Low', complexity: 'Low — single constant', benchmarks: ['B1', 'B2'] },
    { fix: 'Add og:type restaurant.restaurant as strong positive (+15)', wouldFix: hasOgButFail.length, risk: 'Very low', complexity: 'Low — add check in computeRestaurantScores()', benchmarks: ['B1', 'B2'] },
  ];
  if (falseChains.length > 0) {
    fixes.push({ fix: 'Tighten chain detection: require domain match, not just name alias at score 100', wouldFix: falseChains.length, risk: 'Low', complexity: 'Medium — refactor detectNationalChain()', benchmarks: ['B1'] });
  }

  for (const [i, f] of [...fixes].sort((a, b) => b.wouldFix - a.wouldFix).entries()) {
    lines.push(`   FIX ${i + 1}: ${f.fix}`);
    lines.push(`     Would fix:  ~${f.wouldFix} of ${failures.length} failures`);
    lines.push(`     Risk:       ${f.risk}`);
    lines.push(`     Complexity: ${f.complexity}`);
    lines.push(`     Benchmarks: ${f.benchmarks.join(', ')}`);
    const newTPR = totalTested > 0 ? round2(((passes.length + f.wouldFix) / totalTested) * 100) : 0;
    lines.push(`     Est. TPR after fix: ${newTPR}%`);
    lines.push('');
  }

  lines.push(hr);
  lines.push('END OF REPORT');
  lines.push(hr);
  return lines.join('\n');
}

// ── Main orchestrator ────────────────────────────────────────────────────

interface PreviousRunState {
  failures: FailureRecord[];
  passCount: number;
  testedCount: number;
}

function loadPreviousRunState(): PreviousRunState {
  const empty = { failures: [], passCount: 0, testedCount: 0 };
  if (!RESUME || !existsSync(RESULTS_PATH)) return empty;

  try {
    const failures = JSON.parse(readFileSync(RESULTS_PATH, 'utf8')) as FailureRecord[];
    let passCount = 0;
    let testedCount = failures.length;
    if (existsSync(SUMMARY_PATH)) {
      const summary = readFileSync(SUMMARY_PATH, 'utf8');
      const testedMatch = summary.match(/URLs tested:\s+(\d+)/);
      const passMatch = summary.match(/Passes \(discarded\):\s+(\d+)/);
      testedCount = testedMatch ? Number(testedMatch[1]) : testedCount;
      passCount = passMatch ? Number(passMatch[1]) : Math.max(0, testedCount - failures.length);
    }
    return { failures, passCount, testedCount };
  } catch {
    return empty;
  }
}

class ValidationQueue {
  private queue: RestaurantCandidate[] = [];
  private closed = false;
  private workerPromises: Promise<void>[] = [];

  failures: FailureRecord[];
  passes: LightPassRecord[];
  failureDiagnostics = new Map<string, DiagnosticSignals>();
  seenUrls = new Set<string>();
  totalCollected = 0;
  totalTested = 0;
  skippedPreviouslyTested = 0;

  constructor(
    private readonly pipeline: ReturnType<typeof loadPipeline>,
    previous: PreviousRunState,
  ) {
    this.failures = [...previous.failures];
    this.passes = Array.from({ length: previous.passCount }, (_, idx) => ({
      url: `previous-pass-${idx}`,
      restaurantSignalScore: 60,
      negativeSignalScore: 0,
    }));
    this.totalTested = previous.testedCount;
    for (const failure of previous.failures) this.seenUrls.add(canonicalUrl(failure.url));
  }

  start(): void {
    this.workerPromises = Array.from({ length: CONCURRENCY }, () => this.worker());
  }

  enqueueBatch(candidates: RestaurantCandidate[], source: string): number {
    let accepted = 0;
    for (const candidate of candidates) {
      if (this.failures.length >= TARGET_FAILURES) break;
      const key = canonicalUrl(candidate.url);
      if (this.seenUrls.has(key)) {
        this.skippedPreviouslyTested++;
        continue;
      }
      this.seenUrls.add(key);
      this.queue.push(candidate);
      this.totalCollected++;
      accepted++;
      if (accepted % 100 === 0) {
        console.log(`[QUEUE] ${source}: queued ${accepted} candidates (${this.queue.length} pending)`);
      }
    }
    if (accepted > 0) console.log(`[QUEUE] ${source}: accepted ${accepted} candidates`);
    return accepted;
  }

  async closeAndWait(): Promise<void> {
    this.closed = true;
    await Promise.all(this.workerPromises);
  }

  private async worker(): Promise<void> {
    while (!this.closed || this.queue.length > 0) {
      if (this.failures.length >= TARGET_FAILURES) {
        this.closed = true;
        break;
      }
      const candidate = this.queue.shift();
      if (!candidate) {
        await sleep(250);
        continue;
      }
      await this.processCandidate(candidate);
    }
  }

  private async processCandidate(candidate: RestaurantCandidate): Promise<void> {
    const startedAt = Date.now();
    try {
      const result = await this.pipeline.runValidation({
        website: candidate.url,
        restaurantName: candidate.name,
        state: candidate.state || 'TX',
      });
      this.totalTested++;

      if (result.finalDecision === 'verified_restaurant') {
        this.passes.push({
          url: candidate.url,
          restaurantSignalScore: result.restaurantSignalScore,
          negativeSignalScore: result.negativeSignalScore,
        });
        return;
      }

      let diag: CheckWebsiteResult | null = null;
      try {
        const norm = this.pipeline.normalizeUrl(candidate.url);
        if (norm.isValid) diag = await this.pipeline.checkWebsite(norm.normalizedUrl);
      } catch { /* diagnostic fetch failed */ }

      if (this.failures.length >= TARGET_FAILURES) return;
      const record = await diagnoseFailure(candidate, result, diag, Date.now() - startedAt);
      this.failures.push(record);

      if (diag?.html) {
        const html = diag.html;
        const signals = diag.signals;
        this.failureDiagnostics.set(candidate.url, {
          html,
          pipelineDetectedSchema: signals?.hasRestaurantSchema ?? false,
          pipelineDetectedMenu: signals?.navLinkTexts?.some((t) => t.includes('menu')) ?? false,
          pipelineDetectedReservations: signals?.navLinkTexts?.some((t) => t.includes('reservation')) ?? false,
          independentSchema: independentlyHasSchemaOrg(html),
          independentMenu: independentlyHasMenuNav(html),
          independentReservations: independentlyHasReservations(html),
        });
      }

      if (this.failures.length % PROGRESS_INTERVAL === 0) {
        console.log(`\n[PROGRESS] ${this.failures.length}/${TARGET_FAILURES} failures (${this.totalTested} tested, ${((this.failures.length / Math.max(1, this.totalTested)) * 100).toFixed(1)}% failure rate)`);
      }
    } catch (err) {
      this.totalTested++;
      if (this.failures.length >= TARGET_FAILURES) return;
      this.failures.push({
        url: candidate.url, restaurantName: candidate.name,
        city: candidate.city, state: candidate.state, cuisine: candidate.cuisine,
        thirdPartySource: candidate.source, finalDecision: 'error', httpStatus: 0,
        restaurantSignalScore: 0, negativeSignalScore: 0,
        signalsFound: [], signalsMissing: ALL_SIGNAL_NAMES,
        fetchSucceeded: false, htmlLength: 0, hasCloudflare: false,
        hasSchemaOrg: false, hasOpenGraph: false, failureCategory: 'timeout',
        specificFailureReason: `Exception: ${err instanceof Error ? err.message : String(err)}`,
        reachabilityStatus: 'inaccessible', nationalChainScore: 0,
        internalFlags: ['exception'], reasons: ['exception'],
        timeTakenMs: Date.now() - startedAt,
      });
    }
  }
}

async function runSource(
  name: string,
  runner: ValidationQueue,
  collect: () => Promise<RestaurantCandidate[]>,
): Promise<void> {
  if (runner.failures.length >= TARGET_FAILURES) return;
  const candidates = await collect();
  runner.enqueueBatch(candidates, name);
  console.log(`\n[COLLECT] ${name}: ${candidates.length} collected`);
}

async function main(): Promise<void> {
  console.log('='.repeat(70));
  console.log('RESTAURANT VALIDATION FAILURE HUNTER');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (50 failures)' : 'FULL RUN (5,000 failures)'}`);
  console.log(`Resume: ${RESUME ? 'yes' : 'no'}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log('Sources: Yelp, OpenTable, Eater, TripAdvisor, Google, associations, newspapers, Infatuation, Foursquare, seed URLs');
  console.log('API keys required: NONE');
  console.log('='.repeat(70));

  console.log('\n[INIT] Loading validation pipeline via jiti...');
  const pipeline = loadPipeline();
  console.log('[INIT] Pipeline loaded.');

  const previous = loadPreviousRunState();
  if (RESUME) {
    console.log(`[RESUME] Loaded ${previous.failures.length} existing failures; skipping those URLs.`);
  }

  const runner = new ValidationQueue(pipeline, previous);
  runner.start();

  // ── Collect URLs while validation workers run ──────────────────────
  console.log('\n[COLLECT] Gathering restaurant URLs from free sources...');
  const seenDomains = new Set<string>();
  for (const url of runner.seenUrls) {
    const domain = extractDomainFromUrl(url);
    if (domain) seenDomains.add(domain);
  }
  const expandedCities = buildExpandedCities(DRY_RUN ? 60 : 300);
  const yelpCities = expandedCities.slice(0, DRY_RUN ? 20 : 200);

  const progress = (source: string, count: number) => {
    process.stdout.write(`\r[COLLECT] ${source}: ${count} URLs`);
  };

  const seedUrls = loadSeedUrls();
  const seedCandidates = seedUrls.filter((s) => {
    const d = extractDomainFromUrl(s.url);
    if (!d || seenDomains.has(d)) return false;
    seenDomains.add(d);
    return true;
  });
  runner.enqueueBatch(seedCandidates, 'seed');
  console.log(`[COLLECT] seed: ${seedCandidates.length} URLs`);

  if (!DRY_RUN) {
    await runSource('eater', runner, () => collectFromEater(expandedCities, seenDomains, progress));
    await runSource('infatuation', runner, () => collectFromInfatuation(expandedCities, seenDomains, progress));
    await runSource('yelp', runner, () => collectFromYelp(yelpCities, seenDomains, progress));
    await runSource('opentable', runner, () => collectFromOpenTable(seenDomains, progress));
    await runSource('tripadvisor', runner, () => collectFromTripAdvisor(seenDomains, progress));
    await runSource('google', runner, () => collectFromGoogleSearch(expandedCities, seenDomains, 'google', [
      (city) => `best independent restaurants ${city.city} ${city.stateCode} -chain -franchise`,
      (city) => `local restaurants ${city.city} ${city.stateCode} site:.com -mcdonald -subway -chipotle -starbucks`,
    ], progress, 300));
    await runSource('state_association', runner, () => collectFromGoogleSearch(expandedCities, seenDomains, 'state_association', [
      (city) => `${city.stateCode} restaurant association member directory restaurant website`,
    ], progress, 100));
    await runSource('newspaper', runner, () => collectFromGoogleSearch(expandedCities, seenDomains, 'newspaper', [
      (city) => `best restaurants ${city.city} ${city.stateCode} 2024 local newspaper`,
    ], progress, 100));
    await runSource('foursquare', runner, () => collectFromGoogleSearch(expandedCities, seenDomains, 'foursquare', [
      (city) => `site:foursquare.com/v restaurant ${city.city} ${city.stateCode} official website`,
    ], progress, 100));
  }

  console.log(`[COLLECT] Total queued candidates this run: ${runner.totalCollected}`);
  console.log(`[COLLECT] Skipped previously tested URLs: ${runner.skippedPreviouslyTested}`);
  if (runner.totalCollected === 0) {
    console.error('[ERROR] No URLs collected. Add restaurants to scripts/seed-urls.json.');
    process.exit(1);
  }

  console.log(`\n[VALIDATE] Waiting for validation queue to drain...`);
  await runner.closeAndWait();
  console.log('');

  // ── False positive check (B6) — run non-restaurants from dataset ────
  console.log('\n[BENCHMARK] Running false-positive check on non-restaurant dataset...');
  let fpCount = 0;
  let fpTotal = 0;
  const datasetPath = path.join(process.cwd(), 'scripts', 'validation-dataset.json');
  if (existsSync(datasetPath)) {
    try {
      const ds = JSON.parse(readFileSync(datasetPath, 'utf8')) as {
        non_restaurants?: Array<{ url: string; name: string }>;
      };
      const nonRestaurants = DRY_RUN
        ? (ds.non_restaurants ?? []).slice(0, DRY_RUN_FALSE_POSITIVE_LIMIT)
        : (ds.non_restaurants ?? []);
      let fpIndex = 0;
      async function fpWorker(): Promise<void> {
        while (fpIndex < nonRestaurants.length) {
          const nr = nonRestaurants[fpIndex++];
          if (!nr) continue;
          try {
            const r = await pipeline.runValidation({ website: nr.url, restaurantName: nr.name, state: 'TX' });
            fpTotal++;
            if (r.finalDecision === 'verified_restaurant') fpCount++;
          } catch {
            fpTotal++;
          }
        }
      }
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, nonRestaurants.length) }, fpWorker));
      if (DRY_RUN && (ds.non_restaurants?.length ?? 0) > DRY_RUN_FALSE_POSITIVE_LIMIT) {
        console.log(`[BENCHMARK] Dry-run capped false-positive check at ${DRY_RUN_FALSE_POSITIVE_LIMIT}/${ds.non_restaurants?.length ?? 0} rows.`);
      }
    } catch { /* ignore */ }
  }
  console.log(`[BENCHMARK] False positives: ${fpCount}/${fpTotal}`);

  // ── Compute benchmarks ──────────────────────────────────────────────
  const benchmarks = computeBenchmarks(runner.failures, runner.passes, runner.failureDiagnostics, fpCount, fpTotal);

  // ── Write output ────────────────────────────────────────────────────
  console.log(`\n[RESULTS] ${runner.failures.length} failures from ${runner.totalTested} URLs tested.`);
  await writeFile(RESULTS_PATH, `${JSON.stringify(runner.failures, null, 2)}\n`, 'utf8');
  console.log(`[WRITE] ${RESULTS_PATH}`);

  const summary = generateSummary(runner.failures, runner.passes, runner.totalCollected + previous.testedCount, benchmarks);
  await writeFile(SUMMARY_PATH, `${summary}\n`, 'utf8');
  console.log(`[WRITE] ${SUMMARY_PATH}`);

  console.log('\n' + summary);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
