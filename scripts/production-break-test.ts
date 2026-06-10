#!/usr/bin/env npx tsx
// production-break-test.ts — Part 1: Website Validation API adversarial test (75 cases)
//
// Tests ONLY the /api/validate-website endpoint (stateless — no DB writes).
// Takes { website, restaurantName, conceptType } → returns ValidationResult.
//
// Categories:
//   A. URL normalization edge cases (14) — protocols, spaces, fragments, ports
//   B. DNS/HTTP failure modes (6) — NXDOMAIN, bad URLs, Cloudflare
//   C. National chain detection (12) — exact, partial, near-chains
//   D. Clear non-fits (12) — media, finance, gov, sports, suppliers
//   E. Food-adjacent but not restaurants (12) — caterers, breweries, farms
//   F. Restaurant edge cases (10) — unusual-but-legit restaurants
//   G. Known-good controls (9) — CRM restaurants that must always pass
//
// Part 2 (full pipeline / form test): production-pipeline-test.js (Puppeteer, 30 cases)
//
// Run: npx tsx scripts/production-break-test.ts
// Results: break-test-api-results.json

import path from 'node:path';
import fs from 'node:fs';

function loadEnv(p: string) {
  if (!fs.existsSync(p)) return;
  const fileVars: Record<string, string> = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (k) fileVars[k] = v;
  }
  for (const [k, v] of Object.entries(fileVars)) {
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv(path.join(process.cwd(), '.env.local'));
loadEnv(path.join(process.cwd(), '.env'));

const BASE_URL = process.env.BASE_URL || 'https://fsiq-food-cost-analyzer-app.vercel.app';
const DELAY_MS = 600;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ts = () => new Date().toTimeString().slice(0, 8);

type ExpectedDecision =
  | 'verified_restaurant'
  | 'plausible_unverified'
  | 'clear_non_fit'
  | 'national_chain'
  | 'invalid_website'
  | 'any_non_fit'     // clear_non_fit OR national_chain
  | 'any_qualified'   // verified_restaurant OR plausible_unverified
  | null;             // observation only — no assertion

interface TestCase {
  id: string;
  category: string;
  label: string;
  website: string;
  restaurantName: string;
  conceptType?: string;
  expected: ExpectedDecision;
  note: string;
}

const TESTS: TestCase[] = [

  // ══ A. URL Normalization Edge Cases (14) ════════════════════════════════════

  {
    id: 'A01', category: 'A_URL_NORM', label: 'No protocol — bare domain',
    website: 'barneyshamburgers.com', restaurantName: "Barney's Hamburgers",
    expected: 'any_qualified', note: 'normalize-url must prepend https://',
  },
  {
    id: 'A02', category: 'A_URL_NORM', label: 'No protocol with www prefix',
    website: 'www.barneyshamburgers.com', restaurantName: "Barney's Hamburgers",
    expected: 'any_qualified', note: 'www prefix without protocol',
  },
  {
    id: 'A03', category: 'A_URL_NORM', label: 'URL with query string + fragment',
    website: 'https://barneyshamburgers.com/menu?tab=dinner#entrees', restaurantName: "Barney's Hamburgers",
    expected: 'any_qualified', note: 'Query/fragment must not break validation',
  },
  {
    id: 'A04', category: 'A_URL_NORM', label: 'Trailing slash on root URL',
    website: 'https://barneyshamburgers.com/', restaurantName: "Barney's Hamburgers",
    expected: 'any_qualified', note: 'Root URL with trailing slash',
  },
  {
    id: 'A05', category: 'A_URL_NORM', label: 'Subdomain URL menu.example.com',
    website: 'https://menu.hurtadobbq.com', restaurantName: 'Hurtado BBQ',
    expected: 'any_qualified', note: 'menu. subdomain — root domain extracted correctly',
  },
  {
    id: 'A06', category: 'A_URL_NORM', label: 'HTTP (not HTTPS) protocol',
    website: 'http://barneyshamburgers.com', restaurantName: "Barney's Hamburgers",
    expected: 'any_qualified', note: 'HTTP — normalizer tries https first, falls back to http',
  },
  {
    id: 'A07', category: 'A_URL_NORM', label: 'Deep path URL /about/team',
    website: 'https://hurtadobbq.com/about/team', restaurantName: 'Hurtado BBQ',
    expected: 'any_qualified', note: 'Deep path — validator still classifies correctly',
  },
  {
    id: 'A08', category: 'A_URL_NORM', label: 'International .co.uk domain',
    website: 'https://thecrownpub.co.uk', restaurantName: 'The Crown Pub',
    expected: 'any_qualified', note: 'Two-part TLD — URL normalization handling',
  },
  {
    id: 'A09', category: 'A_URL_NORM', label: '.restaurant TLD',
    website: 'https://artisanalkitchen.restaurant', restaurantName: 'Artisanal Kitchen',
    expected: 'any_qualified', note: '.restaurant TLD — domain keyword = strong positive signal',
  },
  {
    id: 'A10', category: 'A_URL_NORM', label: '.io TLD food brand',
    website: 'https://eats.io', restaurantName: 'Eats Kitchen',
    expected: null, note: '.io TLD — novel, classifier may or may not qualify; observe',
  },
  {
    id: 'A11', category: 'A_URL_NORM', label: 'Spaces in URL (copy-paste error)',
    website: 'https://barney s hamburgers.com', restaurantName: "Barney's Hamburgers",
    expected: null, note: 'Spaces removed → may create valid URL or invalid; observe behavior',
  },
  {
    id: 'A12', category: 'A_URL_NORM', label: 'URL with port number :8080',
    website: 'https://barneyshamburgers.com:8080', restaurantName: "Barney's Hamburgers",
    expected: null, note: 'Non-standard port — observe normalizer handling',
  },
  {
    id: 'A13', category: 'A_URL_NORM', label: 'Square.site platform URL',
    website: 'https://tacotruck-carlos.square.site', restaurantName: 'Taco Truck By Carlos',
    expected: 'any_qualified', note: 'Square.site — trusted platform, should score positive',
  },
  {
    id: 'A14', category: 'A_URL_NORM', label: 'GrubHub restaurant listing URL',
    website: 'https://www.grubhub.com/restaurant/barneys-hamburgers', restaurantName: "Barney's Hamburgers",
    expected: null, note: 'Third-party delivery platform URL — platform detection test',
  },

  // ══ B. DNS/HTTP Failure Modes (6) ═══════════════════════════════════════════

  {
    id: 'B01', category: 'B_FAILURE', label: 'DNS NXDOMAIN — definitely-nonexistent',
    website: 'https://this-domain-absolutely-does-not-exist-xyz789abc.com',
    restaurantName: 'Nonexistent Restaurant',
    expected: 'invalid_website', note: 'NXDOMAIN MUST produce invalid_website (not clear_non_fit)',
  },
  {
    id: 'B02', category: 'B_FAILURE', label: 'Malformed URL — single dot',
    website: '.', restaurantName: 'Dot Restaurant',
    expected: 'invalid_website', note: 'Unparseable URL — must fail gracefully',
  },
  {
    id: 'B03', category: 'B_FAILURE', label: 'localhost URL',
    website: 'http://localhost:3000', restaurantName: 'Localhost Kitchen',
    expected: 'invalid_website', note: 'localhost is not a real restaurant',
  },
  {
    id: 'B04', category: 'B_FAILURE', label: 'Private IP address',
    website: 'http://192.168.1.1', restaurantName: 'IP Diner',
    expected: 'invalid_website', note: 'Private IP — should fail gracefully',
  },
  {
    id: 'B05', category: 'B_FAILURE', label: 'Cloudflare-protected real restaurant',
    website: 'https://seldenstandard.com', restaurantName: 'Selden Standard',
    expected: 'any_qualified', note: 'Cloudflare 403 → plausible_unverified (NOT invalid_website)',
  },
  {
    id: 'B06', category: 'B_FAILURE', label: 'Instagram page URL',
    website: 'https://www.instagram.com/barneyshamburgers',
    restaurantName: "Barney's Hamburgers",
    expected: null, note: 'Social media URL — login wall; plausible or non-fit; observe',
  },

  // ══ C. National Chain Detection (12) ════════════════════════════════════════

  {
    id: 'C01', category: 'C_CHAIN', label: "McDonald's — exact name + domain",
    website: 'https://mcdonalds.com', restaurantName: "McDonald's",
    expected: 'national_chain', note: 'Top chain — exact name + domain match',
  },
  {
    id: 'C02', category: 'C_CHAIN', label: 'Chick-fil-A — hyphenated name',
    website: 'https://chick-fil-a.com', restaurantName: 'Chick-fil-A',
    expected: 'national_chain', note: 'Hyphenated chain name',
  },
  {
    id: 'C03', category: 'C_CHAIN', label: "Raising Cane's — added in expansion",
    website: 'https://raisingcanes.com', restaurantName: "Raising Cane's Chicken Fingers",
    expected: 'national_chain', note: 'Chain added in 46→191 expansion',
  },
  {
    id: 'C04', category: 'C_CHAIN', label: 'Wingstop — fast casual chain',
    website: 'https://wingstop.com', restaurantName: 'Wingstop',
    expected: 'national_chain', note: 'Fast casual chain',
  },
  {
    id: 'C05', category: 'C_CHAIN', label: 'Texas Roadhouse — casual dining chain',
    website: 'https://texasroadhouse.com', restaurantName: 'Texas Roadhouse',
    expected: 'national_chain', note: 'Casual dining chain in expanded list',
  },
  {
    id: 'C06', category: 'C_CHAIN', label: "Starbucks — coffeehouse chain",
    website: 'https://starbucks.com', restaurantName: 'Starbucks Coffee',
    expected: 'national_chain', note: 'Coffee chain',
  },
  {
    id: 'C07', category: 'C_CHAIN', label: "McDonald's franchise — local site",
    website: 'https://independentburger-smithtown.com', restaurantName: "McDonald's of Smithtown",
    expected: 'national_chain', note: 'Chain name + location modifier — still a chain',
  },
  {
    id: 'C08', category: 'C_CHAIN', label: '"McDonald\'s Style Burgers" — independent',
    website: 'https://mcdstyleburgers.com', restaurantName: "McDonald's Style Burgers",
    expected: null, note: 'Near-chain name but clearly independent — should NOT be DQd; observe',
  },
  {
    id: 'C09', category: 'C_CHAIN', label: '"mcdonald\'s" lowercase',
    website: 'https://mcdonalds.com', restaurantName: "mcdonald's",
    expected: 'national_chain', note: 'Lowercase chain name — case-insensitive detection',
  },
  {
    id: 'C10', category: 'C_CHAIN', label: '"Subway Sandwiches and More"',
    website: 'https://subway.com', restaurantName: 'Subway Sandwiches and More',
    expected: 'national_chain', note: 'Chain name with trailing words — partial match',
  },
  {
    id: 'C11', category: 'C_CHAIN', label: '"The Burger Place" — generic, independent',
    website: 'https://theburgerplace2019.com', restaurantName: 'The Burger Place',
    expected: 'any_qualified', note: 'Generic name — independent restaurant, NOT a chain',
  },
  {
    id: 'C12', category: 'C_CHAIN', label: 'Panera Bread — bakery-cafe chain',
    website: 'https://panerabread.com', restaurantName: 'Panera Bread',
    expected: 'national_chain', note: 'Bakery-cafe chain',
  },

  // ══ D. Clear Non-Fits (12) ══════════════════════════════════════════════════

  {
    id: 'D01', category: 'D_NONFIT', label: 'CNN news website',
    website: 'https://cnn.com', restaurantName: 'CNN Cafe',
    expected: 'clear_non_fit', note: 'CNN in KNOWN_NON_RESTAURANT_DOMAINS',
  },
  {
    id: 'D02', category: 'D_NONFIT', label: 'ESPN sports',
    website: 'https://espn.com', restaurantName: 'ESPN Grill',
    expected: 'clear_non_fit', note: 'ESPN in KNOWN_NON_RESTAURANT_DOMAINS',
  },
  {
    id: 'D03', category: 'D_NONFIT', label: 'Chase Bank — financial institution',
    website: 'https://chase.com', restaurantName: 'Chase Diner',
    expected: 'clear_non_fit', note: 'Financial institution in KNOWN_NON_RESTAURANT_DOMAINS',
  },
  {
    id: 'D04', category: 'D_NONFIT', label: 'Harvard .edu',
    website: 'https://www.harvard.edu', restaurantName: 'Harvard Dining',
    expected: 'clear_non_fit', note: '.edu domain — institutional non-restaurant',
  },
  {
    id: 'D05', category: 'D_NONFIT', label: 'USDA .gov website',
    website: 'https://usda.gov', restaurantName: 'USDA Cafeteria',
    expected: 'clear_non_fit', note: '.gov domain in KNOWN_NON_RESTAURANT_DOMAINS',
  },
  {
    id: 'D06', category: 'D_NONFIT', label: 'NYTimes.com news',
    website: 'https://nytimes.com', restaurantName: 'NYT Bistro',
    expected: 'clear_non_fit', note: 'News domain in KNOWN_NON_RESTAURANT_DOMAINS',
  },
  {
    id: 'D07', category: 'D_NONFIT', label: 'Amazon.com — e-commerce giant',
    website: 'https://amazon.com', restaurantName: 'Amazon Kitchen',
    expected: 'clear_non_fit', note: 'E-commerce giant — strong negative signals',
  },
  {
    id: 'D08', category: 'D_NONFIT', label: 'Sysco — food distributor',
    website: 'https://sysco.com', restaurantName: 'Sysco Distribution',
    expected: 'clear_non_fit', note: 'Food distributor, not a restaurant',
  },
  {
    id: 'D09', category: 'D_NONFIT', label: 'NFL.com — sports league',
    website: 'https://nfl.com', restaurantName: 'NFL Kitchen',
    expected: 'clear_non_fit', note: 'Sports league in KNOWN_NON_RESTAURANT_DOMAINS',
  },
  {
    id: 'D10', category: 'D_NONFIT', label: 'TechCrunch — tech news',
    website: 'https://techcrunch.com', restaurantName: 'TechCrunch Cafe',
    expected: 'clear_non_fit', note: 'Tech news in KNOWN_NON_RESTAURANT_DOMAINS',
  },
  {
    id: 'D11', category: 'D_NONFIT', label: 'Whole Foods Market — grocery chain',
    website: 'https://wholefoodsmarket.com', restaurantName: 'Whole Foods Hot Bar',
    expected: 'any_non_fit', note: 'Grocery chain — clear_non_fit or national_chain',
  },
  {
    id: 'D12', category: 'D_NONFIT', label: 'Hilton Hotels',
    website: 'https://hilton.com', restaurantName: 'Hilton Restaurant',
    expected: 'clear_non_fit', note: 'Hotel chain — hotel signals dominate',
  },

  // ══ E. Food-Adjacent But Not Restaurants (12) ════════════════════════════════

  {
    id: 'E01', category: 'E_ADJACENT', label: 'Restaurant consulting firm',
    website: 'https://restaurantconsultants.com', restaurantName: 'Restaurant Consultants Inc',
    expected: null, note: '"restaurant" in name+domain but B2B consulting; observe',
  },
  {
    id: 'E02', category: 'E_ADJACENT', label: 'Restaurant equipment supplier',
    website: 'https://chefsequipment.com', restaurantName: "Chef's Equipment Co",
    expected: 'clear_non_fit', note: 'B2B equipment — not a restaurant',
  },
  {
    id: 'E03', category: 'E_ADJACENT', label: 'Catering company',
    website: 'https://primecatering.com', restaurantName: 'Prime Catering Services',
    expected: null, note: 'Catering — food-adjacent boundary; observe',
  },
  {
    id: 'E04', category: 'E_ADJACENT', label: 'Food blog / recipe website',
    website: 'https://seriouseats.com', restaurantName: 'Serious Eats Kitchen',
    expected: 'clear_non_fit', note: 'Food media — editorial, not restaurant',
  },
  {
    id: 'E05', category: 'E_ADJACENT', label: 'Cooking school',
    website: 'https://institutecuisinaire.com', restaurantName: 'Institut Culinaire',
    expected: null, note: 'Cooking school — food signals but not restaurant; observe',
  },
  {
    id: 'E06', category: 'E_ADJACENT', label: 'Ghost kitchen platform',
    website: 'https://cloudkitchens.com', restaurantName: 'Virtual Wings by CloudKitchen',
    expected: null, note: 'Ghost kitchen platform URL — non-traditional; observe',
  },
  {
    id: 'E07', category: 'E_ADJACENT', label: 'Farm / produce supplier',
    website: 'https://heritagefarm.com', restaurantName: 'Heritage Farm Stand',
    expected: null, note: 'Farm website — could be farm-to-table or supplier; observe',
  },
  {
    id: 'E08', category: 'E_ADJACENT', label: 'Brewery taproom (has restaurant component)',
    website: 'https://gooseisland.com', restaurantName: 'Goose Island Brewery Taproom',
    expected: 'any_qualified', note: 'Brewery with food service — should qualify',
  },
  {
    id: 'E09', category: 'E_ADJACENT', label: 'Wine bar',
    website: 'https://vinoveritewinebar.com', restaurantName: 'Vino Verite Wine Bar',
    expected: 'any_qualified', note: 'Wine bar — food & beverage, should qualify',
  },
  {
    id: 'E10', category: 'E_ADJACENT', label: 'University dining .edu',
    website: 'https://dining.harvard.edu', restaurantName: 'Harvard University Dining',
    expected: 'clear_non_fit', note: '.edu institutional dining — not commercial restaurant',
  },
  {
    id: 'E11', category: 'E_ADJACENT', label: 'Food truck Linktree link-in-bio',
    website: 'https://linktr.ee/nomadkitchentacos', restaurantName: 'Nomad Kitchen Tacos',
    expected: null, note: 'Linktree URL for food truck — plausible or non-fit; observe',
  },
  {
    id: 'E12', category: 'E_ADJACENT', label: 'BBB listing URL for restaurant',
    website: 'https://bbb.org/us/tx/dallas/profile/restaurant', restaurantName: 'Dallas BBQ Place',
    expected: 'clear_non_fit', note: 'BBB listing URL — not the restaurant\'s own domain',
  },

  // ══ F. Restaurant Edge Cases (10) ════════════════════════════════════════════

  {
    id: 'F01', category: 'F_RESTAURANT', label: 'Non-English name (Spanish) in US',
    website: 'https://tacoselrancho.com', restaurantName: 'Tacos El Rancho',
    expected: 'any_qualified', note: 'Spanish restaurant name — classifier handles non-English',
  },
  {
    id: 'F02', category: 'F_RESTAURANT', label: 'Steakhouse with chophouse domain',
    website: 'https://dallassteakchophouse.com', restaurantName: 'Dallas Steak & Chophouse',
    expected: 'any_qualified', note: 'Steakhouse domain keywords positive signal',
  },
  {
    id: 'F03', category: 'F_RESTAURANT', label: 'Restaurant on Yelp listing page',
    website: 'https://www.yelp.com/biz/barneyshamburgers-houston', restaurantName: "Barney's Hamburgers",
    expected: null, note: 'Yelp listing URL — not own domain; platform detection; observe',
  },
  {
    id: 'F04', category: 'F_RESTAURANT', label: 'Fine dining Eleven Madison Park',
    website: 'https://elevenmadisonpark.com', restaurantName: 'Eleven Madison Park',
    expected: 'any_qualified', note: 'Elite fine dining — known restaurant URL',
  },
  {
    id: 'F05', category: 'F_RESTAURANT', label: 'Restaurant with apostrophe in name',
    website: 'https://obriensirishpub.com', restaurantName: "O'Brien's Irish Pub",
    expected: 'any_qualified', note: 'Apostrophe in name — chain detection must not false-flag',
  },
  {
    id: 'F06', category: 'F_RESTAURANT', label: 'Pop-up with possible placeholder site',
    website: 'https://underconstruction-placeholder.com', restaurantName: 'Underground Supper Club',
    expected: null, note: 'Possible under-construction site — plausible_unverified expected; observe',
  },
  {
    id: 'F07', category: 'F_RESTAURANT', label: 'Restaurant with .net domain',
    website: 'https://theurbankitchen.net', restaurantName: 'The Urban Kitchen',
    expected: 'any_qualified', note: '.net TLD — still valid restaurant domain',
  },
  {
    id: 'F08', category: 'F_RESTAURANT', label: 'BBQ restaurant hurtadobbq.com',
    website: 'https://hurtadobbq.com', restaurantName: 'Hurtado BBQ',
    expected: 'any_qualified', note: 'CRM restaurant — BBQ concept, should always pass',
  },
  {
    id: 'F09', category: 'F_RESTAURANT', label: 'Restaurant group — "restaurant" in domain',
    website: 'https://centurionrestaurantgroup.com', restaurantName: 'Centurion Restaurant Group',
    expected: 'any_qualified', note: '"restaurant" keyword in domain = strong positive signal',
  },
  {
    id: 'F10', category: 'F_RESTAURANT', label: 'Country club / private dining',
    website: 'https://dallasgolfclub.com', restaurantName: 'Dallas Golf Club Dining Room',
    expected: null, note: 'Country club — private dining; mixed signals; observe',
  },

  // ══ G. Known-Good Controls (9) — Must always pass ════════════════════════════

  {
    id: 'G01', category: 'G_CONTROL', label: "Barney's Hamburgers — primary CRM anchor",
    website: 'https://www.barneyshamburgers.com', restaurantName: "Barney's Hamburgers",
    expected: 'any_qualified', note: 'Primary CRM test case — must ALWAYS qualify',
  },
  {
    id: 'G02', category: 'G_CONTROL', label: 'Hurtado BBQ — Texas BBQ',
    website: 'https://hurtadobbq.com', restaurantName: 'Hurtado BBQ',
    expected: 'any_qualified', note: 'Control: Texas BBQ',
  },
  {
    id: 'G03', category: 'G_CONTROL', label: 'Selden Standard — fine dining, Cloudflare',
    website: 'https://seldenstandard.com', restaurantName: 'Selden Standard',
    expected: 'any_qualified', note: 'Control: fine dining (Cloudflare-protected)',
  },
  {
    id: 'G04', category: 'G_CONTROL', label: 'Rowayton Seafood',
    website: 'https://www.rowaytonseafood.com', restaurantName: 'Rowayton Seafood',
    expected: 'any_qualified', note: 'Control: seafood restaurant',
  },
  {
    id: "G05", category: 'G_CONTROL', label: "Mary Ann's Diner — case study",
    website: 'https://www.maryannsdiner.com', restaurantName: "Mary Ann's Diner",
    expected: 'any_qualified', note: 'Control: family diner (case study CRM)',
  },
  {
    id: 'G06', category: 'G_CONTROL', label: 'Eleven Madison Park — 3-star Michelin',
    website: 'https://elevenmadisonpark.com', restaurantName: 'Eleven Madison Park',
    expected: 'any_qualified', note: 'Control: elite fine dining',
  },
  {
    id: 'G07', category: 'G_CONTROL', label: 'Iron Cactus — Tex-Mex multi-unit',
    website: 'https://ironcactus.com', restaurantName: 'Iron Cactus',
    expected: 'any_qualified', note: 'Control: Tex-Mex casual multi-unit',
  },
  {
    id: 'G08', category: 'G_CONTROL', label: 'Grass Burger — fast casual',
    website: 'https://grassburger.com', restaurantName: 'Grass Burger',
    expected: 'any_qualified', note: 'Control: fast casual burger brand',
  },
  {
    id: 'G09', category: 'G_CONTROL', label: 'Centurion Restaurant Group',
    website: 'https://centurionrestaurantgroup.com', restaurantName: 'Centurion Restaurant Group',
    expected: 'any_qualified', note: 'Control: restaurant group domain',
  },
];

// ── API call ──────────────────────────────────────────────────────────────────

interface ValidationResult {
  finalDecision: string;
  restaurantSignalScore: number;
  negativeSignalScore: number;
  nationalChainScore: number;
  countryEligibility: string;
  websiteReachabilityStatus: string;
  headlessBrowserUsed: boolean;
  reasons: string[];
  manualReviewRequired: boolean;
  confidence?: { score: number; tier: string };
}

async function callValidateWebsite(tc: TestCase): Promise<{
  success: boolean; status: number; result: ValidationResult | null; ms: number; error?: string;
}> {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}/api/validate-website`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        website: tc.website,
        restaurantName: tc.restaurantName,
        ...(tc.conceptType ? { conceptType: tc.conceptType } : {}),
      }),
      signal: AbortSignal.timeout(35_000),
    });
    const body = await res.json() as { success: boolean; result?: ValidationResult; error?: string };
    return { success: body.success ?? res.ok, status: res.status, result: body.result ?? null, ms: Date.now() - start, error: body.error };
  } catch (err) {
    return { success: false, status: 0, result: null, ms: Date.now() - start, error: err instanceof Error ? err.message : String(err) };
  }
}

function meetsExpectation(actual: string, expected: ExpectedDecision): boolean {
  if (!expected) return true;
  if (expected === 'any_non_fit') return actual === 'clear_non_fit' || actual === 'national_chain';
  if (expected === 'any_qualified') return actual === 'verified_restaurant' || actual === 'plausible_unverified';
  return actual === expected;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  console.log('\n' + '═'.repeat(72));
  console.log('FSIQ PRODUCTION BREAK TEST — Part 1: Validation API (75 cases)');
  console.log('═'.repeat(72));
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Endpoint: POST /api/validate-website`);
  console.log(`  Rate limit: ${DELAY_MS}ms between requests\n`);

  const results: Array<{
    id: string; category: string; label: string; website: string;
    apiDecision: string; expected: string | null; pass: boolean;
    signalScore: number; negScore: number; chainScore: number;
    reachability: string; headless: boolean; ms: number;
    reasons: string[]; issue: string | null;
  }> = [];

  const byCategory: Record<string, { pass: number; fail: number; noAssert: number; issues: string[] }> = {};

  let currentCategory = '';

  for (let i = 0; i < TESTS.length; i++) {
    const tc = TESTS[i];

    if (tc.category !== currentCategory) {
      currentCategory = tc.category;
      const catHeader: Record<string, string> = {
        'A_URL_NORM': 'A. URL Normalization (14)',
        'B_FAILURE':  'B. DNS/HTTP Failures (6)',
        'C_CHAIN':    'C. National Chain Detection (12)',
        'D_NONFIT':   'D. Clear Non-Fits (12)',
        'E_ADJACENT': 'E. Food-Adjacent (12)',
        'F_RESTAURANT': 'F. Restaurant Edge Cases (10)',
        'G_CONTROL':  'G. Known-Good Controls (9)',
      };
      console.log(`\n  ── ${catHeader[tc.category] ?? tc.category} ──`);
    }

    if (!byCategory[tc.category]) {
      byCategory[tc.category] = { pass: 0, fail: 0, noAssert: 0, issues: [] };
    }

    const call = await callValidateWebsite(tc);
    const decision = call.result?.finalDecision ??
      (call.error?.includes('timeout') ? 'timeout' :
       call.error?.includes('AbortError') ? 'timeout' : 'error');
    const hasAssert = tc.expected !== null;
    const pass = meetsExpectation(decision, tc.expected);

    let issueText: string | null = null;
    if (hasAssert && !pass) {
      issueText = `Expected ${tc.expected} → got ${decision}`;
      byCategory[tc.category].fail++;
      byCategory[tc.category].issues.push(`[${tc.id}] ${issueText}`);
    } else if (hasAssert) {
      byCategory[tc.category].pass++;
    } else {
      byCategory[tc.category].noAssert++;
    }

    results.push({
      id: tc.id, category: tc.category, label: tc.label, website: tc.website,
      apiDecision: decision, expected: tc.expected ?? null, pass: !hasAssert || pass,
      signalScore: call.result?.restaurantSignalScore ?? -1,
      negScore: call.result?.negativeSignalScore ?? -1,
      chainScore: call.result?.nationalChainScore ?? -1,
      reachability: call.result?.websiteReachabilityStatus ?? 'unknown',
      headless: call.result?.headlessBrowserUsed ?? false,
      ms: call.ms, reasons: call.result?.reasons ?? [],
      issue: issueText,
    });

    const decisionIcon = decision === 'verified_restaurant' ? '✅' :
                         decision === 'plausible_unverified' ? '⚠️ ' :
                         decision === 'national_chain' ? '🚫' :
                         decision === 'clear_non_fit' ? '❌' :
                         decision === 'invalid_website' ? '🔴' : '💀';
    const assertIcon = hasAssert ? (pass ? ' ✓' : ' ✗') : '  ';
    const scores = call.result
      ? ` r:${String(call.result.restaurantSignalScore).padStart(3)} n:${String(call.result.negativeSignalScore).padStart(3)}`
      : ' no data';
    const h = call.result?.headlessBrowserUsed ? ' [hl]' : '';

    process.stdout.write(
      `  [${tc.id}]${assertIcon} ${decisionIcon} ${decision.padEnd(24)} ${scores}${h.padEnd(5)} ${tc.label.slice(0, 38)}\n`
    );

    await sleep(DELAY_MS);
  }

  // ── Summary ────────────────────────────────────────────────────────────────

  const totalWithAssert = results.filter(r => r.expected !== null).length;
  const passed = results.filter(r => r.expected !== null && r.pass).length;
  const failed = results.filter(r => r.expected !== null && !r.pass).length;
  const noAssert = results.filter(r => r.expected === null).length;
  const wallSec = Math.round((Date.now() - startTime) / 1000);
  const avgMs = Math.round((Date.now() - startTime) / TESTS.length);

  console.log('\n' + '═'.repeat(72));
  console.log('RESULTS SUMMARY');
  console.log('═'.repeat(72));
  console.log(`  Assertions: ${totalWithAssert} | ✅ Passed: ${passed} | ❌ Failed: ${failed} | ⊘ Observe-only: ${noAssert}`);
  console.log(`  Accuracy: ${Math.round(passed / totalWithAssert * 100)}% | Runtime: ${wallSec}s (${avgMs}ms avg)\n`);

  const catLabels: Record<string, string> = {
    'A_URL_NORM':   'A. URL normalization  (14)',
    'B_FAILURE':    'B. DNS/HTTP failures   (6)',
    'C_CHAIN':      'C. National chains    (12)',
    'D_NONFIT':     'D. Clear non-fits     (12)',
    'E_ADJACENT':   'E. Food-adjacent      (12)',
    'F_RESTAURANT': 'F. Restaurant edges   (10)',
    'G_CONTROL':    'G. Control group       (9)',
  };
  for (const [cat, stats] of Object.entries(byCategory)) {
    const total = stats.pass + stats.fail;
    const pct = total > 0 ? Math.round(stats.pass / total * 100) : 100;
    const noAssertStr = stats.noAssert > 0 ? ` + ${stats.noAssert} observe-only` : '';
    const indicator = stats.fail > 0 ? '❌' : '✅';
    console.log(`  ${indicator} ${catLabels[cat] || cat}: ${stats.pass}/${total} (${pct}%)${noAssertStr}`);
    stats.issues.forEach(i => console.log(`       ↳ ${i}`));
  }

  if (failed > 0) {
    console.log('\n' + '─'.repeat(72));
    console.log('FAILURES — actionable issues:');
    results.filter(r => r.expected !== null && !r.pass).forEach(f => {
      console.log(`\n  [${f.id}] ${f.label}`);
      console.log(`    URL:      ${f.website}`);
      console.log(`    Decision: ${f.apiDecision}  Expected: ${f.expected}`);
      console.log(`    Scores:   restaurant=${f.signalScore} negative=${f.negScore} reachability=${f.reachability}`);
      if (f.reasons.length) console.log(`    Reasons:  ${f.reasons.slice(0, 3).join(' | ')}`);
    });
  }

  const observations = results.filter(r => r.expected === null);
  if (observations.length) {
    console.log('\n' + '─'.repeat(72));
    console.log('OBSERVATIONS (no assertion — classifier behavior logged):');
    observations.forEach(o => {
      const icon = o.apiDecision === 'verified_restaurant' ? '✅' :
                   o.apiDecision === 'plausible_unverified' ? '⚠️ ' :
                   o.apiDecision === 'national_chain' ? '🚫' :
                   o.apiDecision === 'clear_non_fit' ? '❌' :
                   o.apiDecision === 'invalid_website' ? '🔴' : '💀';
      console.log(`  [${o.id}] ${icon} ${o.apiDecision.padEnd(26)} ${o.label}`);
    });
  }

  const report = {
    generated_at: new Date().toISOString(),
    base_url: BASE_URL,
    summary: { total: TESTS.length, asserted: totalWithAssert, passed, failed, observe_only: noAssert, wall_time_s: wallSec, avg_ms: avgMs },
    by_category: byCategory,
    results,
  };
  fs.writeFileSync('break-test-api-results.json', JSON.stringify(report, null, 2));

  console.log('\n📄 break-test-api-results.json saved');
  console.log(`\n${failed > 0 ? '❌' : '✅'} ${failed > 0 ? `${failed} assertion failures found` : 'All assertions passed'}\n`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
