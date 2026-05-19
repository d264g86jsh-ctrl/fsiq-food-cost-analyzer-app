// Logo extraction waterfall — tries multiple sources in order.
// Validates each candidate before accepting it.
//
// Note: Clearbit (logo.clearbit.com) was removed — the free API is DNS-dead as of 2025.
//
// HTML sources (1–5, 7–8) require page HTML.
// If rawHtml is not provided, the extractor fetches it internally with browser-like
// headers, a 12 s timeout, 403-body reading (Cloudflare challenge pages still contain
// og:image), and one retry on timeout.
//
// Source 1: Schema.org JSON-LD logo (structured data — actual brand logo URL)
// Source 2: og:image                (social sharing image — HEAD validated)
// Source 3: twitter:image           (fallback to og:image)
// Source 4: apple-touch-icon        (iOS home screen icon — high quality PNG)
// Source 5: link[rel=icon][png]     (PNG favicon)
// Source 6: Google Favicon HD       (free, no key — last resort external API)
// Source 7: Largest img in header/nav
// Source 8: img with alt="logo"

import { extractDomain } from '@/lib/website/normalize-url';

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_TIMEOUT_MS  = 3_000;
const HTML_TIMEOUT_MS    = 12_000;
const HTML_RETRY_MS      = 6_000;

// Realistic browser User-Agents — rotated per request to reduce bot-blocking
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
] as const;

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function extractLogoUrl(
  websiteUrl: string,
  rawHtml?: string,
): Promise<string | null> {
  const domain = extractDomain(websiteUrl);
  if (!domain) {
    console.log('[FSIQ LOGO] source: null (no domain)');
    return null;
  }

  // If the caller didn't supply HTML, try fetching it ourselves with browser-like
  // headers. This recovers cases where the validation step couldn't fetch HTML
  // (bot protection, timeouts) but the page is reachable with better headers.
  const html = rawHtml ?? await fetchHtmlInternal(websiteUrl);

  if (html) {
    // Source 1: Schema.org JSON-LD logo
    const jsonLdLogo = extractJsonLdLogo(html);
    if (jsonLdLogo) {
      const resolved = resolveUrl(jsonLdLogo, websiteUrl);
      if (resolved && await isValidImageUrl(resolved)) {
        console.log('[FSIQ LOGO] source: json-ld');
        return resolved;
      }
    }

    // Source 2: og:image (HEAD validated)
    const ogImage = extractOgImage(html);
    if (ogImage && isValidImageUrlStructure(ogImage)) {
      const resolved = resolveUrl(ogImage, websiteUrl);
      if (resolved && await isValidImageUrl(resolved)) {
        console.log('[FSIQ LOGO] source: og-image');
        return resolved;
      }
    }

    // Source 3: twitter:image
    const twitterImage = extractTwitterImage(html);
    if (twitterImage) {
      const resolved = resolveUrl(twitterImage, websiteUrl);
      if (resolved && await isValidImageUrl(resolved)) {
        console.log('[FSIQ LOGO] source: twitter-image');
        return resolved;
      }
    }

    // Source 4: apple-touch-icon
    const appleTouchIcon = extractAppleTouchIcon(html);
    if (appleTouchIcon) {
      const resolved = resolveUrl(appleTouchIcon, websiteUrl);
      if (resolved && await isValidImageUrl(resolved)) {
        console.log('[FSIQ LOGO] source: apple-touch-icon');
        return resolved;
      }
    }

    // Source 5: link[rel=icon][type=image/png]
    const pngIcon = extractPngIcon(html);
    if (pngIcon) {
      const resolved = resolveUrl(pngIcon, websiteUrl);
      if (resolved && await isValidImageUrl(resolved)) {
        console.log('[FSIQ LOGO] source: png-icon');
        return resolved;
      }
    }
  }

  // Source 6: Google Favicon HD (external API — last resort before image extraction)
  const googleUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  if (await isValidImageUrl(googleUrl)) {
    console.log('[FSIQ LOGO] source: google');
    return googleUrl;
  }

  if (html) {
    // Source 7: Largest img in header/nav
    const navImage = extractNavImage(html);
    if (navImage) {
      const resolved = resolveUrl(navImage, websiteUrl);
      if (resolved && await isValidImageUrl(resolved)) {
        console.log('[FSIQ LOGO] source: nav-img');
        return resolved;
      }
    }

    // Source 8: img with alt containing "logo"
    const altLogoImage = extractAltLogoImage(html);
    if (altLogoImage) {
      const resolved = resolveUrl(altLogoImage, websiteUrl);
      if (resolved && await isValidImageUrl(resolved)) {
        console.log('[FSIQ LOGO] source: alt-img');
        return resolved;
      }
    }
  }

  console.log('[FSIQ LOGO] source: null');
  return null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Fetch page HTML for logo extraction with browser-like headers.
 * On 403 (Cloudflare challenge), reads the body anyway — challenge pages often
 * contain og:image and apple-touch-icon in the HTML.
 * Retries once with a shorter timeout on initial timeout.
 */
async function fetchHtmlInternal(url: string): Promise<string | null> {
  const attempt = async (timeoutMs: number): Promise<string | null> => {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent':      randomUA(),
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      redirect: 'follow',
    });
    // Accept 200 responses and 403 Cloudflare challenges (both have usable HTML)
    if (!res.ok && res.status !== 403) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('html') && !ct.includes('text')) return null;
    return await res.text();
  };

  try {
    return await attempt(HTML_TIMEOUT_MS);
  } catch (err) {
    const isTimeout =
      err instanceof Error &&
      (err.name === 'TimeoutError' || err.name === 'AbortError');
    if (isTimeout) {
      // Retry once with shorter timeout
      try { return await attempt(HTML_RETRY_MS); } catch { return null; }
    }
    return null;
  }
}

/**
 * Resolve a potentially relative URL against a base URL.
 * Returns null if the result can't be parsed.
 */
function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).href;
  } catch {
    return null;
  }
}

/**
 * Checks URL structure before making a HEAD request.
 * Rejects known placeholders, non-http schemes, etc.
 */
function isValidImageUrlStructure(url: string): boolean {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;
  if (url.length <= 15) return false;
  if (url.includes(' ')) return false;
  if (
    url.includes('/placeholder') ||
    url.includes('/default-') ||
    url.includes('/noimage') ||
    url.includes('/no-image') ||
    url.includes('/blank.')
  ) {
    return false;
  }
  return true;
}

async function isValidImageUrl(url: string): Promise<boolean> {
  // Structure checks before spending network time
  if (!isValidImageUrlStructure(url)) return false;

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
      headers: {
        'User-Agent':      randomUA(),
        'Accept':          'image/webp,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return false;
    // Reject ICO files — poor quality for PDF logos
    if (ct === 'image/x-icon' || ct === 'image/vnd.microsoft.icon') return false;
    // Reject tracking pixels / blank images (Content-Length < 200 bytes)
    const contentLength = res.headers.get('content-length');
    if (contentLength !== null && parseInt(contentLength, 10) < 200) return false;
    return true;
  } catch {
    return false;
  }
}

// ── HTML extraction helpers ───────────────────────────────────────────────────

function extractOgImage(html: string): string | null {
  const m =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*?)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']*?)["'][^>]+property=["']og:image["']/i);
  return m ? m[1].trim() : null;
}

function extractJsonLdLogo(html: string): string | null {
  const scriptPattern = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = scriptPattern.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1]);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        const logo = item?.logo;
        if (!logo) continue;
        // logo as string
        if (typeof logo === 'string' && logo.length > 0) return logo;
        // logo as ImageObject
        if (typeof logo === 'object' && typeof logo.url === 'string' && logo.url.length > 0) {
          return logo.url;
        }
      }
    } catch {
      // malformed JSON-LD — skip
    }
  }
  return null;
}

function extractTwitterImage(html: string): string | null {
  const m =
    html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']*?)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']*?)["'][^>]+name=["']twitter:image["']/i) ??
    html.match(/<meta[^>]+property=["']twitter:image["'][^>]+content=["']([^"']*?)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']*?)["'][^>]+property=["']twitter:image["']/i);
  return m ? m[1].trim() : null;
}

function extractAppleTouchIcon(html: string): string | null {
  const m =
    html.match(/<link[^>]+rel=["']apple-touch-icon(?:-precomposed)?["'][^>]+href=["']([^"']*?)["']/i) ??
    html.match(/<link[^>]+href=["']([^"']*?)["'][^>]+rel=["']apple-touch-icon(?:-precomposed)?["']/i);
  return m ? m[1].trim() : null;
}

function extractPngIcon(html: string): string | null {
  const m =
    html.match(/<link[^>]+rel=["']icon["'][^>]+type=["']image\/png["'][^>]+href=["']([^"']*?)["']/i) ??
    html.match(/<link[^>]+type=["']image\/png["'][^>]+rel=["']icon["'][^>]+href=["']([^"']*?)["']/i) ??
    html.match(/<link[^>]+href=["']([^"']*?)["'][^>]+rel=["']icon["'][^>]+type=["']image\/png["']/i) ??
    html.match(/<link[^>]+href=["']([^"']*?)["'][^>]+type=["']image\/png["'][^>]+rel=["']icon["']/i);
  return m ? m[1].trim() : null;
}

function extractNavImage(html: string): string | null {
  // Match first <img src="..."> inside <header ...> or <nav ...>
  const headerMatch = html.match(/<header[^>]*>[\s\S]*?<img[^>]+src=["']([^"']*?)["']/i);
  if (headerMatch) return headerMatch[1].trim();
  const navMatch = html.match(/<nav[^>]*>[\s\S]*?<img[^>]+src=["']([^"']*?)["']/i);
  if (navMatch) return navMatch[1].trim();
  // Match <div> or other tag where class/id contains "logo", "header", or "nav"
  const logoContainerMatch = html.match(
    /<(?:div|section|span)[^>]+(?:class|id)=["'][^"']*(?:logo|header|nav)[^"']*["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']*?)["']/i,
  );
  if (logoContainerMatch) return logoContainerMatch[1].trim();
  return null;
}

function extractAltLogoImage(html: string): string | null {
  // Match <img ... alt="...logo..."> where alt contains "logo" (case-insensitive)
  const patterns = [
    /<img[^>]+src=["']([^"']*?)["'][^>]+alt=["'][^"']*logo[^"']*["']/i,
    /<img[^>]+alt=["'][^"']*logo[^"']*["'][^>]+src=["']([^"']*?)["']/i,
  ];
  for (const pattern of patterns) {
    const m = html.match(pattern);
    if (m) return m[1].trim();
  }
  return null;
}
