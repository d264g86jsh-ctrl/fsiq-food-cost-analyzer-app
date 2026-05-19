// Tests for extractLogoUrl.
// All fetch calls are mocked — no real network requests.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractLogoUrl } from '../website/logo-extractor';

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function headResponse(status: number, contentType: string, contentLength?: number) {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (contentLength !== undefined) {
    headers['content-length'] = String(contentLength);
  }
  return Promise.resolve(
    new Response(null, {
      status,
      headers,
    }),
  );
}

function mockFetchByUrl(
  map: Record<string, { status: number; contentType: string; contentLength?: number }>,
) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    for (const [pattern, res] of Object.entries(map)) {
      if (url.includes(pattern)) {
        return headResponse(res.status, res.contentType, res.contentLength);
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

// ── Source 1: Schema.org JSON-LD ──────────────────────────────────────────────

describe('extractLogoUrl — Schema.org JSON-LD (source 1)', () => {
  it('returns JSON-LD logo URL when HTML has JSON-LD logo as string', async () => {
    mockFetchByUrl({
      'casaroberto.com/images/logo.png': { status: 200, contentType: 'image/png' },
    });
    const html = `
      <script type="application/ld+json">
        {"@type":"Restaurant","logo":"https://casaroberto.com/images/logo.png"}
      </script>
    `;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/images/logo.png');
  });

  it('returns JSON-LD logo URL when logo is an ImageObject', async () => {
    mockFetchByUrl({
      'casaroberto.com/images/logo.png': { status: 200, contentType: 'image/png' },
    });
    const html = `
      <script type="application/ld+json">
        {"@type":"Restaurant","logo":{"@type":"ImageObject","url":"https://casaroberto.com/images/logo.png"}}
      </script>
    `;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/images/logo.png');
  });
});

// ── Source 2: og:image from HTML ─────────────────────────────────────────────

describe('extractLogoUrl — og:image fallback (source 2)', () => {
  it('returns og:image when JSON-LD absent and og:image validates', async () => {
    mockFetchByUrl({
      'casaroberto.com/social.jpg': { status: 200, contentType: 'image/jpeg' },
    });
    const result = await extractLogoUrl('https://casaroberto.com', SAMPLE_HTML_WITH_OG);
    expect(result).toBe('https://casaroberto.com/social.jpg');
  });

  it('handles alternate og:image attribute order', async () => {
    mockFetchByUrl({
      'casaroberto.com/social.jpg': { status: 200, contentType: 'image/jpeg' },
    });
    const result = await extractLogoUrl('https://casaroberto.com', HTML_ALT_OG_ATTR_ORDER);
    expect(result).toBe('https://casaroberto.com/social.jpg');
  });

  it('rejects og:image that does not start with http', async () => {
    mockFetchByUrl({
      's2/favicons': { status: 404, contentType: 'text/html' },
    });
    const html = `<meta property="og:image" content="/relative/path.jpg" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBeNull();
  });

  it('rejects og:image shorter than 15 chars', async () => {
    mockFetchByUrl({
      's2/favicons': { status: 404, contentType: 'text/html' },
    });
    const html = `<meta property="og:image" content="http://x.co/a" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBeNull();
  });

  it('rejects og:image URL containing spaces', async () => {
    mockFetchByUrl({
      's2/favicons': { status: 404, contentType: 'text/html' },
    });
    const html = `<meta property="og:image" content="https://casaroberto.com/my logo.jpg" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBeNull();
  });

  it('returns null when no rawHtml provided and all network sources fail', async () => {
    mockFetchByUrl({
      's2/favicons': { status: 404, contentType: 'text/html' },
    });
    const result = await extractLogoUrl('https://casaroberto.com');
    expect(result).toBeNull();
  });
});

// ── Source 3: twitter:image ───────────────────────────────────────────────────

describe('extractLogoUrl — twitter:image (source 3)', () => {
  it('returns twitter:image when earlier sources fail', async () => {
    mockFetchByUrl({
      'casaroberto.com/twitter-card.jpg': { status: 200, contentType: 'image/jpeg' },
    });
    const html = `<meta name="twitter:image" content="https://casaroberto.com/twitter-card.jpg" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/twitter-card.jpg');
  });

  it('supports property= attribute order for twitter:image', async () => {
    mockFetchByUrl({
      'casaroberto.com/twitter-card.jpg': { status: 200, contentType: 'image/jpeg' },
    });
    const html = `<meta property="twitter:image" content="https://casaroberto.com/twitter-card.jpg" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/twitter-card.jpg');
  });
});

// ── Source 4: apple-touch-icon ────────────────────────────────────────────────

describe('extractLogoUrl — apple-touch-icon (source 4)', () => {
  it('returns apple-touch-icon URL (absolute)', async () => {
    mockFetchByUrl({
      'casaroberto.com/apple-icon.png': { status: 200, contentType: 'image/png' },
    });
    const html = `<link rel="apple-touch-icon" href="https://casaroberto.com/apple-icon.png" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/apple-icon.png');
  });

  it('resolves relative apple-touch-icon path', async () => {
    mockFetchByUrl({
      'casaroberto.com/apple-icon.png': { status: 200, contentType: 'image/png' },
    });
    const html = `<link rel="apple-touch-icon" href="/apple-icon.png" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/apple-icon.png');
  });
});

// ── Source 5: link[rel=icon][type=image/png] ──────────────────────────────────

describe('extractLogoUrl — png-icon (source 5)', () => {
  it('returns PNG icon URL', async () => {
    mockFetchByUrl({
      'casaroberto.com/icon.png': { status: 200, contentType: 'image/png' },
    });
    const html = `<link rel="icon" type="image/png" href="https://casaroberto.com/icon.png" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/icon.png');
  });
});

// ── Source 6: Google Favicon HD ───────────────────────────────────────────────

describe('extractLogoUrl — Google Favicon (source 6)', () => {
  it('returns Google favicon URL when no HTML sources found', async () => {
    mockFetchByUrl({
      's2/favicons': { status: 200, contentType: 'image/png' },
    });
    const result = await extractLogoUrl('https://casaroberto.com');
    expect(result).toContain('google.com/s2/favicons');
    expect(result).toContain('sz=128');
  });

  it('skips Google favicon when Content-Type is not image/', async () => {
    mockFetchByUrl({
      's2/favicons':                { status: 200, contentType: 'text/plain' },
      'casaroberto.com/social.jpg': { status: 200, contentType: 'image/jpeg' },
    });
    const result = await extractLogoUrl('https://casaroberto.com', SAMPLE_HTML_WITH_OG);
    // og:image (source 2) fires before Google (source 6)
    expect(result).toBe('https://casaroberto.com/social.jpg');
  });
});

// ── Source 7: nav-img ─────────────────────────────────────────────────────────

describe('extractLogoUrl — nav-img (source 7)', () => {
  it('returns first img src found inside <header>', async () => {
    mockFetchByUrl({
      's2/favicons':                     { status: 404, contentType: 'text/html' },
      'casaroberto.com/header-logo.png': { status: 200, contentType: 'image/png' },
    });
    const html = `<header><img src="https://casaroberto.com/header-logo.png" alt="header" /></header>`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/header-logo.png');
  });

  it('returns first img src found inside <nav>', async () => {
    mockFetchByUrl({
      's2/favicons':                  { status: 404, contentType: 'text/html' },
      'casaroberto.com/nav-logo.png': { status: 200, contentType: 'image/png' },
    });
    const html = `<nav><img src="https://casaroberto.com/nav-logo.png" alt="nav" /></nav>`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/nav-logo.png');
  });
});

// ── Source 8: alt-img ─────────────────────────────────────────────────────────

describe('extractLogoUrl — alt-img (source 8)', () => {
  it('returns img with alt containing "logo"', async () => {
    mockFetchByUrl({
      's2/favicons':                    { status: 404, contentType: 'text/html' },
      'casaroberto.com/brand-logo.png': { status: 200, contentType: 'image/png' },
    });
    const html = `<img src="https://casaroberto.com/brand-logo.png" alt="Casa Roberto Logo" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/brand-logo.png');
  });

  it('alt match is case-insensitive', async () => {
    mockFetchByUrl({
      's2/favicons':                   { status: 404, contentType: 'text/html' },
      'casaroberto.com/site-logo.png': { status: 200, contentType: 'image/png' },
    });
    const html = `<img src="https://casaroberto.com/site-logo.png" alt="SITE LOGO" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/site-logo.png');
  });
});

// ── isValidImageUrl improvements ──────────────────────────────────────────────

describe('extractLogoUrl — isValidImageUrl improvements', () => {
  it('rejects ICO content-type (image/x-icon)', async () => {
    mockFetchByUrl({
      's2/favicons': { status: 200, contentType: 'image/x-icon' },
    });
    const result = await extractLogoUrl('https://casaroberto.com');
    expect(result).toBeNull();
  });

  it('rejects ICO content-type (image/vnd.microsoft.icon)', async () => {
    mockFetchByUrl({
      's2/favicons': { status: 200, contentType: 'image/vnd.microsoft.icon' },
    });
    const result = await extractLogoUrl('https://casaroberto.com');
    expect(result).toBeNull();
  });

  it('rejects when Content-Length < 200 (tracking pixel guard)', async () => {
    mockFetchByUrl({
      's2/favicons': { status: 200, contentType: 'image/png', contentLength: 100 },
    });
    const result = await extractLogoUrl('https://casaroberto.com');
    expect(result).toBeNull();
  });

  it('accepts when Content-Length is absent (no rejection)', async () => {
    mockFetchByUrl({
      // No content-length header returned (contentLength: undefined → not added)
      'casaroberto.com/social.jpg': { status: 200, contentType: 'image/jpeg' },
    });
    const result = await extractLogoUrl('https://casaroberto.com', SAMPLE_HTML_WITH_OG);
    expect(result).toBe('https://casaroberto.com/social.jpg');
  });

  it('rejects URL with /placeholder in path', async () => {
    mockFetchByUrl({
      's2/favicons': { status: 404, contentType: 'text/html' },
    });
    const html = `<meta property="og:image" content="https://casaroberto.com/placeholder/img.png" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBeNull();
  });
});

// ── Null fallback ─────────────────────────────────────────────────────────────

describe('extractLogoUrl — null fallback', () => {
  it('returns null when all sources fail', async () => {
    mockFetchByUrl({
      's2/favicons': { status: 404, contentType: 'text/html' },
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
  it('does NOT call Google when JSON-LD succeeds', async () => {
    const fetchSpy = mockFetchByUrl({
      'casaroberto.com/images/logo.png': { status: 200, contentType: 'image/png' },
      's2/favicons':                     { status: 200, contentType: 'image/png' },
    });
    const html = `
      <script type="application/ld+json">
        {"@type":"Restaurant","logo":"https://casaroberto.com/images/logo.png"}
      </script>
    `;
    await extractLogoUrl('https://casaroberto.com', html);
    const googleCalled = fetchSpy.mock.calls.some(([u]) =>
      typeof u === 'string' && u.includes('s2/favicons'),
    );
    expect(googleCalled).toBe(false);
  });

  it('Google (source 6) is tried AFTER HTML sources', async () => {
    const fetchSpy = mockFetchByUrl({
      'casaroberto.com/social.jpg': { status: 200, contentType: 'image/jpeg' },
      's2/favicons':                { status: 200, contentType: 'image/png' },
    });
    await extractLogoUrl('https://casaroberto.com', SAMPLE_HTML_WITH_OG);
    const googleCalled = fetchSpy.mock.calls.some(([u]) =>
      typeof u === 'string' && u.includes('s2/favicons'),
    );
    // og:image (source 2) should match before Google (source 6)
    expect(googleCalled).toBe(false);
  });
});
