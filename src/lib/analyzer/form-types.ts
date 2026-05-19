// Typed payload for the Phase 4 Analyzer Quiz.
// Phase 8 maps these snake_case keys to Prisma camelCase fields before persisting.

export interface AnalyzerFormPayload {
  // Step 1 — Restaurant basics / validation
  restaurant_name: string;
  website: string;
  state: string;

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
  phone: string;

  // Hidden tracking fields — captured client-side, optional, never block submission
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  utm_id?: string;          // GA4 campaign identifier
  fbclid?: string;
  gclid?: string;
  fbadid?: string;          // Facebook ad ID
  creative_name?: string;
  creative_id?: string;
  campaign?: string;        // full campaign name (distinct from utm_campaign)
  referrer?: string;
  landing_page_url?: string;
  fbp?: string;             // Meta browser ID cookie
  fbc?: string;             // Meta click ID cookie (or derived from fbclid)
  client_user_agent?: string; // captured at submit time for CAPI matching
  event_id?: string;          // UUID generated at submit, shared with CAPI Lead event
}

// ── Dropdown options (source of truth: docs/FSIQ_SOP_v3.3.md §5) ─────────────
// Values must match the strings the qualification engine expects.

export const STATE_OPTIONS = [
  { value: 'AL', label: 'Alabama' },
  { value: 'AK', label: 'Alaska' },
  { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' },
  { value: 'CA', label: 'California' },
  { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' },
  { value: 'DE', label: 'Delaware' },
  { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' },
  { value: 'HI', label: 'Hawaii' },
  { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' },
  { value: 'IN', label: 'Indiana' },
  { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' },
  { value: 'KY', label: 'Kentucky' },
  { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' },
  { value: 'MD', label: 'Maryland' },
  { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' },
  { value: 'MN', label: 'Minnesota' },
  { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' },
  { value: 'MT', label: 'Montana' },
  { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' },
  { value: 'NH', label: 'New Hampshire' },
  { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' },
  { value: 'NY', label: 'New York' },
  { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' },
  { value: 'OH', label: 'Ohio' },
  { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' },
  { value: 'PA', label: 'Pennsylvania' },
  { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' },
  { value: 'SD', label: 'South Dakota' },
  { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' },
  { value: 'UT', label: 'Utah' },
  { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' },
  { value: 'WA', label: 'Washington' },
  { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' },
  { value: 'WY', label: 'Wyoming' },
  { value: 'DC', label: 'Washington D.C.' },
] as const;

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

export const DISTRIBUTOR_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'national_broadliners', label: 'I purchase primarily through broadline distributors (Sysco, US Foods, Performance Food Group, etc.)' },
  { value: 'combination',          label: 'I use a mix of broadline and specialty/local distributors' },
  { value: 'regional',             label: 'I purchase primarily through regional distributors' },
  { value: 'local_specialty',      label: 'I purchase through local or specialty distributors only' },
];

export const PROCUREMENT_STRATEGY_OPTIONS: { value: string; label: string }[] = [
  { value: 'market_price_single',   label: 'I buy at market price through one distributor' },
  { value: 'market_price_multiple', label: 'I buy at market price across multiple distributors' },
  { value: 'gpo',                   label: 'I use a GPO or Group Purchasing Organization' },
  { value: 'negotiated_cost_plus',  label: 'I have a negotiated cost-plus agreement' },
];
