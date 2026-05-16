// Deterministic savings formula engine.
// Source of truth: docs/savings-formula.md
// AI must never influence any value computed here.

// ── Types ─────────────────────────────────────────────────────────────────────

export type SpendBucket = '$500K–$800K' | '$800K–$1M' | '$1M–$3M' | '$3M–$7M' | '$7M+';
export type LocationCategory = 'single' | '2-4' | '5+';

export interface BucketResult {
  bucket: SpendBucket;
  midpoint: number;
  basePct: number;
}

export interface ModifierInputs {
  distributorType: string;
  procurementStrategy: string;
  topSkus: string;
  locations: string;
}

export interface ModifierResult {
  distributorMod: number;
  procurementMod: number;
  skuMod: number;
  locationsMod: number;
  locationCategory: LocationCategory;
  rawTotal: number; // basePct + all mods
}

export interface ProjectionResult {
  year1: number;
  year2: number;
  year3: number;
  year4: number;
  year5: number;
  projectionHeights: Record<'year1' | 'year2' | 'year3' | 'year4' | 'year5', number>;
}

export interface SavingsResult {
  bucket: SpendBucket;
  midpoint: number;
  basePct: number;
  distributorMod: number;
  procurementMod: number;
  skuMod: number;
  locationsMod: number;
  locationCategory: LocationCategory;
  rawTotal: number;
  finalPct: number;
  finalPctDisplay: string;
  dollarEstimate: number;
  dollarEstimateDisplay: string;
  year1: number;
  year2: number;
  year3: number;
  year4: number;
  year5: number;
  projectionHeights: Record<'year1' | 'year2' | 'year3' | 'year4' | 'year5', number>;
  caseStudy: string;
}

// ── Constants (source of truth: docs/savings-formula.md) ─────────────────────

const BUCKETS: Array<{ bucket: SpendBucket; min: number; max: number; midpoint: number; basePct: number }> = [
  { bucket: '$500K–$800K', min: 500_000,   max: 799_999,   midpoint: 650_000,   basePct: 5.00 },
  { bucket: '$800K–$1M',   min: 800_000,   max: 999_999,   midpoint: 900_000,   basePct: 5.25 },
  { bucket: '$1M–$3M',     min: 1_000_000, max: 2_999_999, midpoint: 2_000_000, basePct: 5.50 },
  { bucket: '$3M–$7M',     min: 3_000_000, max: 6_999_999, midpoint: 5_000_000, basePct: 5.75 },
  { bucket: '$7M+',        min: 7_000_000, max: Infinity,  midpoint: 8_500_000, basePct: 6.00 },
];

const INFLATION_RATE = 0.039; // USDA food-away-from-home, per docs/savings-formula.md §12
const MIN_BAR_HEIGHT = 8;     // Minimum bar height percentage for chart display
const FINAL_PCT_FLOOR = 4.0;
const FINAL_PCT_CEILING = 8.0;

const PROTEIN_KEYWORDS = [
  'chicken', 'beef', 'pork', 'fish', 'seafood', 'brisket', 'ribs', 'steak',
  'lamb', 'salmon', 'shrimp', 'turkey', 'bacon', 'sausage',
];
const COMMODITY_KEYWORDS = [
  'oil', 'dairy', 'eggs', 'cheese', 'milk', 'butter', 'produce', 'lettuce',
  'tomato', 'onion', 'flour', 'sugar', 'potato', 'fries',
];

const CASE_STUDIES: Record<SpendBucket, Record<LocationCategory, string>> = {
  '$500K–$800K': { single: "Black's BBQ",  '2-4': "MaryAnn's Diner", '5+': "MaryAnn's Diner" },
  '$800K–$1M':   { single: "Black's BBQ",  '2-4': "MaryAnn's Diner", '5+': "MaryAnn's Diner" },
  '$1M–$3M':     { single: 'Spirits',      '2-4': "MaryAnn's Diner", '5+': "MaryAnn's Diner" },
  '$3M–$7M':     { single: 'The Oasis',    '2-4': 'Dish Society',    '5+': 'Thunderdome' },
  '$7M+':        { single: 'The Oasis',    '2-4': 'Dish Society',    '5+': 'Thunderdome' },
};

// ── Bucket assignment ─────────────────────────────────────────────────────────

// Returns null if spend is below the $500K threshold (below_threshold DQ territory).
export function assignBucket(annualSpend: number): BucketResult | null {
  const match = BUCKETS.find((b) => annualSpend >= b.min && annualSpend <= b.max);
  if (!match) return null;
  return { bucket: match.bucket, midpoint: match.midpoint, basePct: match.basePct };
}

// ── Modifier computation ──────────────────────────────────────────────────────

export function computeModifiers(inputs: ModifierInputs, basePct: number): ModifierResult {
  const distributorMod = parseDistributorMod(inputs.distributorType);
  const procurementMod = parseProcurementMod(inputs.procurementStrategy);
  const skuMod = computeSkuMod(inputs.topSkus);
  const locationCategory = parseLocationCategory(inputs.locations);
  const locationsMod = locationCategoryToMod(locationCategory);
  const rawTotal = round2(basePct + distributorMod + procurementMod + skuMod + locationsMod);

  return { distributorMod, procurementMod, skuMod, locationsMod, locationCategory, rawTotal };
}

function parseDistributorMod(raw: string): number {
  const s = raw.toLowerCase().trim();
  // national_broadliner / Sysco / US Foods variants
  if (
    s === 'national_broadliner' ||
    s.includes('national broadliner') ||
    s.includes('broadliner') ||
    s.includes('sysco') ||
    s.includes('us foods') ||
    s.includes('usfood') ||
    s.includes('performance food') ||
    (s.includes('national') && !s.includes('chain'))
  ) return 0.70;

  // combination / regional
  if (s === 'combination' || s.includes('combination') || s.includes('combo')) return 0.35;
  if (s === 'regional' || s.includes('regional distributor') || s.includes('regional')) return 0.35;

  // local / specialty
  if (s === 'local_specialty' || s.includes('local') || s.includes('specialty')) return 0.00;

  return 0.00;
}

function parseProcurementMod(raw: string): number {
  const s = raw.toLowerCase().trim();
  if (
    s === 'market_price_single' ||
    (s.includes('market') && s.includes('single')) ||
    (s.includes('market price') && !s.includes('multi') && !s.includes('multiple'))
  ) return 0.70;

  if (
    s === 'market_price_multi' ||
    (s.includes('market') && (s.includes('multi') || s.includes('multiple')))
  ) return 0.35;

  if (
    s === 'gpo' ||
    s.includes('gpo') ||
    s.includes('group purchasing') ||
    s.includes('group_purchasing')
  ) return 0.20;

  if (
    s === 'negotiated_cost_plus' ||
    s.includes('negotiated') ||
    s.includes('cost_plus') ||
    s.includes('cost-plus') ||
    s.includes('cost plus')
  ) return 0.00;

  return 0.00;
}

export function computeSkuMod(topSkus: string): number {
  const lower = topSkus.toLowerCase();
  const hasProtein = PROTEIN_KEYWORDS.some((k) => lower.includes(k));
  const hasCommodity = COMMODITY_KEYWORDS.some((k) => lower.includes(k));
  if (hasProtein && hasCommodity) return 0.30;
  if (hasProtein || hasCommodity) return 0.15;
  return 0.00;
}

export function parseLocationCategory(raw: string): LocationCategory {
  const s = raw.toLowerCase().trim();
  if (s === '5+' || s.includes('5+') || s.includes('5 or more') || s.includes('five or more') || s.includes('five+')) return '5+';
  if (
    s === '2-4' || s === '2–4' ||
    s.includes('2-4') || s.includes('2–4') ||
    s.includes('2 to 4') || s.includes('two to four') ||
    s.includes('multiple')
  ) return '2-4';
  return 'single';
}

function locationCategoryToMod(cat: LocationCategory): number {
  if (cat === '5+') return 0.30;
  if (cat === '2-4') return 0.15;
  return 0.00;
}

// ── finalPct clamp ────────────────────────────────────────────────────────────

// Approved clamp: 4.0%–8.0%. Do not change without explicit product approval.
export function clampFinalPct(rawTotal: number): number {
  return round2(Math.max(FINAL_PCT_FLOOR, Math.min(FINAL_PCT_CEILING, rawTotal)));
}

// ── dollarEstimate ────────────────────────────────────────────────────────────

export function computeDollarEstimate(finalPct: number, bucketMidpoint: number): number {
  return Math.round((finalPct / 100) * bucketMidpoint);
}

// ── 5-year projections ────────────────────────────────────────────────────────

// Cumulative running totals per docs/savings-formula.md §12.
// year2 = year1 + year1 × (1 + 0.039)^1, etc.
// Year 5 is always the largest (cumulative sum of all 5 years' inflation-adjusted savings).
export function computeProjections(dollarEstimate: number): ProjectionResult {
  const r = INFLATION_RATE;
  const y1 = dollarEstimate;
  const y2 = Math.round(y1 + y1 * Math.pow(1 + r, 1));
  const y3 = Math.round(y2 + y1 * Math.pow(1 + r, 2));
  const y4 = Math.round(y3 + y1 * Math.pow(1 + r, 3));
  const y5 = Math.round(y4 + y1 * Math.pow(1 + r, 4));

  const rawHeights = {
    year1: Math.round((y1 / y5) * 100),
    year2: Math.round((y2 / y5) * 100),
    year3: Math.round((y3 / y5) * 100),
    year4: Math.round((y4 / y5) * 100),
    year5: 100,
  };

  const projectionHeights = {
    year1: Math.max(MIN_BAR_HEIGHT, rawHeights.year1),
    year2: Math.max(MIN_BAR_HEIGHT, rawHeights.year2),
    year3: Math.max(MIN_BAR_HEIGHT, rawHeights.year3),
    year4: Math.max(MIN_BAR_HEIGHT, rawHeights.year4),
    year5: 100,
  };

  return { year1: y1, year2: y2, year3: y3, year4: y4, year5: y5, projectionHeights };
}

// ── Case study selection ──────────────────────────────────────────────────────

export function selectCaseStudy(bucket: SpendBucket, locationCategory: LocationCategory): string {
  return CASE_STUDIES[bucket]?.[locationCategory] ?? "Black's BBQ";
}

// ── Full savings pipeline ─────────────────────────────────────────────────────

export function computeSavings(
  bucketResult: BucketResult,
  modifierInputs: ModifierInputs,
): SavingsResult {
  const modifiers = computeModifiers(modifierInputs, bucketResult.basePct);
  const finalPct = clampFinalPct(modifiers.rawTotal);
  const dollarEstimate = computeDollarEstimate(finalPct, bucketResult.midpoint);
  const projections = computeProjections(dollarEstimate);
  const caseStudy = selectCaseStudy(bucketResult.bucket, modifiers.locationCategory);

  return {
    bucket: bucketResult.bucket,
    midpoint: bucketResult.midpoint,
    basePct: bucketResult.basePct,
    distributorMod: modifiers.distributorMod,
    procurementMod: modifiers.procurementMod,
    skuMod: modifiers.skuMod,
    locationsMod: modifiers.locationsMod,
    locationCategory: modifiers.locationCategory,
    rawTotal: modifiers.rawTotal,
    finalPct,
    finalPctDisplay: `${finalPct.toFixed(1)}%`,
    dollarEstimate,
    dollarEstimateDisplay: formatDollars(dollarEstimate),
    year1: projections.year1,
    year2: projections.year2,
    year3: projections.year3,
    year4: projections.year4,
    year5: projections.year5,
    projectionHeights: projections.projectionHeights,
    caseStudy,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function formatDollars(n: number): string {
  return `$${n.toLocaleString('en-US')}`;
}
