import { describe, it, expect } from 'vitest';
import { qualifyLead, type QualifyLeadInput } from '../qualification/qualify-lead';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<QualifyLeadInput> = {}): QualifyLeadInput {
  return {
    restaurantName: 'Casa Roberto',
    annualFoodSpend: '2M',
    locations: 'single',
    distributorType: 'national_broadliner',
    procurementStrategy: 'market_price_single',
    topSkus: 'chicken and beef',
    validation: { finalDecision: 'verified_restaurant' },
    ...overrides,
  };
}

// ── DQ: national_chain ────────────────────────────────────────────────────────

describe('DQ: national_chain', () => {
  it('validation.finalDecision=national_chain → DQ national_chain', () => {
    const r = qualifyLead(makeInput({
      validation: { finalDecision: 'national_chain' },
    }));
    expect(r.qualified).toBe(false);
    expect(r.dqReason).toBe('national_chain');
  });

  it('known chain name (McDonald\'s) → DQ national_chain even if validation says verified_restaurant', () => {
    const r = qualifyLead(makeInput({
      restaurantName: "McDonald's",
      annualFoodSpend: '5M',
      validation: { finalDecision: 'verified_restaurant' },
    }));
    expect(r.qualified).toBe(false);
    expect(r.dqReason).toBe('national_chain');
  });

  it('national_chain beats invalid_website (priority 1 > priority 2)', () => {
    const r = qualifyLead(makeInput({
      restaurantName: "McDonald's",
      validation: { finalDecision: 'invalid_website' },
    }));
    expect(r.dqReason).toBe('national_chain');
  });

  it('national_chain beats below_threshold (priority 1 > spend check)', () => {
    const r = qualifyLead(makeInput({
      restaurantName: 'Subway',
      annualFoodSpend: '100',
      validation: { finalDecision: 'verified_restaurant' },
    }));
    expect(r.dqReason).toBe('national_chain');
  });
});

// ── DQ: invalid_website ───────────────────────────────────────────────────────

describe('DQ: invalid_website', () => {
  it('finalDecision=invalid_website → DQ invalid_website', () => {
    const r = qualifyLead(makeInput({
      validation: { finalDecision: 'invalid_website' },
    }));
    expect(r.qualified).toBe(false);
    expect(r.dqReason).toBe('invalid_website');
  });

  it('invalid_website beats below_threshold (priority 2 > spend check)', () => {
    const r = qualifyLead(makeInput({
      annualFoodSpend: '100',
      validation: { finalDecision: 'invalid_website' },
    }));
    expect(r.dqReason).toBe('invalid_website');
  });

  it('403 response does NOT become invalid_website (plausible_unverified passes)', () => {
    const r = qualifyLead(makeInput({
      annualFoodSpend: '2M',
      validation: {
        finalDecision: 'plausible_unverified',
        websiteReachabilityStatus: '403',
      },
    }));
    expect(r.qualified).toBe(true);
    expect(r.dqReason).toBeNull();
  });

  it('503 response does NOT become invalid_website', () => {
    const r = qualifyLead(makeInput({
      annualFoodSpend: '2M',
      validation: {
        finalDecision: 'plausible_unverified',
        websiteReachabilityStatus: '503',
      },
    }));
    expect(r.qualified).toBe(true);
  });

  it('timeout does NOT become invalid_website', () => {
    const r = qualifyLead(makeInput({
      annualFoodSpend: '2M',
      validation: {
        finalDecision: 'plausible_unverified',
        websiteReachabilityStatus: 'timeout',
      },
    }));
    expect(r.qualified).toBe(true);
  });

  it('Cloudflare-blocked does NOT become invalid_website', () => {
    const r = qualifyLead(makeInput({
      annualFoodSpend: '2M',
      validation: {
        finalDecision: 'plausible_unverified',
        websiteReachabilityStatus: 'blocked',
      },
    }));
    expect(r.qualified).toBe(true);
  });
});

// ── DQ: below_minimum ─────────────────────────────────────────────────────────

describe('DQ: below_minimum', () => {
  it('annualSpend < $50,000 → DQ below_minimum', () => {
    const r = qualifyLead(makeInput({ annualFoodSpend: '30000' }));
    expect(r.qualified).toBe(false);
    expect(r.dqReason).toBe('below_minimum');
  });

  it('$49,999 → DQ below_minimum', () => {
    const r = qualifyLead(makeInput({ annualFoodSpend: '49999' }));
    expect(r.dqReason).toBe('below_minimum');
  });

  it('$50,000 → NOT below_minimum (becomes below_threshold)', () => {
    const r = qualifyLead(makeInput({ annualFoodSpend: '50000' }));
    expect(r.dqReason).toBe('below_threshold');
  });
});

// ── DQ: below_threshold ───────────────────────────────────────────────────────

describe('DQ: below_threshold', () => {
  it('$499,999 → DQ below_threshold', () => {
    const r = qualifyLead(makeInput({ annualFoodSpend: '499999' }));
    expect(r.qualified).toBe(false);
    expect(r.dqReason).toBe('below_threshold');
  });

  it('$50,000 → DQ below_threshold', () => {
    const r = qualifyLead(makeInput({ annualFoodSpend: '50000' }));
    expect(r.dqReason).toBe('below_threshold');
  });

  it('$500,000 → qualified (exactly at threshold)', () => {
    const r = qualifyLead(makeInput({ annualFoodSpend: '500000' }));
    expect(r.qualified).toBe(true);
    expect(r.dqReason).toBeNull();
  });
});

// ── Qualified lead ────────────────────────────────────────────────────────────

describe('qualified lead', () => {
  it('qualified lead returns full savings result', () => {
    const r = qualifyLead(makeInput({ annualFoodSpend: '2M' }));
    expect(r.qualified).toBe(true);
    if (!r.qualified) return; // type narrowing
    expect(r.spendBucket).toBe('$1M–$3M');
    expect(r.bucketMidpoint).toBe(2_000_000);
    expect(typeof r.finalPct).toBe('number');
    expect(typeof r.dollarEstimate).toBe('number');
    expect(r.dollarEstimateDisplay).toMatch(/^\$/);
    expect(r.year5).toBeGreaterThan(r.year1);
    expect(typeof r.caseStudy).toBe('string');
    expect(r.caseStudy.length).toBeGreaterThan(0);
  });

  it('finalPct is within approved 4.0%–8.0% range', () => {
    const r = qualifyLead(makeInput({ annualFoodSpend: '2M' }));
    if (!r.qualified) throw new Error('Expected qualified');
    expect(r.finalPct).toBeGreaterThanOrEqual(4.0);
    expect(r.finalPct).toBeLessThanOrEqual(8.0);
  });

  it('reasons array contains "qualified" for qualified leads', () => {
    const r = qualifyLead(makeInput({ annualFoodSpend: '2M' }));
    expect(r.reasons).toContain('qualified');
  });

  it('dqReason is null for qualified leads', () => {
    const r = qualifyLead(makeInput({ annualFoodSpend: '2M' }));
    expect(r.dqReason).toBeNull();
  });

  it('projectionHeights.year5 is 100 for qualified leads', () => {
    const r = qualifyLead(makeInput({ annualFoodSpend: '2M' }));
    if (!r.qualified) throw new Error('Expected qualified');
    expect(r.projectionHeights.year5).toBe(100);
  });

  it('locationCategory is correct for 5+ locations', () => {
    const r = qualifyLead(makeInput({ annualFoodSpend: '2M', locations: '5+' }));
    if (!r.qualified) throw new Error('Expected qualified');
    expect(r.locationCategory).toBe('5+');
  });
});

// ── DQ result shape ───────────────────────────────────────────────────────────

describe('DQ result shape', () => {
  it('DQ result has null savings fields', () => {
    const r = qualifyLead(makeInput({ annualFoodSpend: '100k' }));
    expect(r.qualified).toBe(false);
    expect(r.spendBucket).toBeNull();
    expect(r.finalPct).toBeNull();
    expect(r.dollarEstimate).toBeNull();
    expect(r.caseStudy).toBeNull();
    expect(r.year1).toBeNull();
    expect(r.projectionHeights).toBeNull();
  });

  it('DQ result has non-null spendParse and annualSpend', () => {
    const r = qualifyLead(makeInput({ annualFoodSpend: '200000' }));
    expect(r.spendParse).toBeDefined();
    expect(r.annualSpend).toBe(200_000);
  });
});

// ── skuMod — deterministic, no AI ────────────────────────────────────────────

describe('skuMod — deterministic keyword matching only', () => {
  it('topSkus with protein only → skuMod 0.15', () => {
    const r = qualifyLead(makeInput({ topSkus: 'chicken wings and brisket' }));
    if (!r.qualified) throw new Error('Expected qualified');
    expect(r.skuMod).toBe(0.15);
  });

  it('topSkus with commodity only → skuMod 0.15', () => {
    const r = qualifyLead(makeInput({ topSkus: 'cooking oil and dairy' }));
    if (!r.qualified) throw new Error('Expected qualified');
    expect(r.skuMod).toBe(0.15);
  });

  it('topSkus with both protein and commodity → skuMod 0.30', () => {
    const r = qualifyLead(makeInput({ topSkus: 'chicken and oil' }));
    if (!r.qualified) throw new Error('Expected qualified');
    expect(r.skuMod).toBe(0.30);
  });

  it('topSkus with neither → skuMod 0.00', () => {
    const r = qualifyLead(makeInput({ topSkus: 'napkins and cleaning supplies' }));
    if (!r.qualified) throw new Error('Expected qualified');
    expect(r.skuMod).toBe(0.00);
  });
});

// ── internalFlags propagation ─────────────────────────────────────────────────

describe('internalFlags propagation', () => {
  it('internalFlags from validation are passed through', () => {
    const r = qualifyLead(makeInput({
      validation: {
        finalDecision: 'verified_restaurant',
        internalFlags: ['custom_flag'],
      },
    }));
    expect(r.internalFlags).toContain('custom_flag');
  });

  it('spend_parse_fallback flag set when parseFallback is true', () => {
    const r = qualifyLead(makeInput({ annualFoodSpend: 'depends' }));
    expect(r.internalFlags).toContain('spend_parse_fallback');
  });
});
