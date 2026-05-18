#!/usr/bin/env npx tsx
// Builds the 20-scenario validation failure inventory requested in May 18 QA.

import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkWebsite } from '../src/lib/website/check-website';
import { runValidation } from '../src/lib/website/run-validation';
import type { ValidationResult } from '../src/lib/website/types';
import type { WebsiteSignals } from '../src/lib/website/extract-signals';

interface ScenarioSeed {
  id: number;
  name: string;
  description: string;
  volume: 'high' | 'medium' | 'low';
  rootCause: string;
  affectedVolume: 'high' | 'medium' | 'low';
  proposedFix: string;
  fixRisk: 'high' | 'medium' | 'low';
  estimatedImpact: string;
  priority: number;
  examples: ExampleSeed[];
}

interface ExampleSeed {
  name: string;
  url: string;
  city: string;
  state: string;
  verificationSource: string;
}

interface ScenarioExample extends ExampleSeed {
  finalDecision: string;
  httpStatus: number;
  restaurantSignalScore: number;
  signalsFound: string[];
  signalsMissing: string[];
  failureCategory: string;
}

const OUTPUT_JSON = path.join(process.cwd(), 'scripts', '10-scenarios.json');
const OUTPUT_TXT = path.join(process.cwd(), 'scripts', '10-scenarios-summary.txt');

const SCENARIOS: ScenarioSeed[] = [
  {
    id: 1,
    name: 'JS-rendered websites',
    description: 'The first HTTP response is a shell or thin loader, while menu/location content is rendered by JavaScript after load.',
    volume: 'high',
    rootCause: 'checkWebsite() extracts signals from the raw fetch body only. headlessFetch() is attempted for thin pages, but failures leave extractSignals() with empty or loader HTML, so computeRestaurantScores() sees no schema, menu, hours, or cuisine text.',
    affectedVolume: 'high',
    proposedFix: 'Make the headless fallback deterministic for thin/JS shells, persist rendered HTML, and add framework-shell detection for Wix/Squarespace/React loader pages.',
    fixRisk: 'medium',
    estimatedImpact: 'Could address most minimal_html/js_rendered rows: about 15-25% of reachable failures in the current failure hunt.',
    priority: 3,
    examples: [
      { name: "Tarbell's", url: 'https://www.tarbell.com', city: 'Phoenix', state: 'AZ', verificationSource: 'seed/failure-hunt' },
      { name: 'The Catfish Hole', url: 'https://www.catfishhole.com', city: 'Fayetteville', state: 'AR', verificationSource: 'seed/failure-hunt' },
      { name: 'Bacchanalia', url: 'https://www.bacchanalia.com', city: 'Atlanta', state: 'GA', verificationSource: 'seed/failure-hunt' },
      { name: 'Girl & the Goat', url: 'https://girlandthegoat.com', city: 'Chicago', state: 'IL', verificationSource: 'seed/failure-hunt' },
    ],
  },
  {
    id: 2,
    name: 'Non-English and localized websites',
    description: 'Restaurant pages use Spanish, Chinese, Vietnamese, or transliterated menu language that is not represented in the English keyword list.',
    volume: 'medium',
    rootCause: 'MODERATE_TEXT_KEYWORDS and STRONG_POSITIVE_TEXT are English-only, and extractSignals() does not identify language or translated equivalents such as menu/menú, reservas, pho, dim sum, taqueria variants, or Chinese/Korean/Vietnamese menu labels.',
    affectedVolume: 'medium',
    proposedFix: 'Add multilingual restaurant lexicons for common US restaurant languages and score hreflang/lang plus translated menu/reservation/hour terms.',
    fixRisk: 'medium',
    estimatedImpact: 'Likely low hundreds in a 5,000 failure set, concentrated in metro markets.',
    priority: 8,
    examples: [
      { name: 'Pho 79', url: 'https://www.pho79newportnews.com', city: 'Newport News', state: 'VA', verificationSource: 'web/known restaurant' },
      { name: 'Pho Bac', url: 'https://www.phobacseattle.com', city: 'Seattle', state: 'WA', verificationSource: 'web/known restaurant' },
      { name: 'La Casita Mexicana', url: 'https://www.lacasitamex.com', city: 'Bell', state: 'CA', verificationSource: 'web/known restaurant' },
      { name: 'Chengdu Taste', url: 'https://www.chengdutaste.com', city: 'Alhambra', state: 'CA', verificationSource: 'web/known restaurant' },
    ],
  },
  {
    id: 3,
    name: 'Third-party platform pages',
    description: 'The submitted website is a Toast, Square, Popmenu, BentoBox, or similar hosted ordering/menu page rather than the restaurant root domain.',
    volume: 'high',
    rootCause: 'computeWebsiteRelationship() marks some platforms plausible, but platform-specific blocked HTML or thin app shells still score 0 because computeRestaurantScores() does not parse Toast/Square structured menu content or platform metadata.',
    affectedVolume: 'high',
    proposedFix: 'Add platform parsers and trusted platform path scoring for Toast/Square/Popmenu/BentoBox menu and merchant pages, with vendor-domain guardrails.',
    fixRisk: 'medium',
    estimatedImpact: 'High for SMB restaurants; likely 10-20% of organic submissions that use hosted ordering links.',
    priority: 2,
    examples: [
      { name: 'Toast Temecula', url: 'https://order.toasttab.com/online/toast-temecula', city: 'Temecula', state: 'CA', verificationSource: 'web search result' },
      { name: 'The Bagel Bar Cafe', url: 'https://order.toasttab.com/online/the-bagel-bar-cafe', city: 'Unknown', state: 'CA', verificationSource: 'web search result' },
      { name: 'Pho Auntie 7', url: 'https://phoauntie7.square.site', city: 'Unknown', state: 'CA', verificationSource: 'web search result' },
      { name: 'Gyro Hub Verdazo', url: 'https://gyro-hub-verdazo.square.site', city: 'Houston', state: 'TX', verificationSource: 'web search result' },
    ],
  },
  {
    id: 4,
    name: 'Owner or abstract brand domains with no food signals',
    description: 'The brand/domain is a person, invented word, or abstract restaurant name and the page has only weak food terms, so domain scoring adds little.',
    volume: 'medium',
    rootCause: 'Domain scoring only rewards explicit restaurant words. With restaurantName intentionally blank in this validation mode, relationshipScore is low and owner/abstract domains must reach 60 entirely from extracted page text.',
    affectedVolume: 'medium',
    proposedFix: 'Add stronger weighting for menu/hours/phone combinations and title/meta restaurant phrases so owner-name domains do not need food words in the hostname.',
    fixRisk: 'low',
    estimatedImpact: 'Medium; several baseline low_signal_score rows sit just under threshold.',
    priority: 6,
    examples: [
      { name: 'State Bird Provisions', url: 'https://statebirdsf.com', city: 'San Francisco', state: 'CA', verificationSource: 'seed/failure-hunt' },
      { name: 'Staplehouse', url: 'https://staplehouse.com', city: 'Atlanta', state: 'GA', verificationSource: 'seed/failure-hunt' },
      { name: 'Alinea', url: 'https://alinearestaurant.com', city: 'Chicago', state: 'IL', verificationSource: 'seed/failure-hunt' },
      { name: 'Milktooth', url: 'https://milktoothindy.com', city: 'Indianapolis', state: 'IN', verificationSource: 'seed/failure-hunt' },
    ],
  },
  {
    id: 5,
    name: 'New restaurants with thin web presence',
    description: 'Newer or recently relaunched restaurants have sparse websites, missing schema, and little crawlable text.',
    volume: 'medium',
    rootCause: 'The rule threshold requires 60 points. Thin pages with a title, phone, or a few links often land in the 0-40 range and fall to Claude fallback, which is disabled without an API key.',
    affectedVolume: 'medium',
    proposedFix: 'Create a thin-but-plausible restaurant rule for combinations of title/meta/location/phone/menu PDF or social links, plus optional manual-review continuation.',
    fixRisk: 'medium',
    estimatedImpact: 'Medium; overlaps with minimal_html and low_signal_score categories.',
    priority: 9,
    examples: [
      { name: 'Tusk Lounge', url: 'https://www.tusklounge.com', city: 'Bentonville', state: 'AR', verificationSource: 'seed/failure-hunt' },
      { name: 'Herbers HQ', url: 'https://www.herbershq.com', city: 'Bentonville', state: 'AR', verificationSource: 'seed/failure-hunt' },
      { name: 'Ondas Kitchen', url: 'https://ondaskitchen.com', city: 'New Castle', state: 'DE', verificationSource: 'seed/failure-hunt' },
    ],
  },
  {
    id: 6,
    name: 'Single-page websites with no navigation',
    description: 'The site has all information on one page or hidden panels, so nav-link detection sees no Menu/Reservations links.',
    volume: 'medium',
    rootCause: 'extractNavLinkTexts() reads anchor text, preferably inside nav. It does not score headings, buttons, section IDs, or unlinked menu/hours sections strongly enough.',
    affectedVolume: 'medium',
    proposedFix: 'Add section-heading/button text extraction and score body headings for menu, hours, address, call, reserve, and order patterns.',
    fixRisk: 'low',
    estimatedImpact: 'Medium; many failure-hunt rows have meta/phone/schema but missing menu_nav and reservations_nav.',
    priority: 7,
    examples: [
      { name: 'The Cellar', url: 'https://www.thecellarcda.com', city: "Coeur d'Alene", state: 'ID', verificationSource: 'seed/failure-hunt' },
      { name: 'The Dogfish Cafe', url: 'https://www.thedogfish.com', city: 'Portland', state: 'ME', verificationSource: 'seed/failure-hunt' },
      { name: 'Row 34', url: 'https://www.row34.com', city: 'Boston', state: 'MA', verificationSource: 'seed/failure-hunt' },
      { name: 'Staplehouse', url: 'https://staplehouse.com', city: 'Atlanta', state: 'GA', verificationSource: 'seed/failure-hunt' },
    ],
  },
  {
    id: 7,
    name: 'Rural and small-town restaurants',
    description: 'Small-town operators often use older hosts, expired domains, PDFs, or very basic sites with little structured markup.',
    volume: 'medium',
    rootCause: 'Network failures and thin content produce no extractable signals. There is no fallback to HTTP, www/non-www alternates, DNS diagnostics, or external evidence.',
    affectedVolume: 'medium',
    proposedFix: 'Add alternate-host retry strategy and score reachable PDF/menu/social fallbacks for small-town style sites.',
    fixRisk: 'medium',
    estimatedImpact: 'Medium; many timeout rows are likely stale or alternate-host issues.',
    priority: 4,
    examples: [
      { name: 'The Catfish Hole', url: 'https://www.catfishhole.com', city: 'Fayetteville', state: 'AR', verificationSource: 'seed/failure-hunt' },
      { name: 'The Deck', url: 'https://www.thedeckrestaurant.com', city: 'Meredith', state: 'NH', verificationSource: 'seed/failure-hunt' },
      { name: "Haleiwa Joe's", url: 'https://www.haleiwajoes.com', city: 'Haleiwa', state: 'HI', verificationSource: 'seed/failure-hunt' },
      { name: 'Bancroft on the Green', url: 'https://www.bancroftonthegreen.com', city: 'Wilmington', state: 'DE', verificationSource: 'seed/failure-hunt' },
    ],
  },
  {
    id: 8,
    name: 'Food trucks and pop-ups',
    description: 'Mobile operators use Square/Wix/menu-only pages and often lack fixed-location reservation signals.',
    volume: 'medium',
    rootCause: 'The classifier expects restaurant-style site structure. Food-truck terms and hosted mobile-menu pages are underweighted, and Square/Wix shells are often thin.',
    affectedVolume: 'medium',
    proposedFix: 'Add food truck/pop-up lexicon and score hosted menu pages with phone, hours, and menu categories as foodservice operators.',
    fixRisk: 'low',
    estimatedImpact: 'Medium for lead sources that accept mobile operators.',
    priority: 10,
    examples: [
      { name: 'Gyro Hub Verdazo', url: 'https://gyro-hub-verdazo.square.site', city: 'Houston', state: 'TX', verificationSource: 'web search result' },
      { name: 'Mack the Knife', url: 'https://mack-the-knife.square.site', city: 'Margate', state: 'FL', verificationSource: 'web search result' },
      { name: 'Restaurant 51 Food Truck', url: 'https://restaurant-51-food-truck.square.site', city: 'Boston', state: 'MA', verificationSource: 'web search result' },
      { name: 'Cousins Maine Lobster', url: 'https://www.cousinsmainelobster.com', city: 'Los Angeles', state: 'CA', verificationSource: 'web/known food truck brand' },
    ],
  },
  {
    id: 9,
    name: 'Restaurants behind login or reservation walls',
    description: 'Exclusive restaurants and supper clubs expose limited marketing pages while booking or details live behind a reservation workflow.',
    volume: 'low',
    rootCause: 'The fetch path sees the public shell only. Login/reservation widgets are not followed, and reservation-only language does not carry enough score.',
    affectedVolume: 'low',
    proposedFix: 'Detect reservation-only/member/login flows as plausible foodservice signals and extract linked Tock/Resy/OpenTable restaurant metadata.',
    fixRisk: 'medium',
    estimatedImpact: 'Low overall, high in fine-dining segments.',
    priority: 15,
    examples: [
      { name: "Rao's", url: 'https://raosrestaurants.com', city: 'New York', state: 'NY', verificationSource: 'web/known restaurant' },
      { name: 'Bohemian', url: 'https://www.playearth.jp/bohemian', city: 'New York', state: 'NY', verificationSource: 'web/known restaurant' },
      { name: 'Mosquito Supper Club', url: 'https://www.mosquitosupperclub.com', city: 'New Orleans', state: 'LA', verificationSource: 'web search result' },
    ],
  },
  {
    id: 10,
    name: 'Names resembling national chains',
    description: 'Independent restaurants or pubs have names/domains that contain terms like Subway, McDonald, or Waffle House.',
    volume: 'low',
    rootCause: 'detectNationalChain() can classify by exact known domain or full alias in title/name. With no submitted name this is less common, but page-title alias collisions remain a risk.',
    affectedVolume: 'low',
    proposedFix: 'Require exact brand-domain match or stronger multi-signal chain evidence before national_chain when the user-provided name is empty.',
    fixRisk: 'low',
    estimatedImpact: 'Low, but prevents hard false rejections.',
    priority: 18,
    examples: [
      { name: 'Subway Cafe', url: 'https://subwaycafe.com', city: 'Unknown', state: 'CA', verificationSource: 'web/domain example' },
      { name: "McDonald's Pub", url: 'https://mcdonaldspub.com', city: 'Unknown', state: 'CA', verificationSource: 'web/domain example' },
      { name: 'Waffle House Pub', url: 'https://wafflehousepub.com', city: 'Unknown', state: 'CA', verificationSource: 'web/domain example' },
    ],
  },
  {
    id: 11,
    name: 'Network-inaccessible real restaurant domains',
    description: 'Curated restaurant domains return network errors or never produce HTML from server-side fetch.',
    volume: 'high',
    rootCause: 'checkWebsite() returns signals null on network_error/inaccessible, leaving scores at zero. The current pipeline lets users continue, but cannot verify them.',
    affectedVolume: 'high',
    proposedFix: 'Add alternate scheme/host retries, shorter HEAD preflight, DNS classification, and optional external evidence lookup before giving up.',
    fixRisk: 'medium',
    estimatedImpact: 'Highest; 54/100 baseline failures and 215/345 failure-hunt rows were inaccessible.',
    priority: 1,
    examples: [
      { name: 'Ole Bay Cafe', url: 'https://olebaycafe.com', city: 'Mobile', state: 'AL', verificationSource: 'seed/failure-hunt' },
      { name: 'Ocean Restaurant', url: 'https://www.oceanrestaurant.net', city: 'Birmingham', state: 'AL', verificationSource: 'seed/failure-hunt' },
      { name: 'Bottega', url: 'https://bottegafrombirmingham.com', city: 'Birmingham', state: 'AL', verificationSource: 'seed/failure-hunt' },
      { name: 'Marx Bros Cafe', url: 'https://www.marxbroscafe.com', city: 'Anchorage', state: 'AK', verificationSource: 'seed/failure-hunt' },
    ],
  },
  {
    id: 12,
    name: 'Stale, moved, or 404 restaurant domains',
    description: 'The restaurant is real but the seed/submitted URL has moved, expired, or points at a dead old path.',
    volume: 'medium',
    rootCause: 'classifyReachability() treats 404 as invalid_website and runValidation() exits early, so no plausible continuation is available even if the brand is real elsewhere.',
    affectedVolume: 'medium',
    proposedFix: 'For 404 on restaurant-looking domains, offer plausible_unverified/manual review and optionally try search-discovered canonical domains.',
    fixRisk: 'medium',
    estimatedImpact: 'Medium; 8 invalid rows in failure-hunt and 3 in the 100-failure sample.',
    priority: 5,
    examples: [
      { name: "Tracy's King Crab Shack", url: 'https://tracyskingcrab.com', city: 'Juneau', state: 'AK', verificationSource: 'seed/failure-hunt' },
      { name: 'Hai Hai', url: 'https://linktr.ee/haihaipdx', city: 'Portland', state: 'OR', verificationSource: 'web/domain example' },
      { name: 'Bohemian', url: 'https://www.playearth.jp/bohemian', city: 'New York', state: 'NY', verificationSource: 'web/known restaurant' },
    ],
  },
  {
    id: 13,
    name: 'Bot-protected pages with no useful metadata',
    description: 'Cloudflare/security pages return 403 or challenge HTML without the restaurant title/meta/schema.',
    volume: 'medium',
    rootCause: 'checkWebsite() now reads 403 HTML, but the challenge page has generic title/body. computeProtectedRestaurantContextScore() can only use domain/path/meta and still fails when those are generic.',
    affectedVolume: 'medium',
    proposedFix: 'Add richer protected-site heuristics: favicon/domain history, known restaurant terms in brand domain, and optional external SERP/title fallback.',
    fixRisk: 'medium',
    estimatedImpact: 'Medium; 7/100 baseline failures and 17/345 failure-hunt rows were bot/cloudflare related.',
    priority: 11,
    examples: [
      { name: 'The Ravenous Pig', url: 'https://www.theravenouspig.com', city: 'Winter Park', state: 'FL', verificationSource: 'seed/failure-hunt' },
      { name: 'Saint Anejo', url: 'https://www.saintanejo.com', city: 'Des Moines', state: 'IA', verificationSource: 'seed/failure-hunt' },
      { name: 'Auberge du Soleil Dining', url: 'https://aubergeresorts.com/aubergedusoleil/dine/', city: 'Rutherford', state: 'CA', verificationSource: 'web/known restaurant' },
    ],
  },
  {
    id: 14,
    name: 'Generic schema.org only',
    description: 'Pages include Organization/WebSite schema, but not Restaurant/FoodEstablishment schema.',
    volume: 'high',
    rootCause: 'hasRestaurantSchema only recognizes a short allow-list. Generic schema_org was found in 67 failure-hunt rows but restaurant_schema was missing in every failure row.',
    affectedVolume: 'high',
    proposedFix: 'Infer restaurant intent from generic schema combined with menu/hours/address/phone and parse nested @graph names/descriptions for food terms.',
    fixRisk: 'low',
    estimatedImpact: 'High among reachable low_signal_score pages.',
    priority: 12,
    examples: [
      { name: 'State Bird Provisions', url: 'https://statebirdsf.com', city: 'San Francisco', state: 'CA', verificationSource: 'seed/failure-hunt' },
      { name: 'Alinea', url: 'https://alinearestaurant.com', city: 'Chicago', state: 'IL', verificationSource: 'seed/failure-hunt' },
      { name: 'Pizzeria Bianco', url: 'https://pizzeriabianco.com', city: 'Phoenix', state: 'AZ', verificationSource: 'seed/failure-hunt' },
    ],
  },
  {
    id: 15,
    name: 'OpenGraph/meta-only restaurant pages',
    description: 'Restaurant evidence exists in title, meta, og:image, or phone number but not enough body/nav text is crawlable.',
    volume: 'medium',
    rootCause: 'Metadata contributes only modest points in computeRestaurantScores(), and phone/og/image are weak even when they are the only visible signals.',
    affectedVolume: 'medium',
    proposedFix: 'Add a metadata bundle rule: restaurant-like title/meta plus phone/og image/address should reach verified or protected context threshold.',
    fixRisk: 'low',
    estimatedImpact: 'Medium; failure-hunt found meta_description in 72 rows and og_image in 65 rows.',
    priority: 13,
    examples: [
      { name: 'The Cellar', url: 'https://www.thecellarcda.com', city: "Coeur d'Alene", state: 'ID', verificationSource: 'seed/failure-hunt' },
      { name: 'The Dogfish Cafe', url: 'https://www.thedogfish.com', city: 'Portland', state: 'ME', verificationSource: 'seed/failure-hunt' },
      { name: "Elway's", url: 'https://www.elways.com', city: 'Denver', state: 'CO', verificationSource: 'seed/failure-hunt' },
    ],
  },
  {
    id: 16,
    name: 'PDF-only menus and direct PDF URLs',
    description: 'The submitted site or strongest evidence is a PDF menu hosted by Square, BentoBox, or a restaurant CMS.',
    volume: 'medium',
    rootCause: 'checkWebsite() only reads HTML bodies. PDF content-type responses produce no bodyText/signals, so menu terms inside PDFs are invisible.',
    affectedVolume: 'medium',
    proposedFix: 'Detect application/pdf, mark as plausible foodservice when URL/path/title has menu or restaurant terms, and optionally extract first-page text with a lightweight PDF parser.',
    fixRisk: 'medium',
    estimatedImpact: 'Medium for small-town, food-truck, and catering operators.',
    priority: 14,
    examples: [
      { name: 'Pho Auntie 7 Menu PDF', url: 'https://phoauntie7.square.site/uploads/b/4827ad00-ab91-11eb-82fa-2b0aaa385d39/PHO%20AUNTIE%207%20MENU.pdf', city: 'Unknown', state: 'CA', verificationSource: 'web search result' },
      { name: "Jessie Lou's Menu PDF", url: 'https://jessielou757.square.site/uploads/b/bc9c8030-6a4a-11ea-951f-299fd17be793/Menu_summer2020.pdf', city: 'Virginia Beach', state: 'VA', verificationSource: 'web search result' },
      { name: 'Sprout Sandwich Shop Catering PDF', url: 'https://sprout-sandwich-shop.square.site/uploads/b/de15b3a0-db12-11e9-a4b6-a320b8c3151e/74abce80-32fc-11f1-a33c-c9326a2c4e57.pdf', city: 'Unknown', state: 'CA', verificationSource: 'web search result' },
    ],
  },
  {
    id: 17,
    name: 'Huge HTML where restaurant cues are past the 5KB body cutoff',
    description: 'Some restaurant pages ship large scripts/styles or unrelated boilerplate before the useful content.',
    volume: 'medium',
    rootCause: 'extractSignals() strips HTML and then slices bodyText to 5,000 characters. If menu/location/cuisine appears later, computeRestaurantScores() never sees it.',
    affectedVolume: 'medium',
    proposedFix: 'Score full extracted text for keyword presence or keep targeted windows around menu/hours/address terms before truncating for downstream prompts.',
    fixRisk: 'low',
    estimatedImpact: 'Medium; failure-hunt rows include very large HTML with score 0 and only meta/schema hints.',
    priority: 16,
    examples: [
      { name: "Craigie on Main", url: 'https://www.craigieonmain.com', city: 'Cambridge', state: 'MA', verificationSource: 'seed/failure-hunt' },
      { name: "DeLorenzo's Tomato Pies", url: 'https://www.delorenzospizza.com', city: 'Robbinsville', state: 'NJ', verificationSource: 'seed/failure-hunt' },
      { name: 'Girl & the Goat', url: 'https://girlandthegoat.com', city: 'Chicago', state: 'IL', verificationSource: 'seed/failure-hunt' },
    ],
  },
  {
    id: 18,
    name: 'Hospitality group and hotel restaurant dilution',
    description: 'Restaurant pages live under hotel or group domains where lodging/private-event content dilutes the restaurant evidence.',
    volume: 'medium',
    rootCause: 'computeWebsiteRelationship() only has a few hospitality group patterns and no path-specific restaurant context rule for hotel/group domains.',
    affectedVolume: 'medium',
    proposedFix: 'Score restaurant-indicating paths under hotel/group domains and avoid penalizing low name-domain match when URL path contains dine/menu/restaurant.',
    fixRisk: 'medium',
    estimatedImpact: 'Medium for fine dining and hotel restaurants.',
    priority: 17,
    examples: [
      { name: 'The Capital Hotel Bar', url: 'https://thecappuccinohotel.com', city: 'Little Rock', state: 'AR', verificationSource: 'seed/failure-hunt' },
      { name: 'HoDo Restaurant', url: 'https://www.hoteldonaldson.com', city: 'Fargo', state: 'ND', verificationSource: 'seed/failure-hunt' },
      { name: 'Auberge du Soleil Dining', url: 'https://aubergeresorts.com/aubergedusoleil/dine/', city: 'Rutherford', state: 'CA', verificationSource: 'web/known restaurant' },
    ],
  },
  {
    id: 19,
    name: 'Hijacked or unrelated reused domains',
    description: 'A formerly valid restaurant domain now serves unrelated content, gambling/blog content, or another business.',
    volume: 'low',
    rootCause: 'The pipeline correctly avoids verification, but failure metrics count these as restaurant misses unless stale-domain/hijack is separated from classifier bugs.',
    affectedVolume: 'low',
    proposedFix: 'Add stale/hijacked domain failure category using title/meta mismatch and strong non-food topic detection, so benchmarks do not treat them as fixable restaurant false negatives.',
    fixRisk: 'low',
    estimatedImpact: 'Low for product conversion, meaningful for benchmark accuracy.',
    priority: 19,
    examples: [
      { name: 'Domaine Hudson', url: 'https://www.domainehudson.com', city: 'Wilmington', state: 'DE', verificationSource: 'seed/failure-hunt' },
      { name: 'Milktooth', url: 'https://milktoothindy.com', city: 'Indianapolis', state: 'IN', verificationSource: 'seed/failure-hunt' },
      { name: "John's Restaurant", url: 'https://www.johnsrestaurant.com', city: 'Birmingham', state: 'AL', verificationSource: 'seed/failure-hunt' },
    ],
  },
  {
    id: 20,
    name: 'Threshold cliff just below verified',
    description: 'Pages collect several weak-to-moderate restaurant signals but miss one strong signal, leaving them in the 50s rather than verified.',
    volume: 'medium',
    rootCause: 'applyDecisionRules() uses a hard restaurantSignalScore >= 60 threshold. Pages with title/meta/menu/phone/schema_org but no Restaurant schema or reservations link can stall at 50-59.',
    affectedVolume: 'medium',
    proposedFix: 'Add a confidence bundle rule for 50-59 scores when three independent restaurant signals are present and negativeSignalScore is low.',
    fixRisk: 'low',
    estimatedImpact: 'Medium; this directly targets reachable false negatives with strong but sub-threshold evidence.',
    priority: 20,
    examples: [
      { name: 'Union League Cafe', url: 'https://www.unionleaguecafe.com', city: 'New Haven', state: 'CT', verificationSource: 'seed/failure-hunt' },
      { name: 'The Optimist', url: 'https://www.theoptimistrestaurant.com', city: 'Atlanta', state: 'GA', verificationSource: 'seed/failure-hunt' },
      { name: 'Boise Fry Company', url: 'https://www.boisefrycompany.com', city: 'Boise', state: 'ID', verificationSource: 'seed/failure-hunt' },
      { name: 'Alinea', url: 'https://alinearestaurant.com', city: 'Chicago', state: 'IL', verificationSource: 'seed/failure-hunt' },
    ],
  },
];

async function main(): Promise<void> {
  const scenarios = [];
  for (const seed of SCENARIOS) {
    const examples: ScenarioExample[] = [];
    for (const example of seed.examples) {
      const validation = await runValidation({
        website: example.url,
        restaurantName: '',
        state: example.state || 'CA',
      });
      const diagnostics = await fetchDiagnostics(validation.finalUrl || example.url);
      examples.push({
        ...example,
        finalDecision: validation.finalDecision,
        httpStatus: validation.httpStatus,
        restaurantSignalScore: validation.restaurantSignalScore,
        signalsFound: buildSignalsFound(validation, diagnostics.signals),
        signalsMissing: buildSignalsMissing(diagnostics.signals),
        failureCategory: categorize(validation, diagnostics.signals),
      });
      process.stdout.write(`\rScenario ${seed.id}/20: ${example.name.slice(0, 45)}`);
    }
    scenarios.push({
      id: seed.id,
      name: seed.name,
      description: seed.description,
      volume: seed.volume,
      examples,
      rootCause: seed.rootCause,
      affectedVolume: seed.affectedVolume,
      proposedFix: seed.proposedFix,
      fixRisk: seed.fixRisk,
      estimatedImpact: seed.estimatedImpact,
    });
  }

  const ranked = [...SCENARIOS].sort((a, b) => a.priority - b.priority).map((s) => s.id);
  const payload = {
    generatedAt: new Date().toISOString(),
    methodology: [
      'Read validation code paths and parsed scripts/failure-hunt-results.json plus scripts/100-failures.json.',
      'Ran every scenario example through runValidation() with restaurantName set to an empty string.',
      'Examples are from seed/failure-hunt data or public web search results noted in verificationSource.',
    ],
    scenarios,
    summary: {
      highestVolumeScenario: 'Network-inaccessible real restaurant domains',
      easiestFix: 'Single-page websites with no navigation',
      highestImpactSingleChange: 'Add alternate-host/network fallback plus platform-specific parsing for hosted ordering/menu pages.',
      recommendedPriority: ranked,
    },
  };

  await writeFile(OUTPUT_JSON, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await writeFile(OUTPUT_TXT, buildSummary(payload.scenarios, ranked), 'utf8');
  console.log(`\nWrote ${OUTPUT_JSON}`);
  console.log(`Wrote ${OUTPUT_TXT}`);
}

async function fetchDiagnostics(url: string): Promise<{ signals: WebsiteSignals | null }> {
  try {
    const checked = await checkWebsite(url);
    return { signals: checked.signals };
  } catch {
    return { signals: null };
  }
}

function buildSignalsFound(result: ValidationResult, signals: WebsiteSignals | null): string[] {
  const found: string[] = [];
  if (signals?.hasRestaurantSchema) found.push('restaurant_schema');
  if (signals?.schemaOrgTypes.length) found.push('schema_org');
  if (signals?.hasAgeGate) found.push('age_gate');
  if (signals?.hasBotProtection) found.push('bot_protection');
  if (signals?.pageTitle) found.push('title_tag');
  if (signals?.metaDescription) found.push('meta_description');
  if (signals?.ogTitle) found.push('og_title');
  if (signals?.ogDescription) found.push('og_description');
  if (signals?.navLinkTexts.some((text) => /menu|reservation|reserve|order|catering|private dining/i.test(text))) found.push('restaurant_nav');
  if (signals?.bodyText && /menu|chef|restaurant|cuisine|pizza|burger|taco|seafood|steak|brunch|dinner|lunch/i.test(signals.bodyText)) found.push('restaurant_text');
  if (signals?.bodyText && /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(signals.bodyText)) found.push('phone_number');
  if (signals?.socialLinks.length) found.push('social_or_ordering_links');
  if (result.internalFlags.includes('thin_content')) found.push('thin_html');
  if (result.internalFlags.includes('http_403')) found.push('http_403');
  if (result.internalFlags.includes('network_error')) found.push('network_error');
  if (result.websiteReachabilityStatus === 'invalid') found.push('invalid_reachability');
  return [...new Set(found)];
}

function buildSignalsMissing(signals: WebsiteSignals | null): string[] {
  const missing: string[] = [];
  if (!signals?.hasRestaurantSchema) missing.push('restaurant_schema');
  if (!signals?.navLinkTexts.some((text) => /menu|reservation|reserve|order|catering|private dining/i.test(text))) missing.push('restaurant_nav');
  if (!signals?.metaDescription) missing.push('meta_description');
  if (!signals?.ogTitle) missing.push('og_title');
  if (!signals?.socialLinks.length) missing.push('social_or_ordering_links');
  if (!signals?.bodyText || !/menu|chef|restaurant|cuisine|pizza|burger|taco|seafood|steak|brunch|dinner|lunch/i.test(signals.bodyText)) missing.push('restaurant_text');
  return missing;
}

function categorize(result: ValidationResult, signals: WebsiteSignals | null): string {
  if (result.finalDecision === 'verified_restaurant') return 'currently_verified';
  if (result.websiteReachabilityStatus === 'invalid') return 'invalid_or_stale_url';
  if (result.websiteReachabilityStatus === 'inaccessible') return 'timeout_or_network_error';
  if (result.websiteReachabilityStatus === 'blocked' || signals?.hasBotProtection) return 'cloudflare_blocked';
  if (result.websiteReachabilityStatus === 'thin') return 'minimal_html';
  if (signals && signals.bodyText.length < 300 && signals.navLinkTexts.length === 0) return 'js_rendered';
  if (result.restaurantSignalScore < 60) return 'low_signal_score';
  return 'other';
}

function buildSummary(
  scenarios: Array<{ id: number; name: string; affectedVolume: string; fixRisk: string; estimatedImpact: string; examples: ScenarioExample[]; proposedFix: string }>,
  ranked: number[],
): string {
  const lines = [
    '20 Website Validation Failure Scenarios',
    '=======================================',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    'Combined Priority Ranking',
    '-------------------------',
    ranked.map((id, index) => {
      const scenario = scenarios.find((s) => s.id === id)!;
      return `${index + 1}. ${id}. ${scenario.name} (${scenario.affectedVolume} volume, ${scenario.fixRisk} risk)`;
    }).join('\n'),
    '',
    'Scenario Summaries',
    '------------------',
  ];

  for (const scenario of scenarios) {
    const failures = scenario.examples.filter((example) => example.finalDecision !== 'verified_restaurant').length;
    lines.push(
      '',
      `${scenario.id}. ${scenario.name}`,
      `Volume/Risk: ${scenario.affectedVolume}/${scenario.fixRisk}`,
      `Current examples still not verified: ${failures}/${scenario.examples.length}`,
      `Estimated impact: ${scenario.estimatedImpact}`,
      `Fix: ${scenario.proposedFix}`,
      'Examples:',
      ...scenario.examples.map((example) => `- ${example.name} (${example.url}) -> ${example.finalDecision}, score ${example.restaurantSignalScore}, ${example.failureCategory}`),
    );
  }

  lines.push(
    '',
    'Highest Volume Scenario: Network-inaccessible real restaurant domains',
    'Easiest Fix: Single-page websites with no navigation',
    'Highest Impact Single Change: Add alternate-host/network fallback plus platform-specific parsing for hosted ordering/menu pages.',
    '',
  );
  return lines.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
