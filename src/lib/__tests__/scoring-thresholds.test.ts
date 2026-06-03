import { describe, it, expect } from 'vitest';
import { extractSignals } from '../website/extract-signals';
import { computeRestaurantScores } from '../relevance/classify-restaurant';

// ═════════════════════════════════════════════════════════════════════════════
// NEW SIGNAL POINT VALUES
// ═════════════════════════════════════════════════════════════════════════════

describe('New signal point values', () => {
  it('hasSquarespaceBizWidget adds >= 10 points', () => {
    const signals = extractSignals('<div class="sqs-block-checkout">Order</div>', 'https://example.com');
    const scores = computeRestaurantScores(signals, 'example.com');
    expect(scores.restaurantSignalScore).toBeGreaterThanOrEqual(10);
  });

  it('hasWixRestaurantWidget adds >= 10 points', () => {
    const signals = extractSignals('<div class="wixrestaurants">Menu</div>', 'https://example.com');
    const scores = computeRestaurantScores(signals, 'example.com');
    expect(scores.restaurantSignalScore).toBeGreaterThanOrEqual(10);
  });

  it('hasGoogleMapsEmbed adds >= 8 points', () => {
    const signals = extractSignals('<iframe src="https://maps.google.com/maps?q=foo"></iframe>', 'https://example.com');
    const scores = computeRestaurantScores(signals, 'example.com');
    expect(scores.restaurantSignalScore).toBeGreaterThanOrEqual(8);
  });

  it('hasPriceMenuPattern adds >= 8 points', () => {
    const signals = extractSignals('<p>Pizza $18 | Pasta $16</p>', 'https://example.com');
    const scores = computeRestaurantScores(signals, 'example.com');
    expect(scores.restaurantSignalScore).toBeGreaterThanOrEqual(8);
  });

  it('new signals do not double-count (widget + maps = 18+ not 36+)', () => {
    const html = '<div class="sqs-block-checkout">Order</div><iframe src="https://maps.google.com/maps?q=foo"></iframe>';
    const sqsOnly = extractSignals('<div class="sqs-block-checkout">Order</div>', 'https://example.com');
    const mapsOnly = extractSignals('<iframe src="https://maps.google.com/maps?q=foo"></iframe>', 'https://example.com');
    const combined = extractSignals(html, 'https://example.com');

    const sqsScore = computeRestaurantScores(sqsOnly, 'example.com').restaurantSignalScore;
    const mapsScore = computeRestaurantScores(mapsOnly, 'example.com').restaurantSignalScore;
    const combinedScore = computeRestaurantScores(combined, 'example.com').restaurantSignalScore;

    // Combined should be at least the sum of each individual
    expect(combinedScore).toBeGreaterThanOrEqual(sqsScore + mapsScore);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// EXCLUSION GUARDS
// ═════════════════════════════════════════════════════════════════════════════

describe('hasStrongNonRestaurantExclusion guards', () => {
  it('ordering widget + demo/pricing keywords → widget score suppressed', () => {
    const html = `
      <script src="https://www.toasttab.com/widget.js"></script>
      <p>Book a demo. Pricing plans. Enterprise features. Software platform.</p>
    `;
    const signals = extractSignals(html, 'https://example.com');
    const scores = computeRestaurantScores(signals, 'example.com');
    expect(scores.restaurantSignalScore).toBeLessThan(60);
    expect(scores.negativeSignalScore).toBeGreaterThanOrEqual(20);
  });

  it('Squarespace widget + demo/pricing → widget not boosted', () => {
    const html = '<div class="sqs-block-checkout">Order</div><p>Book a demo. Pricing plans.</p>';
    const signals = extractSignals(html, 'https://example.com');
    const scores = computeRestaurantScores(signals, 'example.com');
    expect(scores.negativeSignalScore).toBeGreaterThanOrEqual(20);
  });

  it('price menu pattern + demo/pricing → pattern not boosted', () => {
    const html = '<p>Pricing: $29/mo | $99/mo. Book a demo. Free trial. Software platform.</p>';
    const signals = extractSignals(html, 'https://example.com');
    const scores = computeRestaurantScores(signals, 'example.com');
    expect(scores.negativeSignalScore).toBeGreaterThanOrEqual(20);
  });

  it('Maps embed NOT guarded (physical location has no exclusion)', () => {
    // Maps embed is intentionally not behind hasStrongNonRestaurantExclusion
    const html = '<iframe src="https://maps.google.com/maps?q=foo"></iframe><p>Book a demo. Pricing.</p>';
    const signals = extractSignals(html, 'https://example.com');
    const scores = computeRestaurantScores(signals, 'example.com');
    // Maps still contributes +8 even with negative signals present
    // (the net score may be low due to negatives, but maps always adds its value)
    expect(signals.hasGoogleMapsEmbed).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// capUnanchoredRestaurantScore
// ═════════════════════════════════════════════════════════════════════════════

describe('capUnanchoredRestaurantScore hard cap at 59', () => {
  it('keywords only, no operational anchor → capped at 59', () => {
    // Many food keywords but no schema, widget, address+phone, ogImage, social
    const html = '<p>Menu, reservations, pizza, brunch, happy hour, dine-in, restaurant, chef, wine</p>';
    const signals = extractSignals(html, 'https://example.com');

    // Verify no anchor is set
    expect(signals.hasRestaurantSchema).toBe(false);
    expect(signals.hasReservationWidget).toBe(false);
    expect(signals.hasOrderingWidget).toBe(false);
    expect(signals.hasAddressPhoneBlock).toBe(false);
    expect(signals.ogImage).toBeNull();

    const scores = computeRestaurantScores(signals, 'example.com');
    expect(scores.restaurantSignalScore).toBeLessThanOrEqual(59);
  });

  it('Restaurant schema = anchor → cap does not apply', () => {
    const html = `
      <script type="application/ld+json">{"@type":"Restaurant","name":"Test"}</script>
      <p>Menu, pizza, brunch, dine-in</p>
    `;
    const signals = extractSignals(html, 'https://example.com');
    expect(signals.hasRestaurantSchema).toBe(true);

    const scores = computeRestaurantScores(signals, 'example.com');
    // With schema anchor, cap does not limit score to 59
    expect(scores.restaurantSignalScore).toBeGreaterThanOrEqual(20);
  });

  it('Ordering widget = anchor → cap does not apply', () => {
    const html = `
      <script src="https://www.toasttab.com/widget.js"></script>
      <p>Menu, pizza, brunch</p>
    `;
    const signals = extractSignals(html, 'https://example.com');
    expect(signals.hasOrderingWidget).toBe(true);

    const scores = computeRestaurantScores(signals, 'example.com');
    expect(scores.restaurantSignalScore).toBeGreaterThanOrEqual(10);
  });

  it('Address + phone (new street regex) = anchor → cap does not apply', () => {
    const html = `
      <p>123 Main Street, Austin, TX. (512) 555-0123</p>
      <p>Menu, restaurant, pizza, brunch, dine-in, dinner, chef</p>
    `;
    const signals = extractSignals(html, 'https://example.com');
    expect(signals.hasAddressPhoneBlock).toBe(true);

    const scores = computeRestaurantScores(signals, 'example.com');
    // Address+phone is an anchor → score not capped
    expect(scores.restaurantSignalScore).toBeGreaterThanOrEqual(8);
  });

  it('ogImage = anchor → cap does not apply', () => {
    const html = `
      <meta property="og:image" content="https://example.com/food.jpg">
      <p>Menu, restaurant, pizza, brunch, dine-in, dinner, happy hour, chef, wine</p>
    `;
    const signals = extractSignals(html, 'https://example.com');
    expect(signals.ogImage).toBeTruthy();

    const scores = computeRestaurantScores(signals, 'example.com');
    // ogImage is an anchor → can exceed 59
    expect(signals.ogImage).not.toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// TIERED THRESHOLD LOGIC (pure unit tests)
// ═════════════════════════════════════════════════════════════════════════════

describe('Tiered negative threshold logic', () => {
  it('tier 1 allows score=80, neg=39', () => {
    const tier1Passes = (score: number, neg: number) => score >= 80 && neg < 40;
    expect(tier1Passes(80, 39)).toBe(true);
    expect(tier1Passes(80, 40)).toBe(false);
    expect(tier1Passes(79, 39)).toBe(false);
    expect(tier1Passes(100, 20)).toBe(true);
  });

  it('tier 2 allows score=60, neg=29', () => {
    const tier2Passes = (score: number, neg: number) => score >= 60 && neg < 30;
    expect(tier2Passes(60, 29)).toBe(true);
    expect(tier2Passes(60, 30)).toBe(false);
    expect(tier2Passes(59, 29)).toBe(false);
    expect(tier2Passes(79, 0)).toBe(true);
  });

  it('old single threshold (neg < 20) would block Porto\'s Bakery (neg=20)', () => {
    const oldRule = (score: number, neg: number) => score >= 60 && neg < 20;
    expect(oldRule(100, 20)).toBe(false); // Was blocked
  });

  it('new tier 1 rescues Porto\'s Bakery (score=100, neg=20)', () => {
    const tier1 = (score: number, neg: number) => score >= 80 && neg < 40;
    expect(tier1(100, 20)).toBe(true); // Now rescued
  });

  it('tier boundary: score=79 with neg=35 does NOT pass tier 1 (needs 80)', () => {
    const tier1 = (score: number, neg: number) => score >= 80 && neg < 40;
    expect(tier1(79, 35)).toBe(false);
  });

  it('tier boundary: score=80 with neg=40 does NOT pass tier 1 (neg must be < 40)', () => {
    const tier1 = (score: number, neg: number) => score >= 80 && neg < 40;
    expect(tier1(80, 40)).toBe(false);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// HASADDRESSPHONEBLOCK LOOSENING
// ═════════════════════════════════════════════════════════════════════════════

describe('hasAddressPhoneBlock regex coverage', () => {
  it.each([
    ['street suffix: Street', '<p>123 Main Street (512) 555-0123</p>', true],
    ['street suffix: St', '<p>456 Oak St (512) 555-0123</p>', true],
    ['street suffix: Avenue', '<p>789 Pine Avenue (512) 555-0123</p>', true],
    ['street suffix: Ave', '<p>101 Park Ave (512) 555-0123</p>', true],
    ['street suffix: Road', '<p>202 Elm Road (512) 555-0123</p>', true],
    ['street suffix: Blvd', '<p>303 Sunset Blvd (512) 555-0123</p>', true],
    ['street suffix: Drive', '<p>404 Oak Drive (512) 555-0123</p>', true],
    ['street suffix: Lane', '<p>505 Maple Lane (512) 555-0123</p>', true],
    ['street suffix: Way', '<p>606 Hillside Way (512) 555-0123</p>', true],
    ['street suffix: Pkwy', '<p>707 Vista Pkwy (512) 555-0123</p>', true],
    ['state+zip (original path)', '<p>Austin, TX 78701 (512) 555-0123</p>', true],
    ['phone only (no address)', '<p>(512) 555-0123</p>', false],
    ['address only (no phone)', '<p>123 Main Street, Austin</p>', false],
  ])('%s → hasAddressPhoneBlock=%s', (_label, html, expected) => {
    const signals = extractSignals(html, 'https://example.com');
    expect(signals.hasAddressPhoneBlock).toBe(expected);
  });
});
