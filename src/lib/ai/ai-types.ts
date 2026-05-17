// Phase 5 — AI Research + Narrative types.
// These types define the contract between Phase 5 AI functions and their callers (Phase 8).
// AI outputs never include savings math fields (finalPct, dollarEstimate, spendBucket, etc.).
// Those are computed deterministically by Phase 3 and passed to AI as read-only context.

// ── Input ─────────────────────────────────────────────────────────────────────

// Neutral form context — camelCase to match the Prisma model used by Phase 8.
// Phase 4's AnalyzerFormPayload (snake_case) maps to this before calling AI.
export interface FormContext {
  restaurantName: string;
  website: string;
  state: string;
  conceptType: string;
  locations: string;
  annualFoodSpend: string;   // raw dropdown value, e.g. "$1M–$3M"
  distributorType: string;
  procurementStrategy: string;
  topSkus: string;           // free text — may be empty/whitespace
}

// Shared input type for both AI functions.
// Built by buildResearchInput() in research-input.ts from form + Phase 2 + Phase 3 outputs.
// Never contains raw HTML or scraped page text.
export interface AiResearchInput {
  // Form context (see FormContext above)
  restaurantName: string;
  website: string;
  state: string;
  conceptType: string;
  locations: string;
  annualFoodSpend: string;
  distributorType: string;
  procurementStrategy: string;
  topSkus: string;

  // Phase 2 validation summary — no raw HTML, no full scraped text
  normalizedUrl: string;
  finalUrl: string;
  finalDecision: string;
  countryEligibility: string;
  websiteReachabilityStatus: string;
  restaurantSignalScore: number;

  // websiteLogoHints: verbatim candidate URLs from Phase 2 HTML extraction.
  // Used only for scrapeStatus calculation — AI no longer selects from this list.
  websiteLogoHints: string[];

  // logoUrl: pre-validated URL from the extraction waterfall (Clearbit → Google → og:image → null).
  // AI Researcher passes this through directly — does not pick from websiteLogoHints.
  logoUrl: string | null;

  // scrapeStatus: derived from Phase 2 outputs — never from live scraping.
  // "phase2_signals" = Phase 2 produced usable signals
  // "unavailable"   = no useful Phase 2 signals available
  scrapeStatus: 'phase2_signals' | 'unavailable';

  // Phase 3 deterministic outputs — read-only context for narrative generation.
  // AI must never recalculate, reinterpret, round differently, or override these values.
  qualified: boolean;
  spendBucket: string | null;
  dollarEstimate: number | null;  // whole dollars, e.g. 110000
  finalPct: number | null;        // percentage, e.g. 5.75
  year1: number | null;
  year5: number | null;
  caseStudy: string | null;
}

// ── Outputs ───────────────────────────────────────────────────────────────────

export interface AiResearchResult {
  // logoUrl: pre-validated URL passed through from AiResearchInput.logoUrl.
  // Set by the extraction waterfall in Phase 2 — AI does not select this.
  logoUrl: string | null;

  businessSummary: string;   // max 500 chars
  conceptSignals: string[];  // max 10 items

  scrapeStatus: 'phase2_signals' | 'unavailable';

  aiUsed: boolean;           // true = Claude was called and returned a response
  aiFallbackUsed: boolean;   // true = fallback narrative was used
  aiModel: string | null;    // internal metadata — not persisted to Prisma
  aiError: string | null;
  generatedAt: string;       // ISO 8601 timestamp
}

export interface AiNarrativeResult {
  narrativeDistributor: string;  // max 600 chars, no em/en-dashes
  narrativeProcurement: string;  // max 600 chars, no em/en-dashes
  narrativeSku: string;          // max 600 chars, no em/en-dashes

  aiUsed: boolean;
  aiFallbackUsed: boolean;
  aiModel: string | null;        // internal metadata — not persisted to Prisma
  aiError: string | null;
  generatedAt: string;
}
