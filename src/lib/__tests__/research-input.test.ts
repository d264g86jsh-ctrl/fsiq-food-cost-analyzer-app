import { describe, it, expect } from 'vitest';
import { buildResearchInput } from '../ai/research-input';
import type { FormContext } from '../ai/ai-types';
import type { ValidationResult } from '../website/types';
import type { QualifyLeadResult } from '../qualification/qualify-lead';

// ── Test fixtures ─────────────────────────────────────────────────────────────

const baseForm: FormContext = {
  restaurantName: 'Casa Roberto',
  website: 'https://casaroberto.com',
  conceptType: 'Casual dining',
  locations: '2 – 4 locations',
  annualFoodSpend: '$1M–$3M',
  distributorType: 'National broadliners (Sysco, US Foods)',
  procurementStrategy: 'Market price, single distributor',
  topSkus: 'beef, chicken, tortillas',
};

const baseValidation: ValidationResult = {
  restaurantSignalScore: 72,
  negativeSignalScore: 10,
  nationalChainScore: 0,
  websiteRelationshipScore: 80,
  googlePlacesScore: 0,
  locationConfidenceScore: 85,
  countryEligibility: 'us_verified',
  locationReasons: ['state_selection_us_confirmed'],
  headlessBrowserUsed: false,
  googlePlacesQueried: false,
  claudeAiUsed: false,
  websiteReachabilityStatus: 'reachable',
  finalDecision: 'verified_restaurant',
  normalizedUrl: 'https://casaroberto.com',
  finalUrl: 'https://casaroberto.com/',
  httpStatus: 200,
  reasons: ['verified_restaurant'],
  userFacingMessage: null,
  internalFlags: ['us_state_selected'],
  manualReviewRequired: false,
  websiteLogoHints: ['https://casaroberto.com/logo.png', 'https://casaroberto.com/images/logo.svg'],
  logoUrl: 'https://casaroberto.com/logo.png',
};

const baseQualification: QualifyLeadResult = {
  qualified: true,
  dqReason: null,
  spendParse: { annualSpend: 2_000_000, parseFallback: false, rawInput: '$1M–$3M', parseNotes: ['range_midpoint'] },
  annualSpend: 2_000_000,
  spendBucket: '$1M–$3M',
  bucketMidpoint: 2_000_000,
  basePct: 5.5,
  distributorMod: 0.7,
  procurementMod: 0.7,
  skuMod: 0.3,
  locationsMod: 0.15,
  rawTotal: 7.35,
  finalPct: 7.35,
  finalPctDisplay: '7.35%',
  dollarEstimate: 147_000,
  dollarEstimateDisplay: '$147,000',
  year1: 147_000,
  year2: 299_733,
  year3: 458_442,
  year4: 623_461,
  year5: 795_056,
  projectionHeights: { year1: 18, year2: 38, year3: 58, year4: 78, year5: 100 },
  caseStudy: "MaryAnn's Diner",
  locationCategory: '2-4',
  reasons: ['qualified'],
  internalFlags: ['us_state_selected'],
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('buildResearchInput — shape', () => {
  it('includes restaurantName', () => {
    const r = buildResearchInput(baseForm, baseValidation, baseQualification);
    expect(r.restaurantName).toBe('Casa Roberto');
  });

  it('includes topSkus (free text)', () => {
    const r = buildResearchInput(baseForm, baseValidation, baseQualification);
    expect(r.topSkus).toBe('beef, chicken, tortillas');
  });

  it('trims topSkus whitespace', () => {
    const form = { ...baseForm, topSkus: '  beef, chicken  ' };
    const r = buildResearchInput(form, baseValidation, baseQualification);
    expect(r.topSkus).toBe('beef, chicken');
  });

  it('preserves empty topSkus as empty string', () => {
    const form = { ...baseForm, topSkus: '' };
    const r = buildResearchInput(form, baseValidation, baseQualification);
    expect(r.topSkus).toBe('');
  });

  it('includes websiteLogoHints verbatim from Phase 2', () => {
    const r = buildResearchInput(baseForm, baseValidation, baseQualification);
    expect(r.websiteLogoHints).toEqual([
      'https://casaroberto.com/logo.png',
      'https://casaroberto.com/images/logo.svg',
    ]);
  });

  it('passes logoUrl from Phase 2 validation result', () => {
    const r = buildResearchInput(baseForm, baseValidation, baseQualification);
    expect(r.logoUrl).toBe('https://casaroberto.com/logo.png');
  });

  it('passes null logoUrl when validation has no logo', () => {
    const r = buildResearchInput(baseForm, { ...baseValidation, logoUrl: null }, baseQualification);
    expect(r.logoUrl).toBeNull();
  });

  it('includes restaurantSignalScore from Phase 2', () => {
    const r = buildResearchInput(baseForm, baseValidation, baseQualification);
    expect(r.restaurantSignalScore).toBe(72);
  });

  it('includes finalDecision and countryEligibility from Phase 2', () => {
    const r = buildResearchInput(baseForm, baseValidation, baseQualification);
    expect(r.finalDecision).toBe('verified_restaurant');
    expect(r.countryEligibility).toBe('us_verified');
  });

  it('includes normalizedUrl and finalUrl from Phase 2', () => {
    const r = buildResearchInput(baseForm, baseValidation, baseQualification);
    expect(r.normalizedUrl).toBe('https://casaroberto.com');
    expect(r.finalUrl).toBe('https://casaroberto.com/');
  });

  it('does NOT include raw HTML or scraped page text', () => {
    const r = buildResearchInput(baseForm, baseValidation, baseQualification);
    const json = JSON.stringify(r);
    // Ensure no HTML tag content or typical scraped text properties exist
    expect(json).not.toContain('<html');
    expect(json).not.toContain('pageText');
    expect(json).not.toContain('rawHtml');
    expect(json).not.toContain('scrapedText');
  });
});

describe('buildResearchInput — deterministic savings context', () => {
  it('includes dollarEstimate as read-only context', () => {
    const r = buildResearchInput(baseForm, baseValidation, baseQualification);
    expect(r.dollarEstimate).toBe(147_000);
  });

  it('includes finalPct as read-only context', () => {
    const r = buildResearchInput(baseForm, baseValidation, baseQualification);
    expect(r.finalPct).toBe(7.35);
  });

  it('includes spendBucket as read-only context', () => {
    const r = buildResearchInput(baseForm, baseValidation, baseQualification);
    expect(r.spendBucket).toBe('$1M–$3M');
  });

  it('includes qualified status', () => {
    const r = buildResearchInput(baseForm, baseValidation, baseQualification);
    expect(r.qualified).toBe(true);
  });

  it('includes year1 and year5 projections', () => {
    const r = buildResearchInput(baseForm, baseValidation, baseQualification);
    expect(r.year1).toBe(147_000);
    expect(r.year5).toBe(795_056);
  });

  it('passes null savings fields for DQ leads', () => {
    const dqQual: QualifyLeadResult = {
      ...baseQualification,
      qualified: false,
      dqReason: 'below_threshold',
      spendBucket: null,
      bucketMidpoint: null,
      dollarEstimate: null,
      finalPct: null,
      year1: null,
      year5: null,
      caseStudy: null,
    } as unknown as QualifyLeadResult;
    const r = buildResearchInput(baseForm, baseValidation, dqQual);
    expect(r.qualified).toBe(false);
    expect(r.dollarEstimate).toBeNull();
    expect(r.finalPct).toBeNull();
    expect(r.spendBucket).toBeNull();
  });
});

describe('buildResearchInput — scrapeStatus', () => {
  it('returns "phase2_signals" when restaurantSignalScore > 0', () => {
    const r = buildResearchInput(baseForm, { ...baseValidation, restaurantSignalScore: 30, websiteLogoHints: [], websiteReachabilityStatus: 'blocked' }, baseQualification);
    expect(r.scrapeStatus).toBe('phase2_signals');
  });

  it('returns "phase2_signals" when websiteLogoHints is non-empty', () => {
    const r = buildResearchInput(baseForm, { ...baseValidation, restaurantSignalScore: 0, websiteLogoHints: ['https://x.com/logo.png'], websiteReachabilityStatus: 'blocked' }, baseQualification);
    expect(r.scrapeStatus).toBe('phase2_signals');
  });

  it('returns "phase2_signals" when websiteReachabilityStatus is "reachable"', () => {
    const r = buildResearchInput(baseForm, { ...baseValidation, restaurantSignalScore: 0, websiteLogoHints: [], websiteReachabilityStatus: 'reachable' }, baseQualification);
    expect(r.scrapeStatus).toBe('phase2_signals');
  });

  it('returns "unavailable" when no Phase 2 signals exist', () => {
    const noSignals: ValidationResult = {
      ...baseValidation,
      restaurantSignalScore: 0,
      websiteLogoHints: [],
      websiteReachabilityStatus: 'invalid',
    };
    const r = buildResearchInput(baseForm, noSignals, baseQualification);
    expect(r.scrapeStatus).toBe('unavailable');
  });
});
