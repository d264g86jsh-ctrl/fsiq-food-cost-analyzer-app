// Browserless.io API client for production headless rendering.
// Used by headless-fetch.ts when BROWSERLESS_API_KEY is set.
// Local Playwright is used instead when HEADLESS_ENABLED=true (dev only).
//
// Uses the Browserless v2 /content endpoint (returns raw HTML).
// Auth: API key passed as ?token= query param (Bearer header not supported on v2).

const BROWSERLESS_BASE_URL = 'https://production-sfo.browserless.io/content';
const BROWSERLESS_MAX_TIMEOUT_MS = 30_000;

export interface BrowserlessResult {
  html: string;
  finalUrl: string;
}

export async function fetchWithBrowserless(
  url: string,
  apiKey: string,
  timeoutMs: number = 15_000,
): Promise<BrowserlessResult> {
  const response = await fetch(`${BROWSERLESS_BASE_URL}?token=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
    },
    body: JSON.stringify({
      url,
      waitForTimeout: Math.min(timeoutMs, BROWSERLESS_MAX_TIMEOUT_MS),
    }),
    signal: AbortSignal.timeout(timeoutMs + 5_000), // outer timeout > inner
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Browserless API error: ${response.status} ${body.slice(0, 200)}`);
  }

  // /content returns raw HTML text, not JSON
  const html = await response.text();

  if (!html || html.length < 200) {
    throw new Error('Browserless returned empty or minimal HTML');
  }

  return { html, finalUrl: url };
}
