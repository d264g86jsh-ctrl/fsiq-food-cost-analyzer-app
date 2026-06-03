// Headless browser fallback — dual-mode:
//   Production (BROWSERLESS_API_KEY set): Browserless.io via REST API
//   Development (HEADLESS_ENABLED=true):  local Playwright (requires Chromium installed)
//
// Returns null on any failure — callers must treat null as "headless unavailable".
// Never throws.

import { extractSignals, type WebsiteSignals } from './extract-signals';
import { fetchWithBrowserless } from './browserless-client';

export interface HeadlessFetchResult {
  html: string;
  finalUrl: string;
  signals: WebsiteSignals;
}

const HEADLESS_TIMEOUT_MS = parseInt(process.env.HEADLESS_TIMEOUT_MS ?? '15000', 10);

export async function headlessFetch(url: string): Promise<HeadlessFetchResult | null> {
  const browserlessApiKey = process.env.BROWSERLESS_API_KEY;

  // ── Production path: Browserless.io ─────────────────────────────────────
  if (browserlessApiKey) {
    try {
      const result = await fetchWithBrowserless(url, browserlessApiKey, HEADLESS_TIMEOUT_MS);
      if (!result.html || result.html.length < 200) return null;
      const signals = extractSignals(result.html, result.finalUrl);
      return { html: result.html, finalUrl: result.finalUrl, signals };
    } catch (err) {
      console.error(`[FSIQ HEADLESS] Browserless failed for ${url}:`, err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  // ── Development path: local Playwright ──────────────────────────────────
  if (process.env.HEADLESS_ENABLED !== 'true') return null;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let playwright: any = null;
  try {
    // Dynamic import — if playwright is not installed this throws and we degrade gracefully
    // @ts-expect-error — playwright is an optional dependency; not installed by default
    playwright = await import('playwright');
  } catch {
    return null;
  }

  let browser = null;
  try {
    browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 },
    });
    const page = await context.newPage();

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: HEADLESS_TIMEOUT_MS });

    // Short wait for deferred JS rendering
    await page.waitForTimeout(2000);

    const html = await page.content();
    const finalUrl = page.url();

    await browser.close();

    if (!html || html.length < 200) return null;
    const signals = extractSignals(html, finalUrl);
    return { html, finalUrl, signals };
  } catch (err) {
    console.error(`[FSIQ HEADLESS] Playwright failed for ${url}:`, err instanceof Error ? err.message : String(err));
    if (browser) {
      try { await browser.close(); } catch { /* ignore cleanup errors */ }
    }
    return null;
  }
}
