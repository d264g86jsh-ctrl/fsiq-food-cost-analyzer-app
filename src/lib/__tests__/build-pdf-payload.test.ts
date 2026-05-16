import { describe, it, expect } from 'vitest';
import { buildPdfPayload } from '../pdf/build-pdf-payload';
import type { GeneratePdfInput } from '../pdf/pdf-types';

// ── Fixture ───────────────────────────────────────────────────────────────────

const baseInput: GeneratePdfInput = {
  restaurantName:       'casa roberto',
  fullName:             'maria garcia',
  conceptType:          'Casual dining',
  locations:            '2 – 4 locations',
  annualSpend:          2_000_000,
  spendBucket:          '$1M–$3M',
  finalPctDisplay:      '7.4%',
  dollarEstimateDisplay: '$147,000',
  dollarEstimate:       147_000,
  caseStudy:            "MaryAnn's Diner",
  year1:                147_000,
  year2:                152_733,
  year3:                158_690,
  year4:                164_879,
  year5:                171_310,
  projectionHeights:    { year1: 18, year2: 38, year3: 58, year4: 78, year5: 100 },
  logoUrl:              'https://casaroberto.com/logo.png',
  businessSummary:      'Casa Roberto is a casual Mexican restaurant in Austin.',
  narrativeDistributor: 'Distributor narrative here.',
  narrativeProcurement: 'Procurement narrative here.',
  narrativeSku:         'SKU narrative here.',
  mode:                 'full',
};

// ── Identity and name formatting ──────────────────────────────────────────────

describe('buildPdfPayload — identity', () => {
  it('title-cases restaurantName', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.restaurantName).toBe('Casa Roberto');
  });

  it('title-cases fullName', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.fullName).toBe('Maria Garcia');
  });

  it('passes conceptTypeRaw unchanged', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.conceptTypeRaw).toBe('Casual dining');
  });

  it('passes locationsRaw unchanged', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.locationsRaw).toBe('2 – 4 locations');
  });
});

// ── Savings fields ────────────────────────────────────────────────────────────

describe('buildPdfPayload — savings fields', () => {
  it('formats annualSpendDisplay as dollar string', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.annualSpendDisplay).toBe('$2,000,000');
  });

  it('passes spendBucket', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.spendBucket).toBe('$1M–$3M');
  });

  it('passes finalPctDisplay', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.finalPctDisplay).toBe('7.4%');
  });

  it('passes dollarEstimateDisplay', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.dollarEstimateDisplay).toBe('$147,000');
  });

  it('passes caseStudy', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.caseStudy).toBe("MaryAnn's Diner");
  });
});

// ── Concept benchmark ─────────────────────────────────────────────────────────

describe('buildPdfPayload — conceptBenchmark', () => {
  it('"Casual dining" → "28%–32%"', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.conceptBenchmark).toBe('28%–32%');
  });

  it('"Quick service" → "20%–25%"', () => {
    const p = buildPdfPayload({ ...baseInput, conceptType: 'Quick service' });
    expect(p.conceptBenchmark).toBe('20%–25%');
  });

  it('"Fast casual" → "25%–30%"', () => {
    const p = buildPdfPayload({ ...baseInput, conceptType: 'Fast casual' });
    expect(p.conceptBenchmark).toBe('25%–30%');
  });

  it('"Fine dining" → "30%–35%"', () => {
    const p = buildPdfPayload({ ...baseInput, conceptType: 'Fine dining' });
    expect(p.conceptBenchmark).toBe('30%–35%');
  });

  it('unknown concept type → "28%–32%" default', () => {
    const p = buildPdfPayload({ ...baseInput, conceptType: 'Ghost kitchen' });
    expect(p.conceptBenchmark).toBe('28%–32%');
  });

  it('conceptBenchmark contains en-dash (intentional for PDF display)', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.conceptBenchmark).toContain('–');
  });
});

// ── Projection display strings ────────────────────────────────────────────────

describe('buildPdfPayload — projection display strings', () => {
  it('formats year1Display', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.year1Display).toBe('$147,000');
  });

  it('formats year5Display', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.year5Display).toBe('$171,310');
  });
});

// ── Bar heights ───────────────────────────────────────────────────────────────

describe('buildPdfPayload — bar heights', () => {
  it('year5HeightPct is 100', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.year5HeightPct).toBe(100);
  });

  it('year1HeightPct matches projectionHeights.year1', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.year1HeightPct).toBe(18);
  });

  it('year1HeightPct < year5HeightPct', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.year1HeightPct).toBeLessThan(p.year5HeightPct);
  });
});

// ── AI fields (full mode) ─────────────────────────────────────────────────────

describe('buildPdfPayload — AI fields (full mode)', () => {
  it('passes logoUrl from AI research', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.logoUrl).toBe('https://casaroberto.com/logo.png');
  });

  it('hasLogo is true when logoUrl is present', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.hasLogo).toBe(true);
  });

  it('hasLogo is false when logoUrl is null', () => {
    const p = buildPdfPayload({ ...baseInput, logoUrl: null });
    expect(p.hasLogo).toBe(false);
  });

  it('passes businessSummary', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.businessSummary).toBe('Casa Roberto is a casual Mexican restaurant in Austin.');
  });

  it('passes narrativeDistributor', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.narrativeDistributor).toBe('Distributor narrative here.');
  });
});

// ── Conservative mode overrides ───────────────────────────────────────────────

describe('buildPdfPayload — conservative mode', () => {
  const conservativeInput: GeneratePdfInput = { ...baseInput, mode: 'conservative' };

  it('logoUrl is empty string', () => {
    const p = buildPdfPayload(conservativeInput);
    expect(p.logoUrl).toBe('');
  });

  it('hasLogo is false', () => {
    const p = buildPdfPayload(conservativeInput);
    expect(p.hasLogo).toBe(false);
  });

  it('businessSummary is empty string', () => {
    const p = buildPdfPayload(conservativeInput);
    expect(p.businessSummary).toBe('');
  });

  it('savings fields are unchanged in conservative mode', () => {
    const p = buildPdfPayload(conservativeInput);
    expect(p.spendBucket).toBe('$1M–$3M');
    expect(p.dollarEstimateDisplay).toBe('$147,000');
    expect(p.finalPctDisplay).toBe('7.4%');
  });

  it('narratives are unchanged in conservative mode', () => {
    const p = buildPdfPayload(conservativeInput);
    expect(p.narrativeDistributor).toBe('Distributor narrative here.');
    expect(p.narrativeProcurement).toBe('Procurement narrative here.');
    expect(p.narrativeSku).toBe('SKU narrative here.');
  });

  it('conceptBenchmark is unchanged in conservative mode', () => {
    const p = buildPdfPayload(conservativeInput);
    expect(p.conceptBenchmark).toBe('28%–32%');
  });
});

// ── reportDate ────────────────────────────────────────────────────────────────

describe('buildPdfPayload — reportDate', () => {
  it('reportDate is a non-empty string', () => {
    const p = buildPdfPayload(baseInput);
    expect(typeof p.reportDate).toBe('string');
    expect(p.reportDate.length).toBeGreaterThan(0);
  });

  it('reportDate contains a year (4 digits)', () => {
    const p = buildPdfPayload(baseInput);
    expect(p.reportDate).toMatch(/\d{4}/);
  });
});

// ── Payload shape — 27 variables ─────────────────────────────────────────────

describe('buildPdfPayload — payload shape', () => {
  it('result has exactly 27 keys', () => {
    const p = buildPdfPayload(baseInput);
    expect(Object.keys(p)).toHaveLength(27);
  });

  it('does not include raw savings ints (year1–year5 only as display strings)', () => {
    const p = buildPdfPayload(baseInput);
    const json = JSON.stringify(p);
    // The payload should have display strings, not raw integers for year values
    expect(p.year1Display).toContain('$');
    expect(json).not.toContain('"year1":');
  });

  it('AI guardrail — result does not include finalPct or dollarEstimate as raw numbers', () => {
    const p = buildPdfPayload(baseInput);
    expect(p).not.toHaveProperty('finalPct');
    expect(p).not.toHaveProperty('dollarEstimate');
  });
});
