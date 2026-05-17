// Tests for extractLogoUrl.
// All fetch calls are mocked — no real network requests.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractLogoUrl } from '../website/logo-extractor';

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function headResponse(status: number, contentType: string) {
  return Promise.resolve(
    new Response(null, {
      status,
      headers: { 'content-type': contentType },
    }),
  );
}

function mockFetchByUrl(
  map: Record<string, { status: number; contentType: string }>,
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    for (const [pattern, res] of Object.entries(map)) {
      if (url.includes(pattern)) {
        return headResponse(res.status, res.contentType);
      }
    }
    return headResponse(404, 'text/html');
  });
}

const SAMPLE_HTML_WITH_OG = `
  <html>
    <head>
      <meta property="og:image" content="https://casaroberto.com/social.jpg" />
    </head>
  </html>
`;

const HTML_ALT_OG_ATTR_ORDER = `
  <meta content="https://casaroberto.com/social.jpg" property="og:image" />
`;

// ── Source 1: Clearbit ────────────────────────────────────────────────────────

describe('extractLogoUrl — Clearbit (source 1)', () => {
  it('returns Clearbit URL when HEAD responds with image/png', async () => {
    mockFetchByUrl({ 'logo.clearbit.com': { status: 200, contentType: 'image/png' } });
    const result = await extractLogoUrl('https://casaroberto.com');
    expect(result).toBe('https://logo.clearbit.com/casaroberto.com');
  });

  it('returns Clearbit URL for image/svg+xml', async () => {
    mockFetchByUrl({ 'logo.clearbit.com': { status: 200, contentType: 'image/svg+xml' } });
    const result = await extractLogoUrl('https://casaroberto.com');
    expect(result).toBe('https://logo.clearbit.com/casaroberto.com');
  });

  it('skips Clearbit on 404 and tries next source', async () => {
    mockFetchByUrl({
      'logo.clearbit.com': { status: 404, contentType: 'text/html' },
      's2/favicons':        { status: 200, contentType: 'image/png' },
    });
    const result = await extractLogoUrl('https://casaroberto.com');
    expect(result).toContain('google.com/s2/favicons');
  });

  it('skips Clearbit when Content-Type is not image/', async () => {
    mockFetchByUrl({
      'logo.clearbit.com': { status: 200, contentType: 'text/html' },
      's2/favicons':        { status: 200, contentType: 'image/png' },
    });
    const result = await extractLogoUrl('https://casaroberto.com');
    expect(result).toContain('google.com/s2/favicons');
  });

  it('strips www. from domain for Clearbit URL', async () => {
    mockFetchByUrl({ 'logo.clearbit.com': { status: 200, contentType: 'image/png' } });
    const result = await extractLogoUrl('https://www.casaroberto.com');
    expect(result).toBe('https://logo.clearbit.com/casaroberto.com');
  });
});

// ── Source 2: Google Favicon ──────────────────────────────────────────────────

describe('extractLogoUrl — Google Favicon (source 2)', () => {
  it('returns Google favicon URL when Clearbit fails', async () => {
    mockFetchByUrl({
      'logo.clearbit.com': { status: 404, contentType: 'text/html' },
      's2/favicons':        { status: 200, contentType: 'image/png' },
    });
    const result = await extractLogoUrl('https://casaroberto.com');
    expect(result).toContain('google.com/s2/favicons');
    expect(result).toContain('sz=128');
  });

  it('skips Google favicon when Content-Type is not image/', async () => {
    mockFetchByUrl({
      'logo.clearbit.com': { status: 404, contentType: 'text/html' },
      's2/favicons':        { status: 200, contentType: 'text/plain' },
    });
    const result = await extractLogoUrl('https://casaroberto.com', SAMPLE_HTML_WITH_OG);
    expect(result).toBe('https://casaroberto.com/social.jpg');
  });
});

// ── Source 3: og:image from HTML ─────────────────────────────────────────────

describe('extractLogoUrl — og:image fallback (source 3)', () => {
  it('returns og:image when both services fail', async () => {
    mockFetchByUrl({
      'logo.clearbit.com': { status: 404, contentType: 'text/html' },
      's2/favicons':        { status: 404, contentType: 'text/html' },
    });
    const result = await extractLogoUrl('https://casaroberto.com', SAMPLE_HTML_WITH_OG);
    expect(result).toBe('https://casaroberto.com/social.jpg');
  });

  it('handles alternate og:image attribute order', async () => {
    mockFetchByUrl({
      'logo.clearbit.com': { status: 404, contentType: 'text/html' },
      's2/favicons':        { status: 404, contentType: 'text/html' },
    });
    const result = await extractLogoUrl('https://casaroberto.com', HTML_ALT_OG_ATTR_ORDER);
    expect(result).toBe('https://casaroberto.com/social.jpg');
  });

  it('rejects og:image that does not start with http', async () => {
    mockFetchByUrl({
      'logo.clearbit.com': { status: 404, contentType: 'text/html' },
      's2/favicons':        { status: 404, contentType: 'text/html' },
    });
    const html = `<meta property="og:image" content="/relative/path.jpg" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBeNull();
  });

  it('rejects og:image shorter than 15 chars', async () => {
    mockFetchByUrl({
      'logo.clearbit.com': { status: 404, contentType: 'text/html' },
      's2/favicons':        { status: 404, contentType: 'text/html' },
    });
    const html = `<meta property="og:image" content="http://x.co/a" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBeNull();
  });

  it('rejects og:image URL containing spaces', async () => {
    mockFetchByUrl({
      'logo.clearbit.com': { status: 404, contentType: 'text/html' },
      's2/favicons':        { status: 404, contentType: 'text/html' },
    });
    const html = `<meta property="og:image" content="https://casaroberto.com/my logo.jpg" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBeNull();
  });

  it('returns null when no rawHtml provided and both services fail', async () => {
    mockFetchByUrl({
      'logo.clearbit.com': { status: 404, contentType: 'text/html' },
      's2/favicons':        { status: 404, contentType: 'text/html' },
    });
    const result = await extractLogoUrl('https://casaroberto.com');
    expect(result).toBeNull();
  });
});

// ── Source 4: null fallback ───────────────────────────────────────────────────

describe('extractLogoUrl — null fallback (source 4)', () => {
  it('returns null when all sources fail', async () => {
    mockFetchByUrl({
      'logo.clearbit.com': { status: 404, contentType: 'text/html' },
      's2/favicons':        { status: 404, contentType: 'text/html' },
    });
    const result = await extractLogoUrl('https://casaroberto.com');
    expect(result).toBeNull();
  });

  it('returns null for a URL with no extractable domain', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 404 }));
    const result = await extractLogoUrl('not-a-url');
    expect(result).toBeNull();
  });
});

// ── Waterfall order guarantee ─────────────────────────────────────────────────

describe('extractLogoUrl — waterfall stops at first valid source', () => {
  it('does NOT call Google or og:image when Clearbit succeeds', async () => {
    const fetchSpy = mockFetchByUrl({
      'logo.clearbit.com': { status: 200, contentType: 'image/png' },
      's2/favicons':        { status: 200, contentType: 'image/png' },
    });
    await extractLogoUrl('https://casaroberto.com', SAMPLE_HTML_WITH_OG);
    const googleCalled = fetchSpy.mock.calls.some(([u]) =>
      typeof u === 'string' && u.includes('s2/favicons'),
    );
    expect(googleCalled).toBe(false);
  });
});
