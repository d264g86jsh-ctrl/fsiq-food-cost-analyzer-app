import { describe, it, expect } from 'vitest';
import { buildFallbackResearch, buildFallbackNarrative } from '../ai/fallback-narrative';
import type { AiResearchInput } from '../ai/ai-types';

// ── Fixture ───────────────────────────────────────────────────────────────────

const baseInput: AiResearchInput = {
  restaurantName: 'Casa Roberto',
  website: 'https://casaroberto.com',
  state: 'TX',
  conceptType: 'Casual dining',
  locations: '2 – 4 locations',
  annualFoodSpend: '$1M–$3M',
  distributorType: 'National broadliners (Sysco, US Foods)',
  procurementStrategy: 'Market price, single distributor',
  topSkus: 'beef, chicken, tortillas',
  normalizedUrl: 'https://casaroberto.com',
  finalUrl: 'https://casaroberto.com/',
  finalDecision: 'verified_restaurant',
  countryEligibility: 'us_verified',
  websiteReachabilityStatus: 'reachable',
  restaurantSignalScore: 72,
  websiteLogoHints: [],
  scrapeStatus: 'phase2_signals',
  qualified: true,
  spendBucket: '$1M–$3M',
  dollarEstimate: 147_000,
  finalPct: 7.35,
  year1: 147_000,
  year5: 795_056,
  caseStudy: "MaryAnn's Diner",
};

// ── buildFallbackResearch ─────────────────────────────────────────────────────

describe('buildFallbackResearch', () => {
  it('businessSummary contains restaurantName', () => {
    const r = buildFallbackResearch(baseInput);
    expect(r.businessSummary).toContain('Casa Roberto');
  });

  it('businessSummary contains conceptType (lowercased)', () => {
    const r = buildFallbackResearch(baseInput);
    expect(r.businessSummary.toLowerCase()).toContain('casual dining');
  });

  it('labels "Single location" as single-location', () => {
    const r = buildFallbackResearch({ ...baseInput, locations: 'Single location' });
    expect(r.businessSummary).toContain('single-location');
  });

  it('labels "5+ locations" as multi-unit', () => {
    const r = buildFallbackResearch({ ...baseInput, locations: '5+ locations' });
    expect(r.businessSummary).toContain('multi-unit');
  });

  it('labels "2 – 4 locations" as multi-location', () => {
    const r = buildFallbackResearch({ ...baseInput, locations: '2 – 4 locations' });
    expect(r.businessSummary).toContain('multi-location');
  });

  it('logoUrl is always null', () => {
    const r = buildFallbackResearch(baseInput);
    expect(r.logoUrl).toBeNull();
  });

  it('scrapeStatus passes through from input', () => {
    const r = buildFallbackResearch({ ...baseInput, scrapeStatus: 'unavailable' });
    expect(r.scrapeStatus).toBe('unavailable');
  });

  it('is deterministic (same input produces same output)', () => {
    const r1 = buildFallbackResearch(baseInput);
    const r2 = buildFallbackResearch(baseInput);
    expect(r1).toEqual(r2);
  });

  it('conceptSignals includes conceptType and locationLabel', () => {
    const r = buildFallbackResearch(baseInput);
    expect(r.conceptSignals).toContain('casual dining');
    expect(r.conceptSignals).toContain('multi-location');
  });
});

// ── buildFallbackNarrative ────────────────────────────────────────────────────

describe('buildFallbackNarrative', () => {
  it('narrativeDistributor references distributorType', () => {
    const r = buildFallbackNarrative(baseInput);
    expect(r.narrativeDistributor.toLowerCase()).toContain('national broadliners');
  });

  it('narrativeProcurement references procurementStrategy', () => {
    const r = buildFallbackNarrative(baseInput);
    expect(r.narrativeProcurement.toLowerCase()).toContain('market price');
  });

  it('narrativeSku references topSkus when provided', () => {
    const r = buildFallbackNarrative(baseInput);
    expect(r.narrativeSku).toContain('beef, chicken, tortillas');
  });

  it('narrativeSku uses generic copy when topSkus is empty', () => {
    const r = buildFallbackNarrative({ ...baseInput, topSkus: '' });
    expect(r.narrativeSku).not.toContain('beef');
    expect(r.narrativeSku.length).toBeGreaterThan(20);
  });

  it('narrativeSku uses generic copy when topSkus is whitespace only', () => {
    const r = buildFallbackNarrative({ ...baseInput, topSkus: '   ' });
    expect(r.narrativeSku).not.toContain('   ');
    expect(r.narrativeSku.length).toBeGreaterThan(20);
  });

  it('is deterministic (same input produces same output)', () => {
    const r1 = buildFallbackNarrative(baseInput);
    const r2 = buildFallbackNarrative(baseInput);
    expect(r1).toEqual(r2);
  });

  it('no em-dashes in narrativeDistributor', () => {
    const r = buildFallbackNarrative(baseInput);
    expect(r.narrativeDistributor).not.toMatch(/[–—]/);
  });

  it('no em-dashes in narrativeProcurement', () => {
    const r = buildFallbackNarrative(baseInput);
    expect(r.narrativeProcurement).not.toMatch(/[–—]/);
  });

  it('no em-dashes in narrativeSku', () => {
    const r = buildFallbackNarrative(baseInput);
    expect(r.narrativeSku).not.toMatch(/[–—]/);
  });

  it('all narratives are non-empty strings', () => {
    const r = buildFallbackNarrative(baseInput);
    expect(r.narrativeDistributor.length).toBeGreaterThan(0);
    expect(r.narrativeProcurement.length).toBeGreaterThan(0);
    expect(r.narrativeSku.length).toBeGreaterThan(0);
  });
});
