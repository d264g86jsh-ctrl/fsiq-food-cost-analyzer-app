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
const TARGET_FAILURES = DRY_RUN ? 50 : 5000;
const CONCURRENCY = 10;
const PROGRESS_INTERVAL = DRY_RUN ? 10 : 500;
const SCRAPE_DELAY_MS = 800;
const SCRAPE_TIMEOUT_MS = 12_000;

const RESULTS_PATH = path.join(process.cwd(), 'scripts', 'failure-hunt-results.json');
const SUMMARY_PATH = path.join(process.cwd(), 'scripts', 'failure-hunt-summary.txt');

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── Types ────────────────────────────────────────────────────────────────

type UrlSource = 'yelp' | 'opentable' | 'eater' | 'infatuation' | 'seed';

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

async function scrapeFetch(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SCRAPE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': BROWSER_UA,
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

  for (const city of cities) {
    const searchUrl = `https://www.yelp.com/search?find_desc=Restaurants&find_loc=${city.yelpLoc}`;
    const searchHtml = await scrapeFetch(searchUrl);
    if (!searchHtml) { await sleep(SCRAPE_DELAY_MS); continue; }

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
    await sleep(SCRAPE_DELAY_MS);
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

  for (const metro of OPENTABLE_METROS) {
    const searchUrl = `https://www.opentable.com/s?metroId=${metro.id}`;
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
        restaurants: Array<{ url: string; name: string; city?: string }>;
      };
      for (const entry of dataset.restaurants) {
        const parts = (entry.city ?? '').split(',').map((s) => s.trim());
        seeds.push({
          url: entry.url, name: entry.name,
          city: parts[0] || '', state: parts[1] || '',
          cuisine: inferCuisine(entry.name), source: 'seed',
          address: entry.city ?? '',
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

async function main(): Promise<void> {
  console.log('='.repeat(70));
  console.log('RESTAURANT VALIDATION FAILURE HUNTER');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN (50 failures)' : 'FULL RUN (5,000 failures)'}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log('Sources: Yelp, OpenTable, Eater, Infatuation, seed URLs');
  console.log('API keys required: NONE');
  console.log('='.repeat(70));

  console.log('\n[INIT] Loading validation pipeline via jiti...');
  const pipeline = loadPipeline();
  console.log('[INIT] Pipeline loaded.');

  // ── Collect URLs ────────────────────────────────────────────────────
  console.log('\n[COLLECT] Gathering restaurant URLs from free sources...');
  const seenDomains = new Set<string>();
  const allCandidates: RestaurantCandidate[] = [];

  const progress = (source: string, count: number) => {
    process.stdout.write(`\r[COLLECT] ${source}: ${count} URLs`);
  };

  // Source 5 first (fast, local)
  const seedUrls = loadSeedUrls();
  for (const s of seedUrls) {
    const d = extractDomainFromUrl(s.url);
    if (d && !seenDomains.has(d)) { seenDomains.add(d); allCandidates.push(s); }
  }
  console.log(`[COLLECT] seed: ${allCandidates.length} URLs`);

  if (!DRY_RUN) {
    // Source 3: Eater (editorial — high success rate)
    const eaterUrls = await collectFromEater(US_CITIES, seenDomains, progress);
    allCandidates.push(...eaterUrls);
    console.log(`\n[COLLECT] eater: ${eaterUrls.length} URLs`);

    // Source 4: Infatuation (editorial — high success rate)
    const infUrls = await collectFromInfatuation(US_CITIES, seenDomains, progress);
    allCandidates.push(...infUrls);
    console.log(`\n[COLLECT] infatuation: ${infUrls.length} URLs`);

    // Source 1: Yelp (may be blocked)
    const yelpUrls = await collectFromYelp(US_CITIES, seenDomains, progress);
    allCandidates.push(...yelpUrls);
    console.log(`\n[COLLECT] yelp: ${yelpUrls.length} URLs`);

    // Source 2: OpenTable (may be blocked)
    const otUrls = await collectFromOpenTable(seenDomains, progress);
    allCandidates.push(...otUrls);
    console.log(`\n[COLLECT] opentable: ${otUrls.length} URLs`);
  }

  console.log(`[COLLECT] Total unique candidates: ${allCandidates.length}`);
  if (allCandidates.length === 0) {
    console.error('[ERROR] No URLs collected. Add restaurants to scripts/seed-urls.json.');
    process.exit(1);
  }

  // ── Run validation ─────────────────────────────────────────────────
  console.log(`\n[VALIDATE] Running pipeline on ${allCandidates.length} URLs (concurrency ${CONCURRENCY})...`);
  const failures: FailureRecord[] = [];
  const passes: LightPassRecord[] = [];
  const failureDiagnostics = new Map<string, DiagnosticSignals>();
  let totalTested = 0;
  let queueIndex = 0;
  let stopped = false;

  async function worker(): Promise<void> {
    while (!stopped) {
      const idx = queueIndex++;
      if (idx >= allCandidates.length) break;
      const candidate = allCandidates[idx];
      const startedAt = Date.now();

      try {
        const result = await pipeline.runValidation({
          website: candidate.url,
          restaurantName: candidate.name,
          state: candidate.state || 'TX',
        });
        totalTested++;

        if (result.finalDecision === 'verified_restaurant') {
          passes.push({
            url: candidate.url,
            restaurantSignalScore: result.restaurantSignalScore,
            negativeSignalScore: result.negativeSignalScore,
          });
        } else {
          // Failure — diagnostic fetch for signal-level details + benchmarks
          let diag: CheckWebsiteResult | null = null;
          try {
            const norm = pipeline.normalizeUrl(candidate.url);
            if (norm.isValid) diag = await pipeline.checkWebsite(norm.normalizedUrl);
          } catch { /* diagnostic fetch failed */ }

          const record = await diagnoseFailure(candidate, result, diag, Date.now() - startedAt);
          failures.push(record);

          // Benchmark diagnostics
          if (diag?.html) {
            const html = diag.html;
            const signals = diag.signals;
            failureDiagnostics.set(candidate.url, {
              html,
              pipelineDetectedSchema: signals?.hasRestaurantSchema ?? false,
              pipelineDetectedMenu: signals?.navLinkTexts?.some((t) => t.includes('menu')) ?? false,
              pipelineDetectedReservations: signals?.navLinkTexts?.some((t) => t.includes('reservation')) ?? false,
              independentSchema: independentlyHasSchemaOrg(html),
              independentMenu: independentlyHasMenuNav(html),
              independentReservations: independentlyHasReservations(html),
            });
          }

          if (failures.length % PROGRESS_INTERVAL === 0) {
            console.log(`\n[PROGRESS] ${failures.length}/${TARGET_FAILURES} failures (${totalTested} tested, ${((failures.length / totalTested) * 100).toFixed(1)}% failure rate)`);
          }
          if (failures.length >= TARGET_FAILURES) { stopped = true; break; }
        }
      } catch (err) {
        totalTested++;
        failures.push({
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
      if (totalTested % 10 === 0) process.stdout.write('.');
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, allCandidates.length) }, worker));
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
      const nonRestaurants = ds.non_restaurants ?? [];
      for (const nr of nonRestaurants) {
        try {
          const r = await pipeline.runValidation({ website: nr.url, restaurantName: nr.name, state: 'TX' });
          fpTotal++;
          if (r.finalDecision === 'verified_restaurant') fpCount++;
        } catch { fpTotal++; }
      }
    } catch { /* ignore */ }
  }
  console.log(`[BENCHMARK] False positives: ${fpCount}/${fpTotal}`);

  // ── Compute benchmarks ──────────────────────────────────────────────
  const benchmarks = computeBenchmarks(failures, passes, failureDiagnostics, fpCount, fpTotal);

  // ── Write output ────────────────────────────────────────────────────
  console.log(`\n[RESULTS] ${failures.length} failures from ${totalTested} URLs tested.`);
  await writeFile(RESULTS_PATH, `${JSON.stringify(failures, null, 2)}\n`, 'utf8');
  console.log(`[WRITE] ${RESULTS_PATH}`);

  const summary = generateSummary(failures, passes, allCandidates.length, benchmarks);
  await writeFile(SUMMARY_PATH, `${summary}\n`, 'utf8');
  console.log(`[WRITE] ${SUMMARY_PATH}`);

  console.log('\n' + summary);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
