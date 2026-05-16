// Typed payload for the Phase 4 Analyzer Quiz.
// Phase 8 maps these snake_case keys to Prisma camelCase fields before persisting.

export interface AnalyzerFormPayload {
  // Step 1 — Restaurant basics / validation
  restaurant_name: string;
  website: string;
  zip_code: string;

  // Step 2 — Restaurant profile
  concept_type: string;
  locations: string;
  annual_food_spend: string;

  // Step 3 — Purchasing profile
  distributor_type: string;
  procurement_strategy: string;
  top_skus: string; // free text only — parsed by spend-parser keyword matching

  // Step 4 — Contact info
  full_name: string;
  email: string;
  phone?: string;

  // Hidden tracking fields — captured client-side, optional, never block submission
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  fbclid?: string;
  gclid?: string;
  referrer?: string;
  landing_page_url?: string;
  fbp?: string; // Meta browser ID cookie
  fbc?: string; // Meta click ID cookie
}

// ── Dropdown options (source of truth: docs/FSIQ_SOP_v3.3.md §5) ─────────────
// Values must match the strings the qualification engine expects.

export const CONCEPT_TYPE_OPTIONS = [
  'Quick service',
  'Fast casual',
  'Casual dining',
  'Family dining',
  'Full-service independent',
  'Fine dining',
] as const;

export const LOCATIONS_OPTIONS = [
  'Single location',
  '2 – 4 locations',
  '5+ locations',
] as const;

// Ranges align with savings-formula.ts spend buckets. parseSpend handles all of these.
export const ANNUAL_FOOD_SPEND_OPTIONS = [
  'Under $500K',
  '$500K–$800K',
  '$800K–$1M',
  '$1M–$3M',
  '$3M–$7M',
  '$7M+',
] as const;

export const DISTRIBUTOR_TYPE_OPTIONS = [
  'National broadliners (Sysco, US Foods)',
  'Regional distributor',
  'Local/specialty only',
  'Combination',
] as const;

export const PROCUREMENT_STRATEGY_OPTIONS = [
  'Market price, single distributor',
  'Market price, multiple distributors',
  'GPO or Group Purchasing Organization',
  'Negotiated cost-plus agreement',
] as const;
