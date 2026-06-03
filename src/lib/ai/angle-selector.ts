// Deterministic angle selection — maps form inputs to a NarrativeAngleId.
// No AI involved. Called before the Claude narrative prompt is built.
// Selection priority mirrors the savings formula: procurement strategy first,
// then distributor type, then concept type.

import type { AiResearchInput } from './ai-types';
import type { NarrativeAngleId } from './narrative-angles';

export interface AngleContext {
  primaryAngle: NarrativeAngleId;
  hasMultiUnitModifier: boolean; // true when locations = 2-4 or 5+
}

export function selectNarrativeAngle(input: AiResearchInput): NarrativeAngleId {
  const distributor = (input.distributorType ?? '').toLowerCase();
  const procurement = (input.procurementStrategy ?? '').toLowerCase();
  const concept    = (input.conceptType ?? '').toLowerCase();

  // Priority 1: Negotiated cost-plus — most operationally mature profile
  if (procurement.includes('negotiated') || procurement === 'negotiated_cost_plus') {
    return 'optimized_buyer';
  }

  // Priority 2: GPO member — cost-aware, specific messaging needed
  if (procurement.includes('gpo') || procurement === 'gpo') {
    return 'gpo_member';
  }

  // Priority 3: Premium independent — very specific trigger, easy to over-fire
  // Requires BOTH local/specialty distributor AND premium concept type
  const isPremiumDistributor = distributor.includes('local') || distributor.includes('specialty') || distributor === 'local_specialty';
  const isPremiumConcept =
    concept.includes('fine dining') ||
    concept.includes('full-service') ||
    concept.includes('farm') ||
    concept.includes('premium');
  if (isPremiumDistributor && isPremiumConcept) {
    return 'premium_independent';
  }

  // Priority 4: Captive buyer — single broadliner + market price single
  const isBroadliner = distributor.includes('broadlin') || distributor.includes('national') || distributor === 'national_broadliners';
  const isMarketPriceSingle = procurement.includes('single') || procurement === 'market_price_single';
  if (isBroadliner && isMarketPriceSingle) {
    return 'captive_buyer';
  }

  // Priority 5: Fragmented buyer — market price across multiple vendors
  if (procurement.includes('multiple') || procurement.includes('multi') || procurement === 'market_price_multiple') {
    return 'fragmented_buyer';
  }

  // Default: captive_buyer covers any remaining broadliner case
  // (combination/regional distributors default to fragmented framing)
  if (distributor.includes('combination') || distributor.includes('combo') || distributor.includes('regional')) {
    return 'fragmented_buyer';
  }

  return 'captive_buyer';
}

export function hasMultiUnitModifier(locations: string): boolean {
  if (!locations) return false;
  const s = locations.toLowerCase();
  return s.includes('2') || s.includes('5+') || s.includes('5 or more') || s.includes('multiple');
}

export function buildAngleContext(input: AiResearchInput): AngleContext {
  return {
    primaryAngle: selectNarrativeAngle(input),
    hasMultiUnitModifier: hasMultiUnitModifier(input.locations),
  };
}
