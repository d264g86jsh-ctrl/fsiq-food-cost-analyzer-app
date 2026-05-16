// Deterministic fallback content for when AI is unavailable, times out, or returns invalid output.
// Uses known form fields only — does not invent specifics.
// No em-dashes or en-dashes in any output string.
//
// Called by ai-researcher.ts and ai-narrative.ts on any failure path.
// Must remain pure (no async, no network, no randomness).

import type { AiResearchInput, AiResearchResult, AiNarrativeResult } from './ai-types';

type FallbackResearch = Pick<AiResearchResult, 'logoUrl' | 'businessSummary' | 'conceptSignals' | 'scrapeStatus'>;
type FallbackNarrative = Pick<AiNarrativeResult, 'narrativeDistributor' | 'narrativeProcurement' | 'narrativeSku'>;

// ── Research fallback ─────────────────────────────────────────────────────────

export function buildFallbackResearch(input: AiResearchInput): FallbackResearch {
  const locationLabel =
    input.locations === '5+ locations'
      ? 'multi-unit'
      : input.locations === 'Single location'
        ? 'single-location'
        : 'multi-location';

  const conceptLower = input.conceptType.toLowerCase();

  return {
    logoUrl: null,
    businessSummary: `${input.restaurantName} is a ${locationLabel} ${conceptLower} restaurant.`,
    conceptSignals: [conceptLower, locationLabel].filter(Boolean),
    scrapeStatus: input.scrapeStatus,
  };
}

// ── Narrative fallback ────────────────────────────────────────────────────────

export function buildFallbackNarrative(input: AiResearchInput): FallbackNarrative {
  const distributorLower = input.distributorType.toLowerCase();
  const procurementLower = input.procurementStrategy.toLowerCase();
  const skuContext = input.topSkus.trim();

  const narrativeSku = skuContext
    ? `Key spend categories include ${skuContext}. High-volume, high-frequency items typically offer the most savings opportunity when pricing is reviewed against current market benchmarks. Restaurants at your spend level commonly find measurable reductions by consolidating suppliers or renegotiating terms on their top categories.`
    : 'Your food cost profile spans multiple protein and commodity categories. High-volume, high-frequency items typically offer the most savings opportunity when pricing is reviewed against current market benchmarks. Restaurants at your spend level commonly find measurable reductions by consolidating suppliers or renegotiating terms on their top categories.';

  return {
    narrativeDistributor: `Your current distributor setup, ${distributorLower}, is typical for restaurants at your volume. Distribution pricing often has room for negotiation, particularly on freight, fuel surcharges, and delivery minimums. A systematic review of your current contract terms could surface meaningful cost reduction opportunities based on your purchase patterns.`,

    narrativeProcurement: `Restaurants using a ${procurementLower} approach typically have meaningful leverage to reduce costs by benchmarking against market rates and identifying contract gaps. A structured review of your procurement strategy, aligned with your spend volume, is a practical first step toward consistent savings.`,

    narrativeSku,
  };
}
