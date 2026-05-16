// Phase 6 — PDF mode decision.
// Routing rules: docs/build-phases.md §Phase 6, docs/architecture.md §PDF.
//
// full        → verified_restaurant + us_verified/likely_us + qualified
// conservative → plausible_unverified + likely_us/unknown + qualified
// skip         → everything else (chain, invalid, non-US, DQ, clear_non_fit)

import type { PdfModeDecision } from './pdf-types';

export function determinePdfMode(
  finalDecision: string,
  countryEligibility: string,
  qualified: boolean,
): PdfModeDecision {
  // Unqualified always skips
  if (!qualified) {
    return { mode: 'skip', reason: 'not_qualified' };
  }

  // Hard-skip decisions — no PDF regardless of spend
  if (finalDecision === 'national_chain') {
    return { mode: 'skip', reason: 'national_chain' };
  }
  if (finalDecision === 'invalid_website') {
    return { mode: 'skip', reason: 'invalid_website' };
  }
  if (finalDecision === 'clear_non_fit') {
    return { mode: 'skip', reason: 'clear_non_fit' };
  }

  // Non-US always skips
  if (countryEligibility === 'non_us') {
    return { mode: 'skip', reason: 'non_us' };
  }

  // Full personalized PDF
  if (
    finalDecision === 'verified_restaurant' &&
    (countryEligibility === 'us_verified' || countryEligibility === 'likely_us')
  ) {
    return { mode: 'full', reason: 'verified_restaurant' };
  }

  // Conservative profile-based PDF (no website-specific claims)
  if (
    finalDecision === 'plausible_unverified' &&
    (countryEligibility === 'likely_us' || countryEligibility === 'unknown')
  ) {
    return { mode: 'conservative', reason: 'plausible_unverified' };
  }

  // Fallback: unrecognized combination → skip
  return { mode: 'skip', reason: 'unrecognized_combination' };
}
