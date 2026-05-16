// Playwright headless browser fallback.
// Only runs when HEADLESS_ENABLED=true. Degrades gracefully if not enabled or if
// Playwright is not installed.

import { extractSignals, type WebsiteSignals } from './extract-signals';

export interface HeadlessFetchResult {
  html: string;
  finalUrl: string;
  signals: WebsiteSignals;
}

export async function headlessFetch(url: string): Promise<HeadlessFetchResult | null> {
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

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15_000 });

    // Short wait for deferred JS rendering
    await page.waitForTimeout(2000);

    const html = await page.content();
    const finalUrl = page.url();

    await browser.close();

    const signals = extractSignals(html, finalUrl);
    return { html, finalUrl, signals };
  } catch {
    if (browser) {
      try {
        await browser.close();
      } catch {
        // Ignore cleanup errors
      }
    }
    return null;
  }
}
