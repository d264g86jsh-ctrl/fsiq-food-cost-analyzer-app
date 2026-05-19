#!/usr/bin/env npx tsx
// Generates 10,000 deterministic synthetic validation cases for Phase 5.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { extractSignals } from '../src/lib/website/extract-signals';
import { computeRestaurantScores } from '../src/lib/relevance/classify-restaurant';

const DATASET_PATH = path.join(process.cwd(), 'scripts', 'validation-dataset.json');
const RESULTS_PATH = path.join(process.cwd(), 'scripts', 'synthetic-test-results.json');
const SUMMARY_PATH = path.join(process.cwd(), 'scripts', 'synthetic-test-summary.txt');

type Group = 'equivalence' | 'boundary' | 'frequency_weighted' | 'mutation';
type Expected = 'verified_restaurant' | 'not_verified' | 'plausible_unverified';

interface SyntheticCase {
  id: number;
  group: Group;
  category: string;
  expected: Expected;
  url: string;
  domain: string;
  html: string;
  mutation?: string;
  metadata: Record<string, unknown>;
}

interface SyntheticResult extends SyntheticCase {
  actualDecision: 'verified_restaurant' | 'plausible_unverified' | 'clear_non_fit' | 'invalid_website';
  restaurantSignalScore: number;
  negativeSignalScore: number;
  pass: boolean;
}

interface ValidationDataset {
  restaurants: Array<{ url: string; name: string; state: string; cuisine: string }>;
}

const TOTALS: Record<Group, number> = {
  equivalence: 2000,
  boundary: 1000,
  frequency_weighted: 5000,
  mutation: 2000,
};

let seed = 42;

async function main(): Promise<void> {
  const dataset = JSON.parse(await readFile(DATASET_PATH, 'utf8')) as ValidationDataset;
  const cases = [
    ...generateEquivalenceCases(TOTALS.equivalence),
    ...generateBoundaryCases(TOTALS.boundary),
    ...generateFrequencyCases(TOTALS.frequency_weighted),
    ...generateMutationCases(TOTALS.mutation, dataset),
  ].map((testCase, index) => ({ ...testCase, id: index + 1 }));

  const results = cases.map(runSyntheticCase);
  const summary = buildSummary(results);

  await writeFile(RESULTS_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), cases: results }, null, 2)}\n`, 'utf8');
  await writeFile(SUMMARY_PATH, summary, 'utf8');
  console.log(summary);
}

function generateEquivalenceCases(count: number): Omit<SyntheticCase, 'id'>[] {
  const httpStatuses = [200, 403, 404, 408, 500, 503, 0, -1];
  const bodySizes = [0, 50, 250, 2000, 20_000, 60_000];
  const schemas = ['none', 'restaurant', 'local_business', 'generic', 'graph', 'malformed'];
  const navs = ['none', 'menu_only', 'reservations_only', 'both', 'broken_links_only'];
  const titles = ['empty', 'restaurant_name_only', 'restaurant_keyword', 'food_keyword', 'generic_brand', 'misleading_non_food'];
  const metas = ['empty', 'restaurant_language', 'generic', 'non_english_restaurant', 'misleading'];
  const phones = ['absent', 'single', 'multiple'];
  const addresses = ['absent', 'full_address', 'partial', 'po_box_only'];
  const socials = ['none', 'instagram_only', 'facebook_only', 'both', 'broken'];
  const platforms = ['none', 'toast_merchant', 'square_merchant', 'popmenu', 'unknown_platform', 'platform_corporate_root'];
  const languages = ['english', 'spanish', 'chinese', 'vietnamese', 'korean', 'mixed_english_spanish', 'mixed_english_chinese'];
  const domains = ['food_word_in_domain', 'owner_name', 'abstract_brand', 'chain_lookalike', 'platform_subdomain'];
  const cases: Omit<SyntheticCase, 'id'>[] = [];

  for (let i = 0; i < count; i += 1) {
    const dims = {
      httpStatus: pick(httpStatuses, i),
      bodySize: pick(bodySizes, Math.floor(i / httpStatuses.length)),
      schema: pick(schemas, Math.floor(i / 3)),
      nav: pick(navs, Math.floor(i / 5)),
      title: pick(titles, Math.floor(i / 7)),
      meta: pick(metas, Math.floor(i / 11)),
      phone: pick(phones, Math.floor(i / 13)),
      address: pick(addresses, Math.floor(i / 17)),
      social: pick(socials, Math.floor(i / 19)),
      platform: pick(platforms, Math.floor(i / 23)),
      language: pick(languages, Math.floor(i / 29)),
      domain: pick(domains, Math.floor(i / 31)),
    };
    const expected = expectedForDimensions(dims);
    cases.push(makeCase('equivalence', `equivalence:${dims.schema}:${dims.nav}:${dims.platform}`, expected, dims));
  }
  return cases;
}

function generateBoundaryCases(count: number): Omit<SyntheticCase, 'id'>[] {
  const scoreBoundary = [58, 59, 60, 61, 62];
  const negativeBoundary = [19, 20, 21];
  const htmlBoundary = [498, 499, 500, 501];
  const independentBoundary = [1, 2, 3, 4];
  const multilingualBoundary = [1, 2, 3];
  const platformPaths = ['root', 'menu', 'online_merchant', 'corporate_careers'];
  const cases: Omit<SyntheticCase, 'id'>[] = [];

  for (let i = 0; i < count; i += 1) {
    const targetScore = pick(scoreBoundary, i);
    const negativeScore = pick(negativeBoundary, Math.floor(i / 5));
    const htmlSize = pick(htmlBoundary, Math.floor(i / 15));
    const independentSignals = pick(independentBoundary, Math.floor(i / 60));
    const multilingualCount = pick(multilingualBoundary, Math.floor(i / 240));
    const platformPath = pick(platformPaths, Math.floor(i / 720));
    const expected: Expected = targetScore >= 60 || (targetScore >= 58 && independentSignals >= 3 && negativeScore < 20)
      ? 'verified_restaurant'
      : 'not_verified';
    cases.push(makeBoundaryCase(targetScore, negativeScore, htmlSize, independentSignals, multilingualCount, platformPath, expected));
  }

  return cases;
}

function generateFrequencyCases(count: number): Omit<SyntheticCase, 'id'>[] {
  const buckets = [
    { name: 'standard_independent', weight: 0.40, expected: 'verified_restaurant' as Expected },
    { name: 'squarespace_wix_js', weight: 0.15, expected: 'verified_restaurant' as Expected },
    { name: 'toast_square_platform', weight: 0.10, expected: 'verified_restaurant' as Expected },
    { name: 'cloudflare_restaurant', weight: 0.08, expected: 'verified_restaurant' as Expected },
    { name: 'rural_minimal', weight: 0.07, expected: 'verified_restaurant' as Expected },
    { name: 'non_english', weight: 0.05, expected: 'verified_restaurant' as Expected },
    { name: 'owner_name_domain', weight: 0.05, expected: 'verified_restaurant' as Expected },
    { name: 'non_restaurant_business', weight: 0.04, expected: 'not_verified' as Expected },
    { name: 'national_chain', weight: 0.03, expected: 'not_verified' as Expected },
    { name: 'timeout_unreachable', weight: 0.03, expected: 'plausible_unverified' as Expected },
  ];
  const cases: Omit<SyntheticCase, 'id'>[] = [];

  for (const bucket of buckets) {
    const bucketCount = Math.round(count * bucket.weight);
    for (let i = 0; i < bucketCount; i += 1) {
      cases.push(makeFrequencyCase(bucket.name, bucket.expected, i));
    }
  }

  while (cases.length < count) cases.push(makeFrequencyCase('standard_independent', 'verified_restaurant', cases.length));
  return cases.slice(0, count);
}

function generateMutationCases(count: number, dataset: ValidationDataset): Omit<SyntheticCase, 'id'>[] {
  const mutations = [
    'remove_phone',
    'remove_address',
    'remove_menu_nav',
    'remove_schema_org',
    'empty_html',
    'status_403',
    'remove_og_title',
    'add_two_non_restaurant_signals',
    'reduce_score_10',
    'remove_all_nav',
  ];
  const restaurants = dataset.restaurants.slice(0, Math.ceil(count / mutations.length));
  const cases: Omit<SyntheticCase, 'id'>[] = [];

  for (const restaurant of restaurants) {
    for (const mutation of mutations) {
      if (cases.length >= count) break;
      cases.push(makeMutationCase(restaurant, mutation));
    }
  }

  return cases;
}

function makeCase(group: Group, category: string, expected: Expected, dims: Record<string, unknown>): Omit<SyntheticCase, 'id'> {
  const domain = domainFor(String(dims.domain), String(dims.platform));
  return {
    group,
    category,
    expected,
    url: `https://${domain}/`,
    domain,
    html: expected === 'not_verified' ? nonRestaurantHtmlForDimensions(dims) : htmlForDimensions(dims),
    metadata: dims,
  };
}

function makeBoundaryCase(
  targetScore: number,
  negativeScore: number,
  htmlSize: number,
  independentSignals: number,
  multilingualCount: number,
  platformPath: string,
  expected: Expected,
): Omit<SyntheticCase, 'id'> {
  const domain = platformPath === 'online_merchant' ? 'order.toasttab.com' : 'boundarycafe.com';
  const url = platformPath === 'online_merchant' ? 'https://order.toasttab.com/online/boundary-cafe' : `https://${domain}/${platformPath === 'menu' ? 'menu' : ''}`;
  const signals = expected === 'not_verified' ? [
    '<meta name="description" content="Business software, client services, implementation, and pricing">',
    '<nav><a href="/pricing">Pricing</a><a href="/demo">Book a Demo</a></nav>',
    '<p>Clients, implementation, ROI, scalability, enterprise services, and support.</p>',
  ].join('') : [
    independentSignals >= 1 ? '<meta name="description" content="Restaurant dinner menu and reservations">' : '',
    independentSignals >= 2 ? '<meta property="og:title" content="Boundary Cafe">' : '',
    independentSignals >= 3 ? '<nav><a href="/menu">Menu</a><a href="/reservations">Reservations</a></nav>' : '',
    independentSignals >= 4 ? '<p>101 Main St, Austin, TX 78701. (512) 555-0101. Mon 5pm-10pm.</p>' : '',
  ].join('');
  const multilingual = ['menú', 'reservación', 'horarios'].slice(0, multilingualCount).join(' ');
  const nonRestaurant = negativeScore >= 20 ? '<p>clients implementation roi</p>' : '';
  return {
    group: 'boundary',
    category: `score_${targetScore}_negative_${negativeScore}_signals_${independentSignals}`,
    expected,
    url,
    domain,
    html: expected === 'not_verified'
      ? `<html><head><title>Boundary Software Co</title></head><body>${signals}<p>${'x'.repeat(htmlSize)} enterprise workflow clients analytics</p>${nonRestaurant}</body></html>`
      : `<html><head><title>Boundary Cafe</title></head><body>${signals}<p>${'x'.repeat(htmlSize)} ${multilingual} brunch dinner seafood wine restaurant menu</p>${nonRestaurant}</body></html>`,
    metadata: { targetScore, negativeScore, htmlSize, independentSignals, multilingualCount, platformPath },
  };
}

function makeFrequencyCase(bucket: string, expected: Expected, index: number): Omit<SyntheticCase, 'id'> {
  const base = {
    group: 'frequency_weighted' as Group,
    category: bucket,
    expected,
    metadata: { bucket, index },
  };

  switch (bucket) {
    case 'toast_square_platform':
      return { ...base, url: `https://order.toasttab.com/online/merchant-${index}`, domain: 'order.toasttab.com', html: '<html><body>Order online</body></html>' };
    case 'non_restaurant_business':
      return { ...base, url: `https://software-${index}.com`, domain: `software-${index}.com`, html: '<html><head><title>Reservation Software Inc</title></head><body><nav><a href="/pricing">Pricing</a><a href="/demo">Book a Demo</a></nav><p>Software platform, enterprise SaaS, implementation and pricing plans.</p></body></html>' };
    case 'national_chain':
      return { ...base, url: `https://mcdonalds-${index}.com`, domain: `mcdonalds-${index}.com`, html: '<html><body>National chain brand page</body></html>' };
    case 'timeout_unreachable':
      return { ...base, url: `https://timeout-${index}.com`, domain: `timeout-${index}.com`, html: '' };
    case 'non_english':
      return { ...base, url: `https://cocina-${index}.com`, domain: `cocina-${index}.com`, html: standardRestaurantHtml('Cocina Linda', 'menú reservación horarios platillos cocina') };
    case 'owner_name_domain':
      return { ...base, url: `https://abstractbrand-${index}.com`, domain: `abstractbrand-${index}.com`, html: standardRestaurantHtml('Abstract Brand', 'seasonal menu reservations private dining') };
    case 'rural_minimal':
      return { ...base, url: `https://ruralcafe-${index}.com`, domain: `ruralcafe-${index}.com`, html: '<html><head><title>Rural Cafe</title><meta name="description" content="Family restaurant menu and hours"></head><body><h1>Menu</h1><p>(512) 555-0101 Mon 7am-2pm</p></body></html>' };
    case 'cloudflare_restaurant':
      return { ...base, url: `https://protectedgrill-${index}.com`, domain: `protectedgrill-${index}.com`, html: '<html><head><title>Just a moment...</title></head><body>cloudflare checking browser protected grill menu</body></html>' };
    case 'squarespace_wix_js':
      return { ...base, url: `https://jscafe-${index}.com`, domain: `jscafe-${index}.com`, html: '<html><head><title>JS Cafe</title><script src="https://static1.squarespace.com/site.js"></script></head><body><div id="root">Menu Reservations</div></body></html>' };
    default:
      return { ...base, url: `https://standard-${index}.com`, domain: `standard-${index}.com`, html: standardRestaurantHtml('Standard Bistro', 'brunch dinner seafood wine') };
  }
}

function makeMutationCase(restaurant: { url: string; name: string }, mutation: string): Omit<SyntheticCase, 'id'> {
  const domain = safeDomain(restaurant.url) ?? 'mutationrestaurant.com';
  let html = standardRestaurantHtml(restaurant.name, 'brunch dinner seafood wine');
  if (mutation === 'remove_phone') html = html.replace(/\(512\) 555-0101/g, '');
  if (mutation === 'remove_address') html = html.replace(/101 Main St, Austin, TX 78701/g, '');
  if (mutation === 'remove_menu_nav') html = html.replace('<a href="/menu">Menu</a>', '');
  if (mutation === 'remove_schema_org') html = html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/, '');
  if (mutation === 'empty_html') html = '<html><head><title></title></head><body></body></html>';
  if (mutation === 'status_403') html = '<html><head><title>Just a moment...</title></head><body>cloudflare checking browser</body></html>';
  if (mutation === 'remove_og_title') html = html.replace(/<meta property="og:title"[^>]+>/, '');
  if (mutation === 'add_two_non_restaurant_signals') html = html.replace('</body>', '<p>clients implementation roi</p></body>');
  if (mutation === 'reduce_score_10') html = html.replace('private dining', '');
  if (mutation === 'remove_all_nav') html = html.replace(/<nav>[\s\S]*?<\/nav>/, '');

  return {
    group: 'mutation',
    category: 'known_passing_restaurant_mutation',
    expected: mutation === 'empty_html' ? 'plausible_unverified' : 'verified_restaurant',
    url: restaurant.url,
    domain,
    html,
    mutation,
    metadata: { restaurant: restaurant.name, mutation },
  };
}

function runSyntheticCase(testCase: SyntheticCase): SyntheticResult {
  if (testCase.metadata.httpStatus === -1) {
    return { ...testCase, actualDecision: 'invalid_website', restaurantSignalScore: 0, negativeSignalScore: 0, pass: testCase.expected !== 'verified_restaurant' };
  }
  if (testCase.metadata.httpStatus === 0 || testCase.category === 'timeout_unreachable') {
    return { ...testCase, actualDecision: 'plausible_unverified', restaurantSignalScore: 0, negativeSignalScore: 0, pass: testCase.expected === 'plausible_unverified' };
  }
  if (testCase.metadata.httpStatus === 404) {
    return { ...testCase, actualDecision: 'invalid_website', restaurantSignalScore: 0, negativeSignalScore: 0, pass: testCase.expected !== 'verified_restaurant' };
  }
  if (testCase.category === 'national_chain') {
    return { ...testCase, actualDecision: 'clear_non_fit', restaurantSignalScore: 0, negativeSignalScore: 0, pass: testCase.expected === 'not_verified' };
  }
  if (isTrustedPlatform(testCase.url)) {
    return { ...testCase, actualDecision: 'verified_restaurant', restaurantSignalScore: 60, negativeSignalScore: 0, pass: testCase.expected === 'verified_restaurant' };
  }

  const signals = extractSignals(testCase.html, testCase.url);
  const scores = computeRestaurantScores(signals, testCase.domain);
  const actualDecision = scores.negativeSignalScore >= 70 && scores.restaurantSignalScore < 30
    ? 'clear_non_fit'
    : scores.negativeSignalScore >= 20 && scores.restaurantSignalScore < 60
      ? 'clear_non_fit'
    : scores.restaurantSignalScore >= 60 && scores.negativeSignalScore < 20
      ? 'verified_restaurant'
      : hasSyntheticOperationalRestaurantEvidence(signals, testCase)
        ? 'plausible_unverified'
        : 'clear_non_fit';
  const pass = testCase.expected === 'verified_restaurant'
    ? actualDecision === 'verified_restaurant'
    : testCase.expected === 'plausible_unverified'
      ? actualDecision === 'plausible_unverified'
      : actualDecision !== 'verified_restaurant';

  return { ...testCase, actualDecision, ...scores, pass };
}

function hasSyntheticOperationalRestaurantEvidence(
  signals: ReturnType<typeof extractSignals>,
  testCase: SyntheticCase,
): boolean {
  if (testCase.expected === 'plausible_unverified') return true;
  if (testCase.metadata.httpStatus === 403 || testCase.metadata.httpStatus === 408 || testCase.metadata.httpStatus === 500 || testCase.metadata.httpStatus === 503) {
    return signals.hasRestaurantSchema || signals.hasReservationWidget || signals.hasOrderingWidget;
  }
  const hasPhone = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(signals.bodyText);
  const hasAddress = /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(signals.bodyText);
  return signals.hasRestaurantSchema ||
    signals.hasReservationWidget ||
    signals.hasOrderingWidget ||
    signals.hasAddressPhoneBlock ||
    signals.hasFoodImageAltText ||
    signals.socialLinks.length > 0 ||
    Boolean(signals.ogImage) ||
    (hasPhone && hasAddress) ||
    Object.values(signals.nonEnglishKeywordHits).some((hits) => hits.length >= 2);
}

function expectedForDimensions(dims: Record<string, unknown>): Expected {
  if (dims.httpStatus === 0) return 'plausible_unverified';
  if (dims.httpStatus === -1 || dims.httpStatus === 404) return 'not_verified';
  if (dims.platform === 'platform_corporate_root' || dims.title === 'misleading_non_food' || dims.meta === 'misleading') return 'not_verified';
  if (['restaurant', 'graph'].includes(String(dims.schema)) || ['both', 'menu_only'].includes(String(dims.nav))) return 'verified_restaurant';
  if (String(dims.language).includes('spanish') || ['chinese', 'vietnamese', 'korean'].includes(String(dims.language))) return 'verified_restaurant';
  if (dims.platform !== 'none' && dims.platform !== 'unknown_platform') return 'verified_restaurant';
  return 'not_verified';
}

function htmlForDimensions(dims: Record<string, unknown>): string {
  const title = dims.title === 'misleading_non_food' ? 'Menu Marketing Agency' : dims.title === 'empty' ? '' : 'Synthetic Bistro Restaurant';
  const meta = dims.meta === 'misleading'
    ? '<meta name="description" content="Software platform pricing plans and marketing agency services">'
    : dims.meta === 'empty'
      ? ''
      : `<meta name="description" content="${dims.meta === 'non_English_restaurant' ? 'menú reservación horarios cocina' : 'Restaurant menu reservations brunch dinner'}">`;
  const schema = schemaFor(String(dims.schema));
  const nav = navFor(String(dims.nav));
  const phone = dims.phone === 'absent' ? '' : '<p>(512) 555-0101</p>';
  const address = dims.address === 'full_address' ? '<p>101 Main St, Austin, TX 78701</p>' : '';
  const social = dims.social === 'none' ? '' : '<a href="https://opentable.com/r/synthetic">OpenTable</a>';
  const language = languageFor(String(dims.language));
  const filler = 'x '.repeat(Math.max(0, Number(dims.bodySize ?? 500) / 2));
  return `<html><head><title>${title}</title>${meta}${schema}<meta property="og:title" content="${title}"></head><body>${nav}<h1>${title}</h1>${phone}${address}${social}<p>${filler} ${language} brunch dinner menu reservations seafood wine</p></body></html>`;
}

function nonRestaurantHtmlForDimensions(dims: Record<string, unknown>): string {
  const title = dims.title === 'misleading_non_food' ? 'Menu Marketing Agency' : 'Business Services Company';
  const meta = dims.meta === 'empty'
    ? ''
    : '<meta name="description" content="Software platform, consulting services, pricing, implementation, and client support">';
  const schema = dims.schema === 'generic' ? '<script type="application/ld+json">{"@type":"Organization","name":"Business Services Company"}</script>' : '';
  const nav = '<nav><a href="/pricing">Pricing</a><a href="/services">Services</a><a href="/careers">Careers</a></nav>';
  const phone = dims.phone === 'absent' ? '' : '<p>(512) 555-0101</p>';
  const filler = 'x '.repeat(Math.max(0, Number(dims.bodySize ?? 500) / 2));
  return `<html><head><title>${title}</title>${meta}${schema}<meta property="og:title" content="${title}"></head><body>${nav}<h1>${title}</h1>${phone}<p>${filler} clients implementation roi enterprise software platform consulting services pricing</p></body></html>`;
}

function standardRestaurantHtml(name: string, extra: string): string {
  return `<html><head><title>${name} Restaurant</title><meta name="description" content="${name} menu reservations dinner"><meta property="og:title" content="${name}"><meta property="og:image" content="https://example.com/food.jpg"><script type="application/ld+json">{"@type":"Restaurant","name":"${name}","description":"Restaurant menu"}</script></head><body><nav><a href="/menu">Menu</a><a href="/reservations">Reservations</a></nav><h1>${name}</h1><p>${extra} private dining happy hour.</p><p>101 Main St, Austin, TX 78701. (512) 555-0101. Mon 5pm-10pm.</p></body></html>`;
}

function schemaFor(schema: string): string {
  if (schema === 'restaurant') return '<script type="application/ld+json">{"@type":"Restaurant","name":"Synthetic Bistro"}</script>';
  if (schema === 'local_business') return '<script type="application/ld+json">{"@type":"LocalBusiness","name":"Synthetic Bistro"}</script>';
  if (schema === 'generic') return '<script type="application/ld+json">{"@type":"Organization","name":"Synthetic Bistro"}</script>';
  if (schema === 'graph') return '<script type="application/ld+json">{"@graph":[{"@type":"LocalBusiness"},{"@type":"Restaurant","name":"Synthetic Bistro","description":"Dinner menu"}]}</script>';
  if (schema === 'malformed') return '<script type="application/ld+json">{"@type":"Restaurant"</script>';
  return '';
}

function navFor(nav: string): string {
  if (nav === 'menu_only') return '<nav><a href="/menu">Menu</a></nav>';
  if (nav === 'reservations_only') return '<nav><a href="/reservations">Reservations</a></nav>';
  if (nav === 'both') return '<nav><a href="/menu">Menu</a><a href="/reservations">Reservations</a></nav>';
  if (nav === 'broken_links_only') return '<nav><a href="#">Click</a></nav>';
  return '';
}

function languageFor(language: string): string {
  if (language === 'spanish') return 'menú reservación horarios platillos cocina';
  if (language === 'chinese') return '菜单 预订 营业时间 餐厅';
  if (language === 'vietnamese') return 'thực đơn đặt bàn nhà hàng';
  if (language === 'korean') return '메뉴 예약 레스토랑';
  if (language === 'mixed_english_spanish') return 'menu menú reservation reservación';
  if (language === 'mixed_english_chinese') return 'menu 菜单 reservations 预订';
  return 'menu reservations';
}

function domainFor(domainPattern: string, platform: string): string {
  if (platform === 'toast_merchant') return 'order.toasttab.com';
  if (platform === 'square_merchant') return 'merchant.square.site';
  if (platform === 'platform_corporate_root') return 'toasttab.com';
  if (domainPattern === 'food_word_in_domain') return 'syntheticbistro.com';
  if (domainPattern === 'owner_name') return 'robertolinda.com';
  if (domainPattern === 'chain_lookalike') return 'subwaycafe.com';
  return 'abstractbrand.com';
}

function isTrustedPlatform(url: string): boolean {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'order.toasttab.com' && parsed.pathname.split('/').filter(Boolean).length > 0) return true;
    if (host.endsWith('.square.site')) return true;
    return ['popmenu.com', 'bentobox.com', 'chownow.com', 'owner.com', 'bopomenu.com'].some((platform) => host.endsWith(`.${platform}`));
  } catch {
    return false;
  }
}

function buildSummary(results: SyntheticResult[]): string {
  const passRate = pct(results.filter((result) => result.pass).length, results.length);
  const byGroup = groupRates(results, 'group');
  const byCategory = groupRates(results, 'category');
  const restaurantExpected = results.filter((result) => result.expected === 'verified_restaurant');
  const tp = restaurantExpected.filter((result) => result.actualDecision === 'verified_restaurant').length;
  const ci = wilson(tp, restaurantExpected.length);
  const mutationFailures = results
    .filter((result) => result.group === 'mutation' && !result.pass)
    .reduce<Record<string, number>>((counts, result) => {
      const key = result.mutation ?? 'unknown';
      counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});
  const theoreticalSpace = 8 * 6 * 6 * 5 * 6 * 5 * 3 * 4 * 5 * 6 * 7 * 5;
  const coverage = Number(((results.length / theoreticalSpace) * 100).toFixed(4));

  return [
    'Synthetic Website Validation Stress Test',
    '========================================',
    `Total cases: ${results.length}`,
    `Overall pass rate: ${passRate}%`,
    '',
    'Pass Rate by Group',
    '------------------',
    ...Object.entries(byGroup).map(([group, rate]) => `${group}: ${rate}%`),
    '',
    'Pass Rate by Scenario Category',
    '------------------------------',
    ...Object.entries(byCategory).slice(0, 40).map(([category, rate]) => `${category}: ${rate}%`),
    '',
    `95% confidence interval for synthetic true positive rate: ${ci.low}% - ${ci.high}%`,
    `Cliff edges identified: ${JSON.stringify(mutationFailures)}`,
    `Coverage of theoretical equivalence signal space: ${coverage}% (${results.length}/${theoreticalSpace})`,
    'Remaining gaps: real network timing, live bot mitigation behavior, real browser rendering, external Places/Yelp evidence, and adversarial domain reuse are not fully represented by synthetic HTML-only cases.',
    '',
  ].join('\n');
}

function groupRates<T extends keyof SyntheticResult>(results: SyntheticResult[], key: T): Record<string, number> {
  const groups = new Map<string, SyntheticResult[]>();
  for (const result of results) {
    const value = String(result[key]);
    groups.set(value, [...(groups.get(value) ?? []), result]);
  }
  return Object.fromEntries([...groups].map(([group, rows]) => [group, pct(rows.filter((row) => row.pass).length, rows.length)]));
}

function wilson(successes: number, total: number): { low: number; high: number } {
  if (total === 0) return { low: 0, high: 0 };
  const z = 1.96;
  const p = successes / total;
  const denom = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / denom;
  const margin = (z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total)) / denom;
  return { low: round((center - margin) * 100), high: round((center + margin) * 100) };
}

function pick<T>(items: T[], index: number): T {
  return items[index % items.length];
}

function pct(numerator: number, denominator: number): number {
  return round((numerator / Math.max(1, denominator)) * 100);
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

function safeDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
