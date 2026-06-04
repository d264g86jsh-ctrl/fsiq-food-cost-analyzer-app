// Layer 1: static keyword matching (client-safe, synchronous, zero latency)
// Layer 2: AI validation — called via server endpoint (async, only on Layer 1 miss)
//
// Keywords are loaded from src/config/food-keywords.json — edit that file
// and redeploy to add terms without changing code.

import foodKeywords from '@/config/food-keywords.json';

const ALL_FOOD_KEYWORDS: string[] = [
  ...(foodKeywords.proteins as string[]),
  ...(foodKeywords.commodities as string[]),
  ...(foodKeywords.extended as string[]),
];

// ── Layer 1 ───────────────────────────────────────────────────────────────────

/**
 * Layer 1 — Static keyword match.
 * Returns true if any known food keyword is present in the input.
 * Client-safe: no async, no network, zero latency.
 */
export function isKnownFoodItem(topSkus: string): boolean {
  if (!topSkus.trim()) return false;
  const lower = topSkus.toLowerCase();
  return ALL_FOOD_KEYWORDS.some((kw) => lower.includes(kw));
}

// ── Layer 2 ───────────────────────────────────────────────────────────────────

export type SkuValidationState = 'idle' | 'validating' | 'valid' | 'invalid' | 'unknown';

export interface SkuValidationResult {
  state: SkuValidationState;
}

// In-memory client-side cache — per browser session, no persistence.
// Prevents duplicate AI calls for identical inputs within the same session.
interface CacheEntry {
  result: SkuValidationResult;
  ts: number;
}

const _cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

function _getCacheKey(topSkus: string): string {
  return topSkus.trim().toLowerCase();
}

function _getCache(topSkus: string): SkuValidationResult | null {
  const entry = _cache.get(_getCacheKey(topSkus));
  if (!entry) return null;
  if (Date.now() - entry.ts > CACHE_TTL_MS) { _cache.delete(_getCacheKey(topSkus)); return null; }
  return entry.result;
}

function _setCache(topSkus: string, result: SkuValidationResult): void {
  _cache.set(_getCacheKey(topSkus), { result, ts: Date.now() });
}

/**
 * Layer 2 — AI validation via server endpoint.
 * Only called when Layer 1 returns false.
 * Returns 'valid', 'invalid', or 'unknown' (on network error).
 * Timeout is treated as 'valid' — lenient: assume user knows their items.
 */
export async function validateFoodItemsWithAI(topSkus: string): Promise<SkuValidationResult> {
  // Cache hit
  const cached = _getCache(topSkus);
  if (cached) return cached;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6_000);

    const res = await fetch('/api/validate-food-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topSkus }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) {
      // 429 rate limit — neutral, allow submit
      return { state: 'unknown' };
    }

    const data = (await res.json()) as { isFood: boolean | null; error?: string };

    // Server reports timeout → lenient valid
    if (data.error === 'timeout_assumed_valid') {
      const result: SkuValidationResult = { state: 'valid' };
      _setCache(topSkus, result);
      return result;
    }

    const result: SkuValidationResult =
      data.isFood === true  ? { state: 'valid' } :
      data.isFood === false ? { state: 'invalid' } :
                              { state: 'unknown' };

    // Cache valid and invalid; don't cache unknown (AI was down — retry is fine)
    if (result.state !== 'unknown') _setCache(topSkus, result);
    return result;
  } catch {
    // AbortError (client 6s timeout) or network error → lenient valid
    // User is already waiting — don't add friction with an unknown state.
    return { state: 'valid' };
  }
}

// Exported for testing
export const _testUtils = {
  clearCache: () => _cache.clear(),
  getCacheSize: () => _cache.size,
};
