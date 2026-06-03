import { describe, it, expect } from 'vitest';
import { extractSignals } from '../website/extract-signals';
import { computeRestaurantScores } from '../relevance/classify-restaurant';

// ═════════════════════════════════════════════════════════════════════════════
// SQUARESPACE WIDGETS
// ═════════════════════════════════════════════════════════════════════════════

describe('Squarespace CMS widget detection', () => {
  it.each([
    ['sqs-block-checkout class', '<div class="sqs-block-checkout">Checkout</div>', true],
    ['sqs-block-menu class', '<div class="sqs-block-menu">Menu</div>', true],
    ['data-block-type commerce', '<div data-block-type="commerce-checkout">Order</div>', true],
    ['data-block-type menu', '<div data-block-type="menu-section">Menu</div>', true],
    ['unrelated Squarespace class', '<div class="sqs-layout">Layout</div>', false],
    ['no Squarespace class', '<div class="my-widget">Other</div>', false],
  ])('%s → hasSquarespaceBizWidget=%s', (_label, html, expected) => {
    const signals = extractSignals(html, 'https://example.com');
    expect(signals.hasSquarespaceBizWidget).toBe(expected);
  });

  it('Squarespace widget scores +10 in restaurant scoring', () => {
    const signals = extractSignals('<div class="sqs-block-checkout">Order</div>', 'https://example.com');
    const scores = computeRestaurantScores(signals, 'example.com');
    expect(scores.restaurantSignalScore).toBeGreaterThanOrEqual(10);
  });

  it('Squarespace widget guarded by hasStrongNonRestaurantExclusion', () => {
    const html = '<div class="sqs-block-checkout">Order</div><p>Book a demo. Pricing plans. SaaS platform.</p>';
    const signals = extractSignals(html, 'https://example.com');
    const scores = computeRestaurantScores(signals, 'example.com');
    // Widget present but strong non-restaurant signals suppress the boost
    expect(scores.negativeSignalScore).toBeGreaterThanOrEqual(20);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// WIX WIDGETS
// ═════════════════════════════════════════════════════════════════════════════

describe('Wix restaurant widget detection', () => {
  it.each([
    ['wixrestaurants class', '<div class="wixrestaurants">Restaurant</div>', true],
    ['wix-restaurant class', '<div class="wix-restaurant">Restaurant</div>', true],
    ['wix-menus class', '<div class="wix-menus">Menus</div>', true],
    ['UPPERCASE (htmlLower applied)', '<div class="WIX-MENUS">Menus</div>', true],
    ['unrelated wix class', '<div class="wix-something">Other</div>', false],
  ])('%s → hasWixRestaurantWidget=%s', (_label, html, expected) => {
    const signals = extractSignals(html, 'https://example.com');
    expect(signals.hasWixRestaurantWidget).toBe(expected);
  });

  it('Wix widget scores +10 in restaurant scoring', () => {
    const signals = extractSignals('<div class="wixrestaurants">Restaurant</div>', 'https://example.com');
    const scores = computeRestaurantScores(signals, 'example.com');
    expect(scores.restaurantSignalScore).toBeGreaterThanOrEqual(10);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GOOGLE MAPS EMBED
// ═════════════════════════════════════════════════════════════════════════════

describe('Google Maps embed detection', () => {
  it.each([
    ['maps.google.com iframe', '<iframe src="https://maps.google.com/maps?q=foo"></iframe>', true],
    ['maps.googleapis.com', '<iframe src="https://maps.googleapis.com/maps/embed?pb=1"></iframe>', true],
    ['google.com/maps/embed', '<iframe src="https://google.com/maps/embed?pb=2"></iframe>', true],
    ['openstreetmap.org', '<iframe src="https://openstreetmap.org/#map=15/0/0"></iframe>', true],
    ['maps.google.com in img src', '<img src="https://maps.google.com/staticmap?..."/>', true],
    ['maps.google.com in data-src', '<div data-src="https://maps.google.com/..."></div>', true],
    ['no map reference', '<iframe src="https://youtube.com/embed/abc"></iframe>', false],
  ])('%s → hasGoogleMapsEmbed=%s', (_label, html, expected) => {
    const signals = extractSignals(html, 'https://example.com');
    expect(signals.hasGoogleMapsEmbed).toBe(expected);
  });

  it('Maps embed scores +8 in restaurant scoring', () => {
    const signals = extractSignals('<iframe src="https://maps.google.com/maps?q=foo"></iframe>', 'https://example.com');
    const scores = computeRestaurantScores(signals, 'example.com');
    expect(scores.restaurantSignalScore).toBeGreaterThanOrEqual(8);
  });

  it('Maps embed not guarded by hasStrongNonRestaurantExclusion (physical location signal)', () => {
    // Maps embed scores regardless of other content (no exclusion guard)
    const html = '<iframe src="https://maps.google.com/maps?q=foo"></iframe>';
    const signals = extractSignals(html, 'https://example.com');
    const scores = computeRestaurantScores(signals, 'example.com');
    expect(scores.restaurantSignalScore).toBeGreaterThanOrEqual(8);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PRICE MENU PATTERN
// ═════════════════════════════════════════════════════════════════════════════

describe('Price + food keyword proximity detection', () => {
  it('2+ price-food pairs → hasPriceMenuPattern=true', () => {
    const html = '<p>Margherita Pizza $18 | Pepperoni Pizza $16 | Vegetarian Pasta $14</p>';
    const signals = extractSignals(html, 'https://example.com');
    expect(signals.hasPriceMenuPattern).toBe(true);
  });

  it('single price-food pair → hasPriceMenuPattern=false', () => {
    const signals = extractSignals('<p>Our famous pasta for $25</p>', 'https://example.com');
    expect(signals.hasPriceMenuPattern).toBe(false);
  });

  it('no prices at all → hasPriceMenuPattern=false', () => {
    const signals = extractSignals('<p>Pizza and pasta available daily</p>', 'https://example.com');
    expect(signals.hasPriceMenuPattern).toBe(false);
  });

  it.each([
    ['pizza + prices', '<p>Margherita Pizza $18 | Caesar Salad $12</p>'],
    ['pasta + prices', '<p>Handmade Pasta $16 | Risotto $18</p>'],
    ['burger + prices', '<p>Classic Burger $14 | Double Burger $18</p>'],
    ['sushi + prices', '<p>Sushi platter $18 | Sushi rolls $12 available daily</p>'],
    ['wine + prices', '<p>House Wine $8/glass | Cocktails $12</p>'],
    ['brunch + prices', '<p>Brunch plate $18. Weekend brunch eggs $14.</p>'],
  ])('%s → hasPriceMenuPattern=true', (_label, html) => {
    const signals = extractSignals(html, 'https://example.com');
    expect(signals.hasPriceMenuPattern).toBe(true);
  });

  it('price outside 200-char food keyword window → no match', () => {
    // Food keyword far from the prices (> 200 chars away)
    const html = `<p>We serve lunch and dinner.</p>${'x '.repeat(200)}<p>Item A $18 and Item B $22.</p>`;
    const signals = extractSignals(html, 'https://example.com');
    expect(signals.hasPriceMenuPattern).toBe(false);
  });

  it('price menu pattern scores +8', () => {
    const html = '<p>Tacos $12 | Burritos $14 | Quesadillas $10</p>';
    const signals = extractSignals(html, 'https://example.com');
    const scores = computeRestaurantScores(signals, 'example.com');
    expect(scores.restaurantSignalScore).toBeGreaterThanOrEqual(8);
  });

  it('price pattern suppressed by strong non-restaurant exclusion', () => {
    const html = '<p>Pricing: Basic $29 | Pro $99. Book a demo. SaaS platform. Pricing plans.</p>';
    const signals = extractSignals(html, 'https://example.com');
    const scores = computeRestaurantScores(signals, 'example.com');
    // Guard fires: 'book a demo' + 'pricing plans' → hasStrongNonRestaurantExclusion
    expect(scores.negativeSignalScore).toBeGreaterThanOrEqual(20);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// COMBINED NEW SIGNALS
// ═════════════════════════════════════════════════════════════════════════════

describe('Combined new signals', () => {
  it('Squarespace + price menu → both detected', () => {
    const html = '<div class="sqs-block-menu">Menu</div><p>Pizza $18 | Pasta $16</p>';
    const signals = extractSignals(html, 'https://example.com');
    expect(signals.hasSquarespaceBizWidget).toBe(true);
    expect(signals.hasPriceMenuPattern).toBe(true);
  });

  it('Maps + price menu → both detected', () => {
    const html = '<iframe src="https://maps.google.com/maps?q=foo"></iframe><p>Fish Tacos $12 | Shrimp $14</p>';
    const signals = extractSignals(html, 'https://example.com');
    expect(signals.hasGoogleMapsEmbed).toBe(true);
    expect(signals.hasPriceMenuPattern).toBe(true);
  });

  it('Wix + maps → both detected', () => {
    const html = '<div class="wixrestaurants">Menu</div><iframe src="https://maps.google.com/maps?q=test"></iframe>';
    const signals = extractSignals(html, 'https://example.com');
    expect(signals.hasWixRestaurantWidget).toBe(true);
    expect(signals.hasGoogleMapsEmbed).toBe(true);
  });

  it('all four new signals stack correctly in scoring', () => {
    const html = `
      <div class="sqs-block-checkout">Order</div>
      <div class="wixrestaurants">Menu</div>
      <iframe src="https://maps.google.com/maps?q=foo"></iframe>
      <p>Pizza $18 | Pasta $16 | Burger $14</p>
    `;
    const signals = extractSignals(html, 'https://example.com');
    const scores = computeRestaurantScores(signals, 'example.com');
    // 10 (sqs) + 10 (wix) + 8 (maps) + 8 (price) = 36 minimum
    expect(scores.restaurantSignalScore).toBeGreaterThanOrEqual(36);
  });
});
