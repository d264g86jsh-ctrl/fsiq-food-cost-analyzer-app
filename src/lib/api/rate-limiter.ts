// In-memory rate limiter — per-Vercel-instance, not shared across instances.
// Good enough for v1: limits abuse without Redis dependency.

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

const WINDOW_MS = 60_000;        // 1-minute sliding window
const MAX_PER_WINDOW = 30;        // 30 AI calls per IP per minute (generous for legitimate use)

// Periodically clear expired entries so the Map doesn't grow unbounded.
// Fires at most once per minute; safe to call on every request.
let lastCleanup = 0;
function maybeCleanup(now: number): void {
  if (now - lastCleanup < WINDOW_MS) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (now > entry.resetAt) store.delete(key);
  }
}

/**
 * Returns true if the IP is within the rate limit, false if it's exceeded.
 * Call once per request; the counter is incremented on each allowed call.
 */
export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  maybeCleanup(now);

  const entry = store.get(ip);

  if (!entry || now > entry.resetAt) {
    store.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_PER_WINDOW) return false;

  entry.count++;
  return true;
}
