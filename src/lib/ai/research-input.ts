// Builds the shared AiResearchInput from Phase 2 and Phase 3 outputs.
// This is the boundary between pipeline data and the AI functions.
//
// Rules enforced here:
// - No raw HTML or full scraped text is passed to AI
// - No secrets or API keys are included
// - Deterministic savings outputs are passed as read-only context
// - topSkus free text is trimmed but otherwise passed as-is

import type { ValidationResult } from '@/lib/website/types';
import type { QualifyLeadResult } from '@/lib/qualification/qualify-lead';
import type { FormContext, AiResearchInput } from './ai-types';

export function buildResearchInput(
  form: FormContext,
  validation: ValidationResult,
  qualification: QualifyLeadResult,
): AiResearchInput {
  // Derive scrape status from Phase 2 outputs — no live scraping.
  // "phase2_signals" = Phase 2 produced at least some usable signals.
  const hasSignals =
    validation.restaurantSignalScore > 0 ||
    validation.websiteLogoHints.length > 0 ||
    validation.websiteReachabilityStatus === 'reachable';

  const scrapeStatus: AiResearchInput['scrapeStatus'] = hasSignals ? 'phase2_signals' : 'unavailable';

  return {
    // Form context
    restaurantName: form.restaurantName,
    website: form.website,
    conceptType: form.conceptType,
    locations: form.locations,
    annualFoodSpend: form.annualFoodSpend,
    distributorType: form.distributorType,
    procurementStrategy: form.procurementStrategy,
    topSkus: form.topSkus.trim(),

    // Phase 2 summary — no raw HTML
    normalizedUrl: validation.normalizedUrl,
    finalUrl: validation.finalUrl,
    finalDecision: validation.finalDecision,
    countryEligibility: validation.countryEligibility,
    websiteReachabilityStatus: validation.websiteReachabilityStatus,
    restaurantSignalScore: validation.restaurantSignalScore,
    websiteLogoHints: validation.websiteLogoHints,
    logoUrl: validation.logoUrl,
    scrapeStatus,

    // Phase 3 deterministic outputs — read-only context; AI must not alter these
    qualified: qualification.qualified,
    spendBucket: qualification.spendBucket,
    dollarEstimate: qualification.dollarEstimate,
    finalPct: qualification.finalPct,
    year1: qualification.year1,
    year5: qualification.year5,
    caseStudy: qualification.caseStudy,
  };
}
