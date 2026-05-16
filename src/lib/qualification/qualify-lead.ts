// Full qualification decision engine.
// Source of truth: docs/savings-formula.md §2.
// AI must not be called here. All decisions are deterministic.

import { parseSpend } from './spend-parser';
import { assignBucket, computeSavings, type SavingsResult, type SpendBucket, type LocationCategory } from './savings-formula';
import { detectNationalChain } from './national-chains';

// ── Types ─────────────────────────────────────────────────────────────────────

export type DqReason =
  | 'national_chain'
  | 'invalid_website'
  | 'below_threshold'
  | 'below_minimum'
  | 'clear_non_fit';

// Minimal validation context required from Phase 2 output
export interface ValidationContext {
  // From validator: verified_restaurant | plausible_unverified | clear_non_fit | national_chain | invalid_website
  finalDecision: string;
  // Optional: used internally to distinguish invalid_website sub-types (404 vs DNS)
  websiteReachabilityStatus?: string;
  internalFlags?: string[];
}

export interface QualifyLeadInput {
  restaurantName: string;
  annualFoodSpend: string;
  locations: string;
  distributorType: string;
  procurementStrategy: string;
  topSkus: string;
  validation: ValidationContext;
}

// Result when disqualified — savings fields are absent
interface DqResult {
  qualified: false;
  dqReason: DqReason;
  spendParse: ReturnType<typeof parseSpend>;
  annualSpend: number;
  spendBucket: null;
  bucketMidpoint: null;
  basePct: null;
  distributorMod: null;
  procurementMod: null;
  skuMod: null;
  locationsMod: null;
  rawTotal: null;
  finalPct: null;
  finalPctDisplay: null;
  dollarEstimate: null;
  dollarEstimateDisplay: null;
  year1: null;
  year2: null;
  year3: null;
  year4: null;
  year5: null;
  projectionHeights: null;
  caseStudy: null;
  locationCategory: null;
  reasons: string[];
  internalFlags: string[];
}

// Result when qualified — all savings fields populated
interface QualifiedResult {
  qualified: true;
  dqReason: null;
  spendParse: ReturnType<typeof parseSpend>;
  annualSpend: number;
  spendBucket: SpendBucket;
  bucketMidpoint: number;
  basePct: number;
  distributorMod: number;
  procurementMod: number;
  skuMod: number;
  locationsMod: number;
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
  projectionHeights: SavingsResult['projectionHeights'];
  caseStudy: string;
  locationCategory: LocationCategory;
  reasons: string[];
  internalFlags: string[];
}

export type QualifyLeadResult = DqResult | QualifiedResult;

// ── Main qualification function ───────────────────────────────────────────────

// DQ priority (docs/savings-formula.md §2):
// 1. national_chain
// 2. invalid_website  (404 / NXDOMAIN — NOT 403/503/timeout/blocked)
// 3. below_threshold  (spend < $500K)
// 4. below_minimum    (spend < $50K — sub-case of below_threshold)
export function qualifyLead(input: QualifyLeadInput): QualifyLeadResult {
  const reasons: string[] = [];
  const flags: string[] = [...(input.validation.internalFlags ?? [])];

  // ── Priority 1: national_chain ─────────────────────────────────────────────
  // Check both the validator's decision and the name directly (defense in depth).
  const isChainByValidation = input.validation.finalDecision === 'national_chain';
  const chainCheck = detectNationalChain({
    restaurantName: input.restaurantName,
    domain: '',
  });
  const isChainByName = chainCheck.score >= 85;

  if (isChainByValidation || isChainByName) {
    reasons.push(isChainByName ? `national_chain:${chainCheck.matchedChain ?? 'name_match'}` : 'national_chain:validation');
    return dq('national_chain', input, reasons, flags);
  }

  // ── Priority 2: invalid_website ────────────────────────────────────────────
  // Only finalDecision === 'invalid_website' counts (confirmed 404/NXDOMAIN/malformed).
  // 403/503/0/timeout are plausible_unverified and do NOT trigger this DQ.
  if (input.validation.finalDecision === 'invalid_website') {
    reasons.push('invalid_website:validation');
    return dq('invalid_website', input, reasons, flags);
  }

  // ── Priority 3 & 4: spend threshold ───────────────────────────────────────
  const spendParse = parseSpend(input.annualFoodSpend);
  const { annualSpend } = spendParse;
  if (spendParse.parseFallback) flags.push('spend_parse_fallback');

  const BELOW_MINIMUM_THRESHOLD = 50_000;
  const BELOW_SPEND_THRESHOLD = 500_000;

  if (annualSpend < BELOW_MINIMUM_THRESHOLD) {
    reasons.push(`below_minimum:$${annualSpend}`);
    return dq('below_minimum', input, reasons, flags, spendParse);
  }

  if (annualSpend < BELOW_SPEND_THRESHOLD) {
    reasons.push(`below_threshold:$${annualSpend}`);
    return dq('below_threshold', input, reasons, flags, spendParse);
  }

  // ── Qualified — run savings formula ────────────────────────────────────────
  const bucketResult = assignBucket(annualSpend);
  if (!bucketResult) {
    // Should not happen if annualSpend >= 500K, but guard against edge cases
    reasons.push('bucket_assignment_failed');
    return dq('below_threshold', input, reasons, flags, spendParse);
  }

  reasons.push('qualified');
  if (spendParse.parseFallback) reasons.push('spend_parse_fallback_used');

  const savings = computeSavings(bucketResult, {
    distributorType: input.distributorType,
    procurementStrategy: input.procurementStrategy,
    topSkus: input.topSkus,
    locations: input.locations,
  });

  return {
    qualified: true,
    dqReason: null,
    spendParse,
    annualSpend,
    spendBucket: savings.bucket,
    bucketMidpoint: savings.midpoint,
    basePct: savings.basePct,
    distributorMod: savings.distributorMod,
    procurementMod: savings.procurementMod,
    skuMod: savings.skuMod,
    locationsMod: savings.locationsMod,
    rawTotal: savings.rawTotal,
    finalPct: savings.finalPct,
    finalPctDisplay: savings.finalPctDisplay,
    dollarEstimate: savings.dollarEstimate,
    dollarEstimateDisplay: savings.dollarEstimateDisplay,
    year1: savings.year1,
    year2: savings.year2,
    year3: savings.year3,
    year4: savings.year4,
    year5: savings.year5,
    projectionHeights: savings.projectionHeights,
    caseStudy: savings.caseStudy,
    locationCategory: savings.locationCategory,
    reasons,
    internalFlags: flags,
  };
}

// ── Helper ────────────────────────────────────────────────────────────────────

function dq(
  reason: DqReason,
  input: QualifyLeadInput,
  reasons: string[],
  flags: string[],
  spendParse?: ReturnType<typeof parseSpend>,
): DqResult {
  const parsed = spendParse ?? parseSpend(input.annualFoodSpend);
  return {
    qualified: false,
    dqReason: reason,
    spendParse: parsed,
    annualSpend: parsed.annualSpend,
    spendBucket: null,
    bucketMidpoint: null,
    basePct: null,
    distributorMod: null,
    procurementMod: null,
    skuMod: null,
    locationsMod: null,
    rawTotal: null,
    finalPct: null,
    finalPctDisplay: null,
    dollarEstimate: null,
    dollarEstimateDisplay: null,
    year1: null,
    year2: null,
    year3: null,
    year4: null,
    year5: null,
    projectionHeights: null,
    caseStudy: null,
    locationCategory: null,
    reasons,
    internalFlags: flags,
  };
}
