// Logo extraction waterfall — tries multiple sources in order.
// Validates each candidate before accepting it.
//
// Note: Clearbit (logo.clearbit.com) was removed — the free API is DNS-dead as of 2025.
//
// HTML sources (1–4, 5–6, 8) require page HTML.
// If rawHtml is not provided, the extractor fetches it internally with browser-like
// headers, a 12 s timeout, 403-body reading (Cloudflare challenge pages still contain
// og:image), and one retry on timeout.
//
// Sources 1–4 and 7 are icon-format or explicitly labelled — zero photo false-positives.
// Sources 5–6 are social-sharing tags filtered by URL keyword (logo/brand/favicon/icon)
// and a 150 KB content-length cap to prevent hero photos from reaching the PDF.
//
// Source 1: Schema.org JSON-LD logo (structured data — actual brand logo URL)
// Source 2: apple-touch-icon        (iOS home screen icon — always logo format)
// Source 3: link[rel=icon][png]     (PNG favicon — always logo format)
// Source 4: img with alt="logo"     (explicit semantic label)
// Source 5: og:image                (social sharing — logo-URL-filtered + 150 KB cap)
// Source 6: twitter:image           (social sharing — logo-URL-filtered)
// Source 7: Google Favicon HD       (free, no key — icon format, reliable)
// Source 8: Largest img in header/nav (logo-URL-filtered)

import { extractDomain } from '@/lib/website/normalize-url';

// ── Constants ─────────────────────────────────────────────────────────────────

const SOURCE_TIMEOUT_MS    = 3_000;
const HTML_TIMEOUT_MS      = 12_000;
const HTML_RETRY_MS        = 6_000;
// Social-sharing images (og:image, twitter:image) over this size are almost
// certainly hero/food photos, not logos.
const SOCIAL_IMAGE_MAX_BYTES = 150_000;

// Realistic browser User-Agents — rotated per request to reduce bot-blocking
const USER_AGENTS = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4_1) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Safari/605.1.15',
] as const;

function randomUA(): string {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
}

// ── Logo URL keyword gates ────────────────────────────────────────────────────
//
// Applied to og:image, twitter:image, and nav-img — sources that can return
// arbitrary images. We require at least one positive logo signal and zero
// negative photo/hero signals before spending a HEAD request.

const LOGO_URL_POSITIVE = [
  'logo', 'brand', 'favicon', 'icon', 'logotype', 'wordmark',
  'emblem', 'badge', 'android-chrome', 'apple-touch', 'site-icon',
] as const;

const LOGO_URL_NEGATIVE = [
  'hero', 'banner', 'og-image', 'og_image', 'social',
  'share', 'featured', 'marquee', 'carousel', 'gallery',
  'wallpaper', 'background', 'interior', 'exterior',
  'atmosphere', '1200x630', '1200x628', 'x630', 'x628',
] as const;

/**
 * Returns true only when a URL path has at least one positive logo keyword
 * and zero negative photo/hero keywords. Used to gate social-sharing image
 * sources so they never return hero photos.
 */
export function isLogoLikeUrl(url: string): boolean {
  const path = (url.split('?')[0] ?? '').toLowerCase();
  if (LOGO_URL_NEGATIVE.some((t) => path.includes(t))) return false;
  return LOGO_URL_POSITIVE.some((t) => path.includes(t));
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

    // Source 2: apple-touch-icon (icon format — zero false-positive risk)
    const appleTouchIcon = extractAppleTouchIcon(html);
    if (appleTouchIcon) {
      const resolved = resolveUrl(appleTouchIcon, websiteUrl);
      if (resolved && await isValidImageUrl(resolved)) {
        console.log('[FSIQ LOGO] source: apple-touch-icon');
        return resolved;
      }
    }

    // Source 3: link[rel=icon][type=image/png] (favicon format — zero false-positive risk)
    const pngIcon = extractPngIcon(html);
    if (pngIcon) {
      const resolved = resolveUrl(pngIcon, websiteUrl);
      if (resolved && await isValidImageUrl(resolved)) {
        console.log('[FSIQ LOGO] source: png-icon');
        return resolved;
      }
    }

    // Source 4: img with alt containing "logo" (explicit semantic label)
    const altLogoImage = extractAltLogoImage(html);
    if (altLogoImage) {
      const resolved = resolveUrl(altLogoImage, websiteUrl);
      if (resolved && await isValidImageUrl(resolved)) {
        console.log('[FSIQ LOGO] source: alt-img');
        return resolved;
      }
    }

    // Source 5: og:image — only when URL carries an explicit logo keyword
    // and the image is small enough not to be a hero photo (≤ 150 KB).
    const ogImage = extractOgImage(html);
    if (ogImage) {
      const resolved = resolveUrl(ogImage, websiteUrl);
      if (
        resolved &&
        isLogoLikeUrl(resolved) &&
        isValidImageUrlStructure(resolved) &&
        await isValidImageUrl(resolved, SOCIAL_IMAGE_MAX_BYTES)
      ) {
        console.log('[FSIQ LOGO] source: og-image');
        return resolved;
      }
    }

    // Source 6: twitter:image — same logo-URL gate as og:image
    const twitterImage = extractTwitterImage(html);
    if (twitterImage) {
      const resolved = resolveUrl(twitterImage, websiteUrl);
      if (
        resolved &&
        isLogoLikeUrl(resolved) &&
        await isValidImageUrl(resolved, SOCIAL_IMAGE_MAX_BYTES)
      ) {
        console.log('[FSIQ LOGO] source: twitter-image');
        return resolved;
      }
    }
  }

  // Source 7: Google Favicon HD (always icon-format, no false-positive risk)
  const googleUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  if (await isValidImageUrl(googleUrl)) {
    console.log('[FSIQ LOGO] source: google');
    return googleUrl;
  }

  if (html) {
    // Source 8: img in header/nav — only when the src URL carries a logo keyword
    const navImage = extractNavImage(html);
    if (navImage) {
      const resolved = resolveUrl(navImage, websiteUrl);
      if (resolved && isLogoLikeUrl(resolved) && await isValidImageUrl(resolved)) {
        console.log('[FSIQ LOGO] source: nav-img');
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

/**
 * HEAD-validates an image URL.
 * @param maxContentLengthBytes  Optional upper bound on Content-Length. Pass
 *   SOCIAL_IMAGE_MAX_BYTES for og:image/twitter:image to reject hero photos.
 */
async function isValidImageUrl(url: string, maxContentLengthBytes?: number): Promise<boolean> {
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
    const contentLength = res.headers.get('content-length');
    const bytes = contentLength !== null ? parseInt(contentLength, 10) : null;
    // Reject tracking pixels / blank images (< 200 bytes)
    if (bytes !== null && bytes < 200) return false;
    // Reject oversized images for social-sharing sources (likely hero photos)
    if (maxContentLengthBytes !== undefined && bytes !== null && bytes > maxContentLengthBytes) return false;
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
