// Shared types for the Phase 2 website validator.

export type { ValidationConfidence } from './confidence-score';

export type FinalDecision =
  | 'verified_restaurant'
  | 'plausible_unverified'
  | 'clear_non_fit'
  | 'national_chain'
  | 'invalid_website';

export type CountryEligibility = 'us_verified' | 'likely_us' | 'non_us' | 'unknown';

export type ReachabilityStatus =
  | 'reachable'
  | 'blocked'
  | 'inaccessible'
  | 'invalid'
  | 'thin'
  | 'redirected';

export interface ValidationResult {
  // Scores (0–100)
  restaurantSignalScore: number;
  negativeSignalScore: number;
  nationalChainScore: number;
  websiteRelationshipScore: number;
  googlePlacesScore: number;
  locationConfidenceScore: number;

  // Country
  countryEligibility: CountryEligibility;
  locationReasons: string[];

  // Process metadata
  headlessBrowserUsed: boolean;
  googlePlacesQueried: boolean;
  claudeAiUsed: boolean;

  // Reachability
  websiteReachabilityStatus: ReachabilityStatus;

  // Core output
  finalDecision: FinalDecision;
  normalizedUrl: string;
  finalUrl: string;
  httpStatus: number;
  reasons: string[];
  userFacingMessage: string | null;
  internalFlags: string[];
  manualReviewRequired: boolean;

  // Logo hints for the AI Researcher (Phase 5) — verbatim URLs only
  websiteLogoHints: string[];

  // Pre-validated logo URL from the extraction waterfall (Clearbit → Google → og:image → null).
  // AI Researcher uses this directly — does not pick from websiteLogoHints.
  logoUrl: string | null;

  // Validation confidence (0–100) — how certain we are this is a real restaurant.
  // Used by the UI to choose between encouraging and cautious messaging tiers.
  confidence: import('./confidence-score').ValidationConfidence;
}

export interface ValidateWebsiteRequest {
  website: string;
  restaurantName: string;
  conceptType?: string;
}
