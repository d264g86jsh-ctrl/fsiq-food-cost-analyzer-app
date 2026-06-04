import { describe, it, expect } from 'vitest';
import { computeValidationConfidence, buildConfidenceAwareMessage } from '../website/confidence-score';
import { hasRestaurantKeywordInDomain } from '../relevance/classify-restaurant';

// ── Domain keyword detection ──────────────────────────────────────────────────

describe('hasRestaurantKeywordInDomain', () => {
  it('detects "restaurant" in domain: centurionrestaurantgroup.com', () => {
    expect(hasRestaurantKeywordInDomain('centurionrestaurantgroup.com')).toBe(true);
  });

  it('detects with www prefix', () => {
    expect(hasRestaurantKeywordInDomain('www.downtownbistro.com')).toBe(true);
  });

  it('detects with https:// prefix', () => {
    expect(hasRestaurantKeywordInDomain('https://casagrill.com')).toBe(true);
  });

  it('detects "cafe"', () => {
    expect(hasRestaurantKeywordInDomain('thecafe.com')).toBe(true);
  });

  it('detects "bistro"', () => {
    expect(hasRestaurantKeywordInDomain('citybistro.com')).toBe(true);
  });

  it('detects "pizzeria"', () => {
    expect(hasRestaurantKeywordInDomain('mypizzeria.com')).toBe(true);
  });

  it('detects "kitchen"', () => {
    expect(hasRestaurantKeywordInDomain('thekitchen.com')).toBe(true);
  });

  it('ignores non-restaurant domain', () => {
    expect(hasRestaurantKeywordInDomain('example.com')).toBe(false);
  });

  it('ignores keyword in TLD (not in label)', () => {
    // "dining" in the path, not the label — only first label is checked
    expect(hasRestaurantKeywordInDomain('example.com/dining')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(hasRestaurantKeywordInDomain('BIGRESTAURANT.COM')).toBe(true);
  });

  it('returns false for empty string', () => {
    expect(hasRestaurantKeywordInDomain('')).toBe(false);
  });
});

// ── Confidence scoring ────────────────────────────────────────────────────────

describe('computeValidationConfidence', () => {
  it('returns score 0 for HTTP 404 (hard gate)', () => {
    const conf = computeValidationConfidence({
      httpStatus: 404,
      logoHints: ['logo.png'],  // even with signals, 404 gates to 0
      restaurantSignalScore: 80,
      negativeSignalScore: 0,
      hasRestaurantInDomain: true,
    });
    expect(conf.score).toBe(0);
    expect(conf.reasoning).toBe('website_404');
    expect(conf.hasLogoHint).toBe(false);
  });

  it('httpStatus 0 (network error) gets no website_exists bonus but may get low_neg bonus', () => {
    const conf = computeValidationConfidence({
      httpStatus: 0,
      logoHints: [],
      restaurantSignalScore: 0,
      negativeSignalScore: 0,
      hasRestaurantInDomain: false,
    });
    // No website_exists (+20) since status=0, but low_negative_signals (+10) still fires
    expect(conf.score).toBe(10);
    expect(conf.reasoning).not.toContain('website_exists');
    expect(conf.reasoning).toContain('low_negative_signals');
  });

  it('maximum score (100) with all signals present', () => {
    const conf = computeValidationConfidence({
      httpStatus: 200,
      logoHints: ['logo.png'],
      restaurantSignalScore: 75,
      negativeSignalScore: 10,
      hasRestaurantInDomain: true,
    });
    expect(conf.score).toBe(100); // 20+40+30+20+10 = 120 → capped
    expect(conf.reasoning).toContain('website_exists');
    expect(conf.reasoning).toContain('logo_found');
    expect(conf.reasoning).toContain('restaurant_in_domain');
    expect(conf.reasoning).toContain('restaurant_signals');
    expect(conf.reasoning).toContain('low_negative_signals');
  });

  it('high confidence: centurionrestaurantgroup.com with logo + signals', () => {
    const conf = computeValidationConfidence({
      httpStatus: 200,
      logoHints: ['https://centurion.com/logo.png'],
      restaurantSignalScore: 45,
      negativeSignalScore: 20,
      hasRestaurantInDomain: true,
    });
    expect(conf.score).toBeGreaterThanOrEqual(90);
    expect(conf.hasLogoHint).toBe(true);
    expect(conf.hasRestaurantSignals).toBe(true);
    expect(conf.hasNegativeSignals).toBe(false);
  });

  it('medium confidence: website exists + domain keyword, no logo', () => {
    const conf = computeValidationConfidence({
      httpStatus: 200,
      logoHints: [],
      restaurantSignalScore: 0,
      negativeSignalScore: 10,
      hasRestaurantInDomain: true,
    });
    // 20 (exists) + 30 (domain) + 10 (low neg) = 60
    expect(conf.score).toBe(60);
    expect(conf.score).toBeGreaterThanOrEqual(50); // encourages continuing
  });

  it('low confidence: generic domain, no logo, minimal signals', () => {
    const conf = computeValidationConfidence({
      httpStatus: 200,
      logoHints: [],
      restaurantSignalScore: 10,
      negativeSignalScore: 50,
      hasRestaurantInDomain: false,
    });
    // 20 (exists) only — signals too weak, neg too high
    expect(conf.score).toBe(20);
    expect(conf.score).toBeLessThan(50);
  });

  it('403 blocked site counts as existing (+20)', () => {
    const conf = computeValidationConfidence({
      httpStatus: 403,
      logoHints: [],
      restaurantSignalScore: 0,
      negativeSignalScore: 0,
      hasRestaurantInDomain: false,
    });
    expect(conf.score).toBeGreaterThanOrEqual(20);
    expect(conf.reasoning).toContain('website_exists');
  });
});

// ── Confidence-aware messaging ────────────────────────────────────────────────

describe('buildConfidenceAwareMessage', () => {
  const highConf = {
    score: 85,
    hasLogoHint: true,
    hasRestaurantSignals: true,
    hasNegativeSignals: false,
    reasoning: 'website_exists,logo_found,restaurant_in_domain',
  };

  const lowConf = {
    score: 20,
    hasLogoHint: false,
    hasRestaurantSignals: false,
    hasNegativeSignals: true,
    reasoning: 'website_exists',
  };

  it('verified_restaurant → null (UI handles green checkmark)', () => {
    expect(buildConfidenceAwareMessage('verified_restaurant', highConf)).toBeNull();
  });

  it('plausible_unverified + high confidence → encouraging message', () => {
    const msg = buildConfidenceAwareMessage('plausible_unverified', highConf);
    expect(msg).toContain("We're still working on verifying");
    expect(msg).not.toContain('Our team may follow up');
  });

  it('plausible_unverified + low confidence → cautious message', () => {
    const msg = buildConfidenceAwareMessage('plausible_unverified', lowConf);
    expect(msg).toContain('Our team may follow up');
  });

  it('plausible_unverified at exactly score 50 → encouraging (boundary)', () => {
    const boundary = { ...lowConf, score: 50 };
    const msg = buildConfidenceAwareMessage('plausible_unverified', boundary);
    expect(msg).toContain("We're still working on verifying");
  });

  it('plausible_unverified at score 49 → cautious (boundary)', () => {
    const boundary = { ...lowConf, score: 49 };
    const msg = buildConfidenceAwareMessage('plausible_unverified', boundary);
    expect(msg).toContain('Our team may follow up');
  });

  it('national_chain → independent operators message', () => {
    const msg = buildConfidenceAwareMessage('national_chain', lowConf);
    expect(msg).toContain('independent operators');
  });

  it('invalid_website → URL check message', () => {
    const msg = buildConfidenceAwareMessage('invalid_website', lowConf);
    expect(msg).toContain("couldn't reach");
  });

  it('clear_non_fit → non-fit message', () => {
    const msg = buildConfidenceAwareMessage('clear_non_fit', lowConf);
    expect(msg).toContain("doesn't appear to match");
  });
});
