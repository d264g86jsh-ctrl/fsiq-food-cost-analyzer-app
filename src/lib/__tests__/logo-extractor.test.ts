// Tests for extractLogoUrl and isLogoLikeUrl.
// All fetch calls are mocked — no real network requests.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { extractLogoUrl, isLogoLikeUrl } from '../website/logo-extractor';

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

const SAMPLE_HTML_WITH_OG_LOGO = `
  <html>
    <head>
      <meta property="og:image" content="https://casaroberto.com/casaroberto-logo.png" />
    </head>
  </html>
`;

const SAMPLE_HTML_WITH_OG_HERO = `
  <html>
    <head>
      <meta property="og:image" content="https://casaroberto.com/home-hero.jpg" />
    </head>
  </html>
`;

const SAMPLE_HTML_WITH_OG_GENERIC = `
  <html>
    <head>
      <meta property="og:image" content="https://casaroberto.com/social.jpg" />
    </head>
  </html>
`;

const HTML_ALT_OG_ATTR_ORDER_LOGO = `
  <meta content="https://casaroberto.com/casaroberto-logo.png" property="og:image" />
`;

// ── isLogoLikeUrl ─────────────────────────────────────────────────────────────

describe('isLogoLikeUrl', () => {
  it('accepts URL with "logo" keyword', () => {
    expect(isLogoLikeUrl('https://casaroberto.com/casaroberto-logo.png')).toBe(true);
  });

  it('accepts URL with "brand" keyword', () => {
    expect(isLogoLikeUrl('https://casaroberto.com/brand-mark.png')).toBe(true);
  });

  it('accepts URL with "favicon" keyword', () => {
    expect(isLogoLikeUrl('https://casaroberto.com/favicon-192.png')).toBe(true);
  });

  it('accepts URL with "icon" keyword', () => {
    expect(isLogoLikeUrl('https://casaroberto.com/site-icon.png')).toBe(true);
  });

  it('accepts URL with "wordmark" keyword', () => {
    expect(isLogoLikeUrl('https://casaroberto.com/wordmark.svg')).toBe(true);
  });

  it('accepts URL with "android-chrome" (WordPress app icon)', () => {
    expect(isLogoLikeUrl('https://sawsbbq.com/wp-content/uploads/cropped-android-chrome-512.png')).toBe(true);
  });

  it('rejects URL with "hero" keyword', () => {
    expect(isLogoLikeUrl('https://casaroberto.com/home-hero.jpg')).toBe(false);
  });

  it('rejects URL with "banner" keyword', () => {
    expect(isLogoLikeUrl('https://casaroberto.com/banner-image.jpg')).toBe(false);
  });

  it('rejects URL with "social" keyword', () => {
    expect(isLogoLikeUrl('https://casaroberto.com/social-share.jpg')).toBe(false);
  });

  it('rejects URL with "1200x630" dimensions (og:image social card)', () => {
    expect(isLogoLikeUrl('https://casaroberto.com/og-1200x630.jpg')).toBe(false);
  });

  it('rejects URL with no logo keyword (ambiguous URL)', () => {
    expect(isLogoLikeUrl('https://casaroberto.com/img_3598.jpg')).toBe(false);
  });

  it('strips query string before checking keywords', () => {
    expect(isLogoLikeUrl('https://casaroberto.com/img.jpg?hero=true')).toBe(false);
    expect(isLogoLikeUrl('https://casaroberto.com/logo.png?v=123')).toBe(true);
  });
});

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

// ── Source 2: apple-touch-icon ────────────────────────────────────────────────

describe('extractLogoUrl — apple-touch-icon (source 2)', () => {
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

  it('apple-touch-icon fires before og:image', async () => {
    const fetchSpy = mockFetchByUrl({
      'casaroberto.com/apple-icon.png':   { status: 200, contentType: 'image/png' },
      'casaroberto.com/casaroberto-logo.png': { status: 200, contentType: 'image/png' },
    });
    const html = `
      <link rel="apple-touch-icon" href="/apple-icon.png" />
      <meta property="og:image" content="https://casaroberto.com/casaroberto-logo.png" />
    `;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/apple-icon.png');
    const ogCalled = fetchSpy.mock.calls.some(([u]) =>
      typeof u === 'string' && u.includes('casaroberto-logo'),
    );
    expect(ogCalled).toBe(false);
  });
});

// ── Source 3: link[rel=icon][type=image/png] ──────────────────────────────────

describe('extractLogoUrl — png-icon (source 3)', () => {
  it('returns PNG icon URL', async () => {
    mockFetchByUrl({
      'casaroberto.com/icon.png': { status: 200, contentType: 'image/png' },
    });
    const html = `<link rel="icon" type="image/png" href="https://casaroberto.com/icon.png" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/icon.png');
  });
});

// ── Source 4: img with alt="logo" ─────────────────────────────────────────────

describe('extractLogoUrl — alt-img (source 4)', () => {
  it('returns img with alt containing "logo"', async () => {
    mockFetchByUrl({
      'casaroberto.com/brand-logo.png': { status: 200, contentType: 'image/png' },
    });
    const html = `<img src="https://casaroberto.com/brand-logo.png" alt="Casa Roberto Logo" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/brand-logo.png');
  });

  it('alt match is case-insensitive', async () => {
    mockFetchByUrl({
      'casaroberto.com/site-logo.png': { status: 200, contentType: 'image/png' },
    });
    const html = `<img src="https://casaroberto.com/site-logo.png" alt="SITE LOGO" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/site-logo.png');
  });

  it('alt-img fires before og:image', async () => {
    const fetchSpy = mockFetchByUrl({
      'casaroberto.com/brand-logo.png':       { status: 200, contentType: 'image/png' },
      'casaroberto.com/casaroberto-logo.png':  { status: 200, contentType: 'image/png' },
    });
    const html = `
      <meta property="og:image" content="https://casaroberto.com/casaroberto-logo.png" />
      <img src="https://casaroberto.com/brand-logo.png" alt="Casa Roberto Logo" />
    `;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/brand-logo.png');
    const ogCalled = fetchSpy.mock.calls.some(([u]) =>
      typeof u === 'string' && u.includes('casaroberto-logo'),
    );
    expect(ogCalled).toBe(false);
  });
});

// ── Source 5: og:image (logo-URL-filtered) ────────────────────────────────────

describe('extractLogoUrl — og:image (source 5, logo URLs only)', () => {
  it('accepts og:image when URL contains logo keyword', async () => {
    mockFetchByUrl({
      'casaroberto.com/casaroberto-logo.png': { status: 200, contentType: 'image/png' },
    });
    const result = await extractLogoUrl('https://casaroberto.com', SAMPLE_HTML_WITH_OG_LOGO);
    expect(result).toBe('https://casaroberto.com/casaroberto-logo.png');
  });

  it('handles alternate og:image attribute order', async () => {
    mockFetchByUrl({
      'casaroberto.com/casaroberto-logo.png': { status: 200, contentType: 'image/png' },
    });
    const result = await extractLogoUrl('https://casaroberto.com', HTML_ALT_OG_ATTR_ORDER_LOGO);
    expect(result).toBe('https://casaroberto.com/casaroberto-logo.png');
  });

  it('rejects og:image with "hero" in URL — hero photo guard', async () => {
    mockFetchByUrl({
      'casaroberto.com/home-hero.jpg': { status: 200, contentType: 'image/jpeg' },
      's2/favicons': { status: 404, contentType: 'text/html' },
    });
    const result = await extractLogoUrl('https://casaroberto.com', SAMPLE_HTML_WITH_OG_HERO);
    expect(result).toBeNull();
  });

  it('rejects og:image with no logo keyword in URL', async () => {
    mockFetchByUrl({
      'casaroberto.com/social.jpg': { status: 200, contentType: 'image/jpeg' },
      's2/favicons': { status: 404, contentType: 'text/html' },
    });
    const result = await extractLogoUrl('https://casaroberto.com', SAMPLE_HTML_WITH_OG_GENERIC);
    expect(result).toBeNull();
  });

  it('rejects og:image when Content-Length exceeds 150 KB', async () => {
    mockFetchByUrl({
      'casaroberto.com/casaroberto-logo.png': {
        status: 200,
        contentType: 'image/jpeg',
        contentLength: 200_000,
      },
      's2/favicons': { status: 404, contentType: 'text/html' },
    });
    const result = await extractLogoUrl('https://casaroberto.com', SAMPLE_HTML_WITH_OG_LOGO);
    expect(result).toBeNull();
  });

  it('accepts og:image when Content-Length is below 150 KB', async () => {
    mockFetchByUrl({
      'casaroberto.com/casaroberto-logo.png': {
        status: 200,
        contentType: 'image/png',
        contentLength: 80_000,
      },
    });
    const result = await extractLogoUrl('https://casaroberto.com', SAMPLE_HTML_WITH_OG_LOGO);
    expect(result).toBe('https://casaroberto.com/casaroberto-logo.png');
  });

  it('accepts og:image when Content-Length is absent (no size cap applied)', async () => {
    mockFetchByUrl({
      'casaroberto.com/casaroberto-logo.png': { status: 200, contentType: 'image/png' },
    });
    const result = await extractLogoUrl('https://casaroberto.com', SAMPLE_HTML_WITH_OG_LOGO);
    expect(result).toBe('https://casaroberto.com/casaroberto-logo.png');
  });

  it('rejects og:image that does not start with http', async () => {
    mockFetchByUrl({ 's2/favicons': { status: 404, contentType: 'text/html' } });
    const html = `<meta property="og:image" content="/relative/logo.png" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBeNull();
  });

  it('rejects og:image with /placeholder in path', async () => {
    mockFetchByUrl({ 's2/favicons': { status: 404, contentType: 'text/html' } });
    const html = `<meta property="og:image" content="https://casaroberto.com/placeholder/logo.png" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBeNull();
  });
});

// ── Source 6: twitter:image (logo-URL-filtered) ───────────────────────────────

describe('extractLogoUrl — twitter:image (source 6, logo URLs only)', () => {
  it('accepts twitter:image when URL contains logo keyword', async () => {
    mockFetchByUrl({
      'casaroberto.com/brand-logo.jpg': { status: 200, contentType: 'image/jpeg' },
    });
    const html = `<meta name="twitter:image" content="https://casaroberto.com/brand-logo.jpg" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/brand-logo.jpg');
  });

  it('rejects twitter:image with no logo keyword', async () => {
    mockFetchByUrl({
      'casaroberto.com/twitter-card.jpg': { status: 200, contentType: 'image/jpeg' },
      's2/favicons': { status: 404, contentType: 'text/html' },
    });
    const html = `<meta name="twitter:image" content="https://casaroberto.com/twitter-card.jpg" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBeNull();
  });

  it('supports property= attribute order for twitter:image', async () => {
    mockFetchByUrl({
      'casaroberto.com/brand-logo.jpg': { status: 200, contentType: 'image/jpeg' },
    });
    const html = `<meta property="twitter:image" content="https://casaroberto.com/brand-logo.jpg" />`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/brand-logo.jpg');
  });
});

// ── Source 7: Google Favicon HD ───────────────────────────────────────────────

describe('extractLogoUrl — Google Favicon (source 7)', () => {
  it('returns Google favicon URL when no earlier sources match', async () => {
    mockFetchByUrl({
      's2/favicons': { status: 200, contentType: 'image/png' },
    });
    const result = await extractLogoUrl('https://casaroberto.com');
    expect(result).toContain('google.com/s2/favicons');
    expect(result).toContain('sz=128');
  });

  it('Google fires after filtered og:image fails', async () => {
    mockFetchByUrl({
      'casaroberto.com/social.jpg': { status: 200, contentType: 'image/jpeg' },
      's2/favicons': { status: 200, contentType: 'image/png' },
    });
    // og:image has no logo keyword → filtered → Google fires
    const result = await extractLogoUrl('https://casaroberto.com', SAMPLE_HTML_WITH_OG_GENERIC);
    expect(result).toContain('google.com/s2/favicons');
  });
});

// ── Source 8: nav-img (logo-URL-filtered) ─────────────────────────────────────

describe('extractLogoUrl — nav-img (source 8, logo URLs only)', () => {
  it('accepts nav-img when src URL contains logo keyword', async () => {
    mockFetchByUrl({
      's2/favicons':                         { status: 404, contentType: 'text/html' },
      'casaroberto.com/brand-logo.png':      { status: 200, contentType: 'image/png' },
    });
    const html = `<header><img src="https://casaroberto.com/brand-logo.png" alt="header" /></header>`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/brand-logo.png');
  });

  it('rejects nav-img when src URL has no logo keyword', async () => {
    mockFetchByUrl({
      's2/favicons':                 { status: 404, contentType: 'text/html' },
      'casaroberto.com/marquee-1.jpg': { status: 200, contentType: 'image/jpeg' },
    });
    const html = `<header><img src="https://casaroberto.com/marquee-1.jpg" alt="header" /></header>`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBeNull();
  });

  it('accepts nav-img from <nav> when src URL contains logo keyword', async () => {
    mockFetchByUrl({
      's2/favicons':                      { status: 404, contentType: 'text/html' },
      'casaroberto.com/nav-logo.png':     { status: 200, contentType: 'image/png' },
    });
    const html = `<nav><img src="https://casaroberto.com/nav-logo.png" alt="nav" /></nav>`;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/nav-logo.png');
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

  it('returns null when no rawHtml provided and all network sources fail', async () => {
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
  it('JSON-LD stops the waterfall — apple-touch-icon and Google not called', async () => {
    const fetchSpy = mockFetchByUrl({
      'casaroberto.com/images/logo.png': { status: 200, contentType: 'image/png' },
      'casaroberto.com/apple-icon.png':  { status: 200, contentType: 'image/png' },
      's2/favicons':                     { status: 200, contentType: 'image/png' },
    });
    const html = `
      <script type="application/ld+json">
        {"@type":"Restaurant","logo":"https://casaroberto.com/images/logo.png"}
      </script>
      <link rel="apple-touch-icon" href="/apple-icon.png" />
    `;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/images/logo.png');
    const googleCalled = fetchSpy.mock.calls.some(([u]) =>
      typeof u === 'string' && u.includes('s2/favicons'),
    );
    expect(googleCalled).toBe(false);
  });

  it('apple-touch-icon fires before og:image in the waterfall', async () => {
    const fetchSpy = mockFetchByUrl({
      'casaroberto.com/apple-icon.png':       { status: 200, contentType: 'image/png' },
      'casaroberto.com/casaroberto-logo.png':  { status: 200, contentType: 'image/png' },
    });
    const html = `
      <link rel="apple-touch-icon" href="/apple-icon.png" />
      <meta property="og:image" content="https://casaroberto.com/casaroberto-logo.png" />
    `;
    const result = await extractLogoUrl('https://casaroberto.com', html);
    expect(result).toBe('https://casaroberto.com/apple-icon.png');
    const ogCalled = fetchSpy.mock.calls.some(([u]) =>
      typeof u === 'string' && u.includes('casaroberto-logo'),
    );
    expect(ogCalled).toBe(false);
  });

  it('og:image (source 5) is tried AFTER sources 1–4', async () => {
    const fetchSpy = mockFetchByUrl({
      'casaroberto.com/casaroberto-logo.png': { status: 200, contentType: 'image/png' },
      's2/favicons':                          { status: 200, contentType: 'image/png' },
    });
    // Only og:image is in the HTML — no JSON-LD, no apple-touch-icon, no png-icon, no alt-img
    await extractLogoUrl('https://casaroberto.com', SAMPLE_HTML_WITH_OG_LOGO);
    // Google should NOT have been called — og:image matched first
    const googleCalled = fetchSpy.mock.calls.some(([u]) =>
      typeof u === 'string' && u.includes('s2/favicons'),
    );
    expect(googleCalled).toBe(false);
  });
});
