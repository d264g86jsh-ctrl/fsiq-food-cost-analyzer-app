import { describe, it, expect } from 'vitest';
import {
  assignBucket,
  computeModifiers,
  computeSkuMod,
  parseLocationCategory,
  clampFinalPct,
  computeDollarEstimate,
  computeProjections,
  selectCaseStudy,
  computeSavings,
} from '../qualification/savings-formula';

describe('assignBucket', () => {
  it('$499,999 → null (below threshold)', () => {
    expect(assignBucket(499_999)).toBeNull();
  });

  it('$500,000 → $500K–$800K', () => {
    const r = assignBucket(500_000);
    expect(r?.bucket).toBe('$500K–$800K');
    expect(r?.midpoint).toBe(650_000);
    expect(r?.basePct).toBe(5.00);
  });

  it('$799,999 → $500K–$800K', () => {
    expect(assignBucket(799_999)?.bucket).toBe('$500K–$800K');
  });

  it('$800,000 → $800K–$1M', () => {
    const r = assignBucket(800_000);
    expect(r?.bucket).toBe('$800K–$1M');
    expect(r?.midpoint).toBe(900_000);
    expect(r?.basePct).toBe(5.25);
  });

  it('$1,000,000 → $1M–$3M', () => {
    const r = assignBucket(1_000_000);
    expect(r?.bucket).toBe('$1M–$3M');
    expect(r?.midpoint).toBe(2_000_000);
    expect(r?.basePct).toBe(5.50);
  });

  it('$3,000,000 → $3M–$7M', () => {
    const r = assignBucket(3_000_000);
    expect(r?.bucket).toBe('$3M–$7M');
    expect(r?.midpoint).toBe(5_000_000);
    expect(r?.basePct).toBe(5.75);
  });

  it('$7,000,000 → $7M+', () => {
    const r = assignBucket(7_000_000);
    expect(r?.bucket).toBe('$7M+');
    expect(r?.midpoint).toBe(8_500_000);
    expect(r?.basePct).toBe(6.00);
  });

  it('$50,000,000 → $7M+', () => {
    expect(assignBucket(50_000_000)?.bucket).toBe('$7M+');
  });
});

describe('computeModifiers — distributor', () => {
  const base = 5.5;

  it('national_broadliner → +0.70', () => {
    const r = computeModifiers({ distributorType: 'national_broadliner', procurementStrategy: 'negotiated_cost_plus', topSkus: '', locations: 'single' }, base);
    expect(r.distributorMod).toBe(0.70);
  });

  it('"Sysco" → +0.70 (national broadliner variant)', () => {
    const r = computeModifiers({ distributorType: 'Sysco', procurementStrategy: 'negotiated_cost_plus', topSkus: '', locations: 'single' }, base);
    expect(r.distributorMod).toBe(0.70);
  });

  it('"US Foods" → +0.70', () => {
    const r = computeModifiers({ distributorType: 'US Foods', procurementStrategy: 'negotiated_cost_plus', topSkus: '', locations: 'single' }, base);
    expect(r.distributorMod).toBe(0.70);
  });

  it('regional → +0.35', () => {
    const r = computeModifiers({ distributorType: 'regional', procurementStrategy: 'negotiated_cost_plus', topSkus: '', locations: 'single' }, base);
    expect(r.distributorMod).toBe(0.35);
  });

  it('combination → +0.35', () => {
    const r = computeModifiers({ distributorType: 'combination', procurementStrategy: 'negotiated_cost_plus', topSkus: '', locations: 'single' }, base);
    expect(r.distributorMod).toBe(0.35);
  });

  it('local_specialty → +0.00', () => {
    const r = computeModifiers({ distributorType: 'local_specialty', procurementStrategy: 'negotiated_cost_plus', topSkus: '', locations: 'single' }, base);
    expect(r.distributorMod).toBe(0.00);
  });
});

describe('computeModifiers — procurement', () => {
  const base = 5.5;
  const dist = 'local_specialty';

  it('market_price_single → +0.70', () => {
    const r = computeModifiers({ distributorType: dist, procurementStrategy: 'market_price_single', topSkus: '', locations: 'single' }, base);
    expect(r.procurementMod).toBe(0.70);
  });

  it('"market price single" → +0.70 (human-readable)', () => {
    const r = computeModifiers({ distributorType: dist, procurementStrategy: 'market price single', topSkus: '', locations: 'single' }, base);
    expect(r.procurementMod).toBe(0.70);
  });

  it('market_price_multi → +0.35', () => {
    const r = computeModifiers({ distributorType: dist, procurementStrategy: 'market_price_multi', topSkus: '', locations: 'single' }, base);
    expect(r.procurementMod).toBe(0.35);
  });

  it('gpo → +0.20', () => {
    const r = computeModifiers({ distributorType: dist, procurementStrategy: 'gpo', topSkus: '', locations: 'single' }, base);
    expect(r.procurementMod).toBe(0.20);
  });

  it('negotiated_cost_plus → +0.00', () => {
    const r = computeModifiers({ distributorType: dist, procurementStrategy: 'negotiated_cost_plus', topSkus: '', locations: 'single' }, base);
    expect(r.procurementMod).toBe(0.00);
  });
});

describe('computeSkuMod', () => {
  it('protein only → +0.15', () => {
    expect(computeSkuMod('chicken wings, pork ribs')).toBe(0.15);
  });

  it('commodity only → +0.15', () => {
    expect(computeSkuMod('cooking oil, dairy products')).toBe(0.15);
  });

  it('protein AND commodity → +0.30', () => {
    expect(computeSkuMod('beef brisket and cooking oil')).toBe(0.30);
  });

  it('neither → +0.00', () => {
    expect(computeSkuMod('napkins, paper cups, cleaning supplies')).toBe(0.00);
  });

  it('empty string → +0.00', () => {
    expect(computeSkuMod('')).toBe(0.00);
  });
});

describe('parseLocationCategory', () => {
  it('"single" → single', () => {
    expect(parseLocationCategory('single')).toBe('single');
  });

  it('"1" → single (default)', () => {
    expect(parseLocationCategory('1')).toBe('single');
  });

  it('"2-4" → 2-4', () => {
    expect(parseLocationCategory('2-4')).toBe('2-4');
  });

  it('"2–4" (en-dash) → 2-4', () => {
    expect(parseLocationCategory('2–4')).toBe('2-4');
  });

  it('"multiple" → 2-4', () => {
    expect(parseLocationCategory('multiple')).toBe('2-4');
  });

  it('"5+" → 5+', () => {
    expect(parseLocationCategory('5+')).toBe('5+');
  });

  it('"5 or more" → 5+', () => {
    expect(parseLocationCategory('5 or more')).toBe('5+');
  });
});

describe('clampFinalPct', () => {
  it('3.5 → 4.0 (floor)', () => {
    expect(clampFinalPct(3.5)).toBe(4.0);
  });

  it('0 → 4.0 (floor)', () => {
    expect(clampFinalPct(0)).toBe(4.0);
  });

  it('9.1 → 8.0 (ceiling)', () => {
    expect(clampFinalPct(9.1)).toBe(8.0);
  });

  it('5.5 → 5.5 (within range, unchanged)', () => {
    expect(clampFinalPct(5.5)).toBe(5.5);
  });

  it('4.0 → 4.0 (exactly at floor)', () => {
    expect(clampFinalPct(4.0)).toBe(4.0);
  });

  it('8.0 → 8.0 (exactly at ceiling)', () => {
    expect(clampFinalPct(8.0)).toBe(8.0);
  });
});

describe('computeDollarEstimate', () => {
  it('$1M–$3M bucket at 5.5% → $110,000', () => {
    expect(computeDollarEstimate(5.5, 2_000_000)).toBe(110_000);
  });

  it('$500K–$800K bucket at 4.0% (clamped floor) → $26,000', () => {
    expect(computeDollarEstimate(4.0, 650_000)).toBe(26_000);
  });

  it('$7M+ bucket at 8.0% (clamped ceiling) → $680,000', () => {
    expect(computeDollarEstimate(8.0, 8_500_000)).toBe(680_000);
  });
});

describe('computeProjections', () => {
  it('Year 1 equals dollarEstimate', () => {
    const r = computeProjections(100_000);
    expect(r.year1).toBe(100_000);
  });

  it('Year 5 is always the largest value (cumulative running total)', () => {
    const r = computeProjections(100_000);
    expect(r.year5).toBeGreaterThan(r.year4);
    expect(r.year4).toBeGreaterThan(r.year3);
    expect(r.year3).toBeGreaterThan(r.year2);
    expect(r.year2).toBeGreaterThan(r.year1);
  });

  it('year5 height percentage is 100', () => {
    const r = computeProjections(100_000);
    expect(r.projectionHeights.year5).toBe(100);
  });

  it('year1 height percentage is >= 8 (minimum bar height)', () => {
    const r = computeProjections(100_000);
    expect(r.projectionHeights.year1).toBeGreaterThanOrEqual(8);
  });

  it('all bar heights are >= 8', () => {
    const r = computeProjections(100_000);
    const heights = Object.values(r.projectionHeights);
    for (const h of heights) {
      expect(h).toBeGreaterThanOrEqual(8);
    }
  });

  it('projections use 3.9% inflation correctly', () => {
    const base = 100_000;
    const r = computeProjections(base);
    const expectedY2 = Math.round(base + base * Math.pow(1.039, 1));
    expect(r.year2).toBe(expectedY2);
  });

  it('projections with small dollarEstimate still have year5 at 100% bar height', () => {
    const r = computeProjections(26_000);
    expect(r.projectionHeights.year5).toBe(100);
    expect(r.year5).toBeGreaterThan(r.year1);
  });
});

describe('selectCaseStudy', () => {
  it('$500K–$800K single → Black\'s BBQ', () => {
    expect(selectCaseStudy('$500K–$800K', 'single')).toBe("Black's BBQ");
  });

  it('$500K–$800K 2-4 → MaryAnn\'s Diner', () => {
    expect(selectCaseStudy('$500K–$800K', '2-4')).toBe("MaryAnn's Diner");
  });

  it('$1M–$3M single → Spirits', () => {
    expect(selectCaseStudy('$1M–$3M', 'single')).toBe('Spirits');
  });

  it('$1M–$3M 2-4 → MaryAnn\'s Diner', () => {
    expect(selectCaseStudy('$1M–$3M', '2-4')).toBe("MaryAnn's Diner");
  });

  it('$3M–$7M single → The Oasis', () => {
    expect(selectCaseStudy('$3M–$7M', 'single')).toBe('The Oasis');
  });

  it('$3M–$7M 2-4 → Dish Society', () => {
    expect(selectCaseStudy('$3M–$7M', '2-4')).toBe('Dish Society');
  });

  it('$3M–$7M 5+ → Thunderdome', () => {
    expect(selectCaseStudy('$3M–$7M', '5+')  ).toBe('Thunderdome');
  });

  it('$7M+ 5+ → Thunderdome', () => {
    expect(selectCaseStudy('$7M+', '5+')).toBe('Thunderdome');
  });
});

describe('computeSavings — integration', () => {
  it('returns dollarEstimateDisplay formatted as dollars', () => {
    const bucket = { bucket: '$1M–$3M' as const, midpoint: 2_000_000, basePct: 5.5 };
    const r = computeSavings(bucket, {
      distributorType: 'national_broadliner',
      procurementStrategy: 'market_price_single',
      topSkus: 'chicken beef oil',
      locations: '5+',
    });
    expect(r.dollarEstimateDisplay).toMatch(/^\$/);
    expect(r.finalPctDisplay).toMatch(/%$/);
  });

  it('finalPct is clamped between 4.0 and 8.0', () => {
    const bucket = { bucket: '$7M+' as const, midpoint: 8_500_000, basePct: 6.0 };
    const r = computeSavings(bucket, {
      distributorType: 'national_broadliner',
      procurementStrategy: 'market_price_single',
      topSkus: 'chicken beef oil dairy',
      locations: '5+',
    });
    expect(r.finalPct).toBeGreaterThanOrEqual(4.0);
    expect(r.finalPct).toBeLessThanOrEqual(8.0);
  });

  it('all projection years are positive integers', () => {
    const bucket = { bucket: '$1M–$3M' as const, midpoint: 2_000_000, basePct: 5.5 };
    const r = computeSavings(bucket, {
      distributorType: 'local_specialty',
      procurementStrategy: 'negotiated_cost_plus',
      topSkus: '',
      locations: 'single',
    });
    expect(r.year1).toBeGreaterThan(0);
    expect(r.year5).toBeGreaterThan(r.year1);
    expect(Number.isInteger(r.year1)).toBe(true);
  });
});
