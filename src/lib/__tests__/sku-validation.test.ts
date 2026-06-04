import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  isKnownFoodItem,
  validateFoodItemsWithAI,
  _testUtils,
} from '../qualification/sku-validation';

// ── Layer 1: isKnownFoodItem ──────────────────────────────────────────────────

describe('isKnownFoodItem — Layer 1 static matching', () => {
  // Core protein keywords (from config)
  it('chicken → true', () => expect(isKnownFoodItem('chicken')).toBe(true));
  it('beef → true', () => expect(isKnownFoodItem('beef')).toBe(true));
  it('salmon → true', () => expect(isKnownFoodItem('salmon')).toBe(true));
  it('Chicken, Beef, Seafood (mixed case) → true', () => {
    expect(isKnownFoodItem('Chicken, Beef, Seafood')).toBe(true);
  });

  // Core commodity keywords (from config)
  it('oil → true', () => expect(isKnownFoodItem('oil')).toBe(true));
  it('dairy → true', () => expect(isKnownFoodItem('dairy')).toBe(true));
  it('eggs → true', () => expect(isKnownFoodItem('eggs')).toBe(true));
  it('fryer oil → true', () => expect(isKnownFoodItem('fryer oil')).toBe(true));

  // Extended keywords (from config)
  it('pasta → true', () => expect(isKnownFoodItem('pasta')).toBe(true));
  it('avocado → true', () => expect(isKnownFoodItem('avocado')).toBe(true));
  it('coffee → true', () => expect(isKnownFoodItem('coffee')).toBe(true));
  it('beer → true', () => expect(isKnownFoodItem('beer')).toBe(true));

  // Multi-item list
  it('chicken, beef, produce → true', () => {
    expect(isKnownFoodItem('chicken, beef, produce')).toBe(true);
  });

  // Non-food items
  it('napkins and cleaning supplies → false', () => {
    expect(isKnownFoodItem('napkins and cleaning supplies')).toBe(false);
  });
  it('office supplies → false', () => {
    expect(isKnownFoodItem('office supplies')).toBe(false);
  });

  // Typos — Layer 1 misses, Layer 2 handles
  it('chikn → false (typo, Layer 1 miss)', () => expect(isKnownFoodItem('chikn')).toBe(false));
  it('beaf → false (typo, Layer 1 miss)', () => expect(isKnownFoodItem('beaf')).toBe(false));

  // Edge cases
  it('empty string → false', () => expect(isKnownFoodItem('')).toBe(false));
  it('whitespace only → false', () => expect(isKnownFoodItem('   ')).toBe(false));
  it('numbers only → false', () => expect(isKnownFoodItem('123 456')).toBe(false));

  // Substring matching
  it('breaded chicken wings → true', () => {
    expect(isKnownFoodItem('breaded chicken wings')).toBe(true);
  });
});

// ── Layer 2: validateFoodItemsWithAI ─────────────────────────────────────────

describe('validateFoodItemsWithAI — Layer 2 AI validation', () => {
  const globalFetch = global.fetch;

  beforeEach(() => {
    global.fetch = vi.fn();
    _testUtils.clearCache();
  });

  afterEach(() => {
    global.fetch = globalFetch;
    _testUtils.clearCache();
  });

  it('isFood=true → valid', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ isFood: true }), { status: 200 }),
    );
    const result = await validateFoodItemsWithAI('chikn and beef');
    expect(result.state).toBe('valid');
  });

  it('isFood=false → invalid', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ isFood: false }), { status: 200 }),
    );
    const result = await validateFoodItemsWithAI('napkins');
    expect(result.state).toBe('invalid');
  });

  it('isFood=null (AI unavailable) → unknown', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ isFood: null, error: 'ai_unavailable' }), { status: 200 }),
    );
    const result = await validateFoodItemsWithAI('something');
    expect(result.state).toBe('unknown');
  });

  it('timeout_assumed_valid from server → valid (lenient timeout)', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ isFood: true, error: 'timeout_assumed_valid' }), { status: 200 }),
    );
    const result = await validateFoodItemsWithAI('exotic ingredient');
    expect(result.state).toBe('valid');
  });

  it('network error (AbortError, client timeout) → valid (lenient)', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new DOMException('signal aborted', 'AbortError'));
    const result = await validateFoodItemsWithAI('anything');
    // Client-side timeout → lenient → valid (user assumed to know their items)
    expect(result.state).toBe('valid');
  });

  it('generic network error → valid (lenient)', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('network error'));
    const result = await validateFoodItemsWithAI('anything');
    expect(result.state).toBe('valid');
  });

  it('429 rate limit from server → unknown (neutral, allow submit)', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: 'rate_limit_exceeded' }), { status: 429 }),
    );
    const result = await validateFoodItemsWithAI('anything');
    expect(result.state).toBe('unknown');
  });

  // Cache behavior
  it('second identical call hits cache (no second fetch)', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ isFood: true }), { status: 200 }),
    );
    await validateFoodItemsWithAI('chicken breast');
    vi.mocked(global.fetch).mockClear();

    await validateFoodItemsWithAI('chicken breast');
    expect(vi.mocked(global.fetch)).not.toHaveBeenCalled();
  });

  it('cache is case/whitespace insensitive', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ isFood: false }), { status: 200 }),
    );
    await validateFoodItemsWithAI('Napkins');
    vi.mocked(global.fetch).mockClear();

    await validateFoodItemsWithAI('  napkins  ');
    expect(vi.mocked(global.fetch)).not.toHaveBeenCalled();
  });

  it('different inputs each get their own AI call', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ isFood: true }), { status: 200 }),
    );
    await validateFoodItemsWithAI('chicken');
    await validateFoodItemsWithAI('beef');
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(2);
  });

  it('unknown results are NOT cached (AI-down result, allow retry)', async () => {
    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ isFood: null, error: 'ai_error' }), { status: 200 }),
    );
    await validateFoodItemsWithAI('mystery item');
    vi.mocked(global.fetch).mockClear();

    vi.mocked(global.fetch).mockResolvedValue(
      new Response(JSON.stringify({ isFood: true }), { status: 200 }),
    );
    const result = await validateFoodItemsWithAI('mystery item');
    expect(vi.mocked(global.fetch)).toHaveBeenCalledTimes(1);
    expect(result.state).toBe('valid');
  });
});

// ── Rate limiter ──────────────────────────────────────────────────────────────

describe('checkRateLimit', async () => {
  const { checkRateLimit } = await import('../api/rate-limiter');

  it('allows first request', () => {
    expect(checkRateLimit('test-ip-unique-' + Date.now())).toBe(true);
  });

  it('allows up to 30 requests per window', () => {
    const ip = 'test-rate-' + Date.now();
    let allowed = 0;
    for (let i = 0; i < 30; i++) {
      if (checkRateLimit(ip)) allowed++;
    }
    expect(allowed).toBe(30);
  });

  it('blocks the 31st request within the window', () => {
    const ip = 'test-block-' + Date.now();
    for (let i = 0; i < 30; i++) checkRateLimit(ip);
    expect(checkRateLimit(ip)).toBe(false);
  });

  it('different IPs have independent limits', () => {
    const ip1 = 'test-ip1-' + Date.now();
    const ip2 = 'test-ip2-' + Date.now();
    for (let i = 0; i < 30; i++) checkRateLimit(ip1);
    // ip2 should still be allowed even though ip1 is at limit
    expect(checkRateLimit(ip2)).toBe(true);
  });
});
