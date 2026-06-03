// Browserless.io API client for production headless rendering.
// Used by headless-fetch.ts when BROWSERLESS_API_KEY is set.
// Local Playwright is used instead when HEADLESS_ENABLED=true (dev only).

const BROWSERLESS_SCRAPE_URL = 'https://chrome.browserless.io/scrape';
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
  const response = await fetch(BROWSERLESS_SCRAPE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      timeout: Math.min(timeoutMs, BROWSERLESS_MAX_TIMEOUT_MS),
      waitFor: 'networkidle',
      elements: [{ selector: 'body' }],
    }),
    signal: AbortSignal.timeout(timeoutMs + 5_000), // outer timeout > inner
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Browserless API error: ${response.status} ${body.slice(0, 200)}`);
  }

  const data = (await response.json()) as { data: Array<{ html: string }> };
  const html = data?.data?.[0]?.html ?? '';

  if (!html) {
    throw new Error('Browserless returned empty HTML');
  }

  return { html, finalUrl: url };
}
