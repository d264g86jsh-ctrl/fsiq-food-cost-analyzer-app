import { describe, it, expect } from 'vitest';
import { selectNarrativeAngle, buildAngleContext, hasMultiUnitModifier } from '../ai/angle-selector';
import { NARRATIVE_ANGLES } from '../ai/narrative-angles';
import { buildNarrativeUserPrompt } from '../ai/prompts';
import type { AiResearchInput } from '../ai/ai-types';

// ── Shared test input factory ─────────────────────────────────────────────────

function makeInput(overrides: Partial<AiResearchInput> = {}): AiResearchInput {
  return {
    restaurantName: 'Test Restaurant',
    website: 'https://testrestaurant.com',
    conceptType: 'Casual dining',
    locations: '2-4 locations',
    annualFoodSpend: '$1M–$3M',
    distributorType: 'national_broadliners',
    procurementStrategy: 'market_price_single',
    topSkus: 'chicken, beef',
    normalizedUrl: 'https://testrestaurant.com',
    finalUrl: 'https://testrestaurant.com',
    finalDecision: 'verified_restaurant',
    countryEligibility: 'us_verified',
    websiteReachabilityStatus: 'reachable',
    restaurantSignalScore: 75,
    websiteLogoHints: [],
    logoUrl: null,
    scrapeStatus: 'phase2_signals',
    qualified: true,
    spendBucket: '$1M–$3M',
    dollarEstimate: 110000,
    finalPct: 5.5,
    year1: 110000,
    year5: 130000,
    caseStudy: "Black's BBQ",
    ...overrides,
  };
}

// ── Angle selection ───────────────────────────────────────────────────────────

describe('selectNarrativeAngle', () => {
  it('negotiated_cost_plus → optimized_buyer (highest priority)', () => {
    expect(selectNarrativeAngle(makeInput({ procurementStrategy: 'negotiated_cost_plus' }))).toBe('optimized_buyer');
  });

  it('gpo → gpo_member', () => {
    expect(selectNarrativeAngle(makeInput({ procurementStrategy: 'gpo' }))).toBe('gpo_member');
  });

  it('gpo overrides broadliner (priority 2 > priority 4)', () => {
    expect(selectNarrativeAngle(makeInput({
      procurementStrategy: 'gpo',
      distributorType: 'national_broadliners',
    }))).toBe('gpo_member');
  });

  it('local_specialty + fine dining → premium_independent', () => {
    expect(selectNarrativeAngle(makeInput({
      distributorType: 'local_specialty',
      conceptType: 'Fine dining',
    }))).toBe('premium_independent');
  });

  it('local_specialty + full-service independent → premium_independent', () => {
    expect(selectNarrativeAngle(makeInput({
      distributorType: 'local_specialty',
      conceptType: 'Full-service independent',
    }))).toBe('premium_independent');
  });

  it('local_specialty + casual dining → NOT premium_independent (concept type must match)', () => {
    const angle = selectNarrativeAngle(makeInput({
      distributorType: 'local_specialty',
      conceptType: 'Casual dining',
    }));
    expect(angle).not.toBe('premium_independent');
  });

  it('broadliner + market_price_single → captive_buyer', () => {
    expect(selectNarrativeAngle(makeInput({
      distributorType: 'national_broadliners',
      procurementStrategy: 'market_price_single',
    }))).toBe('captive_buyer');
  });

  it('market_price_multiple → fragmented_buyer', () => {
    expect(selectNarrativeAngle(makeInput({ procurementStrategy: 'market_price_multiple' }))).toBe('fragmented_buyer');
  });

  it('combination distributor → fragmented_buyer', () => {
    expect(selectNarrativeAngle(makeInput({
      distributorType: 'combination',
      procurementStrategy: 'market_price_single',
    }))).toBe('fragmented_buyer');
  });

  it('regional distributor → fragmented_buyer', () => {
    expect(selectNarrativeAngle(makeInput({
      distributorType: 'regional',
      procurementStrategy: 'market_price_single',
    }))).toBe('fragmented_buyer');
  });

  it('empty/unknown inputs → defaults to captive_buyer', () => {
    expect(selectNarrativeAngle(makeInput({ distributorType: '', procurementStrategy: '' }))).toBe('captive_buyer');
  });

  it('optimized_buyer wins over everything else when negotiated_cost_plus', () => {
    const angle = selectNarrativeAngle(makeInput({
      distributorType: 'local_specialty',
      procurementStrategy: 'negotiated_cost_plus',
      conceptType: 'Fine dining',
      locations: '5-10 locations',
    }));
    expect(angle).toBe('optimized_buyer');
  });
});

// ── Multi-unit modifier ───────────────────────────────────────────────────────

describe('hasMultiUnitModifier', () => {
  it('Single location → false (legacy value)', () => {
    expect(hasMultiUnitModifier('Single location')).toBe(false);
  });

  it('2-4 locations → true', () => {
    expect(hasMultiUnitModifier('2-4 locations')).toBe(true);
  });

  it('5-10 locations → true', () => {
    expect(hasMultiUnitModifier('5-10 locations')).toBe(true);
  });

  it('10+ locations → true', () => {
    expect(hasMultiUnitModifier('10+ locations')).toBe(true);
  });

  it('empty string → false', () => {
    expect(hasMultiUnitModifier('')).toBe(false);
  });
});

// ── buildAngleContext ─────────────────────────────────────────────────────────

describe('buildAngleContext', () => {
  it('captive buyer with 2-4 locations → has multi-unit modifier', () => {
    const ctx = buildAngleContext(makeInput({
      distributorType: 'national_broadliners',
      procurementStrategy: 'market_price_single',
      locations: '2-4 locations',
    }));
    expect(ctx.primaryAngle).toBe('captive_buyer');
    expect(ctx.hasMultiUnitModifier).toBe(true);
  });

  it('multi-unit captive buyer → has multi-unit modifier', () => {
    const ctx = buildAngleContext(makeInput({
      distributorType: 'national_broadliners',
      procurementStrategy: 'market_price_single',
      locations: '5-10 locations',
    }));
    expect(ctx.primaryAngle).toBe('captive_buyer');
    expect(ctx.hasMultiUnitModifier).toBe(true);
  });

  it('GPO member with multiple locations → gpo_member + multi-unit modifier', () => {
    const ctx = buildAngleContext(makeInput({
      procurementStrategy: 'gpo',
      locations: '2 – 4 locations',
    }));
    expect(ctx.primaryAngle).toBe('gpo_member');
    expect(ctx.hasMultiUnitModifier).toBe(true);
  });
});

// ── Angle definitions ─────────────────────────────────────────────────────────

describe('NARRATIVE_ANGLES definitions', () => {
  it('all 6 angles exist and have required fields', () => {
    const requiredIds = ['captive_buyer', 'fragmented_buyer', 'gpo_member', 'multi_unit_operator', 'premium_independent', 'optimized_buyer'];
    for (const id of requiredIds) {
      const angle = NARRATIVE_ANGLES[id as keyof typeof NARRATIVE_ANGLES];
      expect(angle).toBeDefined();
      expect(angle.coreMessage).toBeTruthy();
      expect(angle.distributorGuidance).toBeTruthy();
      expect(angle.procurementGuidance).toBeTruthy();
      expect(angle.skuGuidance).toBeTruthy();
      expect(angle.avoidance.length).toBeGreaterThan(0);
      expect(angle.talkingPoints.length).toBeGreaterThan(0);
    }
  });

  it('estimated coverage sums to reasonable range (accounting for multi-unit overlap)', () => {
    const total = Object.values(NARRATIVE_ANGLES).reduce((sum, a) => sum + a.estimatedCoverage, 0);
    // Total > 100 is expected because multi_unit_operator overlaps others
    expect(total).toBeGreaterThan(90);
  });
});

// ── Prompt integration ────────────────────────────────────────────────────────

describe('buildNarrativeUserPrompt — angle injection', () => {
  it('captive_buyer prompt contains angle name and core message framing', () => {
    const prompt = buildNarrativeUserPrompt(makeInput({
      distributorType: 'national_broadliners',
      procurementStrategy: 'market_price_single',
      locations: '2-4 locations',
    }));
    expect(prompt).toContain('Captive Buyer');
    expect(prompt).toContain('urgent');
    expect(prompt).toContain('narrativeDistributor');
  });

  it('gpo_member prompt uses sophisticated tone', () => {
    const prompt = buildNarrativeUserPrompt(makeInput({ procurementStrategy: 'gpo' }));
    expect(prompt).toContain('GPO Member');
    expect(prompt).toContain('sophisticated');
  });

  it('premium_independent prompt uses respectful tone', () => {
    const prompt = buildNarrativeUserPrompt(makeInput({
      distributorType: 'local_specialty',
      conceptType: 'Fine dining',
    }));
    expect(prompt).toContain('Premium Independent');
    expect(prompt).toContain('respectful');
  });

  it('optimized_buyer prompt uses analytical tone', () => {
    const prompt = buildNarrativeUserPrompt(makeInput({ procurementStrategy: 'negotiated_cost_plus' }));
    expect(prompt).toContain('Optimized Buyer');
    expect(prompt).toContain('analytical');
  });

  it('multi-unit modifier appended when 5+ locations', () => {
    const prompt = buildNarrativeUserPrompt(makeInput({
      distributorType: 'national_broadliners',
      procurementStrategy: 'market_price_single',
      locations: '5-10 locations',
    }));
    expect(prompt).toContain('MULTI-UNIT MODIFIER');
  });

  it('no multi-unit modifier for single location', () => {
    const prompt = buildNarrativeUserPrompt(makeInput({ locations: 'Single location' }));
    expect(prompt).not.toContain('MULTI-UNIT MODIFIER');
  });

  it('savings context still present with angle injection', () => {
    const prompt = buildNarrativeUserPrompt(makeInput());
    expect(prompt).toContain('110,000');
    expect(prompt).toContain('5.5%');
    expect(prompt.toLowerCase()).toContain('read-only');
  });

  it('topSkus still present with angle injection', () => {
    const prompt = buildNarrativeUserPrompt(makeInput({ topSkus: 'salmon, oysters' }));
    expect(prompt).toContain('salmon, oysters');
  });
});
