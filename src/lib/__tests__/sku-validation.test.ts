import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { isKnownFoodItem, validateFoodItemsWithAI } from '../qualification/sku-validation';

// ── Layer 1: isKnownFoodItem ──────────────────────────────────────────────────

describe('isKnownFoodItem — Layer 1 static matching', () => {
  // Protein keywords
  it('chicken → true', () => expect(isKnownFoodItem('chicken')).toBe(true));
  it('beef → true', () => expect(isKnownFoodItem('beef')).toBe(true));
  it('salmon → true', () => expect(isKnownFoodItem('salmon')).toBe(true));
  it('Chicken, Beef, Seafood (mixed case) → true', () => expect(isKnownFoodItem('Chicken, Beef, Seafood')).toBe(true));

  // Commodity keywords
  it('oil → true', () => expect(isKnownFoodItem('oil')).toBe(true));
  it('dairy → true', () => expect(isKnownFoodItem('dairy')).toBe(true));
  it('eggs → true', () => expect(isKnownFoodItem('eggs')).toBe(true));
  it('fryer oil → true (commodity)', () => expect(isKnownFoodItem('fryer oil')).toBe(true));

  // Extended food keywords
  it('pasta → true', () => expect(isKnownFoodItem('pasta')).toBe(true));
  it('avocado → true', () => expect(isKnownFoodItem('avocado')).toBe(true));
  it('coffee → true', () => expect(isKnownFoodItem('coffee')).toBe(true));
  it('beer → true', () => expect(isKnownFoodItem('beer')).toBe(true));

  // Multi-item lists
  it('chicken, beef, produce → true', () => expect(isKnownFoodItem('chicken, beef, produce')).toBe(true));
  it('napkins and cleaning supplies → false', () => expect(isKnownFoodItem('napkins and cleaning supplies')).toBe(false));

  // Typos — Layer 1 should NOT catch these (Layer 2 handles them)
  it('chikn → false (typo, Layer 1 miss)', () => expect(isKnownFoodItem('chikn')).toBe(false));
  it('beaf → false (typo, Layer 1 miss)', () => expect(isKnownFoodItem('beaf')).toBe(false));

  // Edge cases
  it('empty string → false', () => expect(isKnownFoodItem('')).toBe(false));
  it('whitespace only → false', () => expect(isKnownFoodItem('   ')).toBe(false));
  it('numbers only → false', () => expect(isKnownFoodItem('123 456')).toBe(false));

  // Partial substring matching works
  it('breaded chicken wing → true (contains "chicken" and "wing")', () => {
    expect(isKnownFoodItem('breaded chicken wings')).toBe(true);
  });
});

// ── Layer 2: validateFoodItemsWithAI ─────────────────────────────────────────

describe('validateFoodItemsWithAI — Layer 2 AI validation', () => {
  const globalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
  });

  afterEach(() => {
    global.fetch = globalFetch;
  });

  it('AI returns isFood=true → valid', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ isFood: true }), { status: 200 }),
    );
    const result = await validateFoodItemsWithAI('chikn and beef');
    expect(result.state).toBe('valid');
  });

  it('AI returns isFood=false → invalid', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ isFood: false }), { status: 200 }),
    );
    const result = await validateFoodItemsWithAI('napkins');
    expect(result.state).toBe('invalid');
  });

  it('AI returns isFood=null (timeout/AI down) → unknown', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ isFood: null, error: 'ai_unavailable' }), { status: 200 }),
    );
    const result = await validateFoodItemsWithAI('something');
    expect(result.state).toBe('unknown');
  });

  it('Network error → unknown (graceful degradation)', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('network error'));
    const result = await validateFoodItemsWithAI('anything');
    expect(result.state).toBe('unknown');
  });

  it('Non-OK HTTP response → unknown', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    );
    const result = await validateFoodItemsWithAI('anything');
    expect(result.state).toBe('unknown');
  });
});
