// Logo extraction waterfall — tries multiple free sources in order.
// Validates each candidate before accepting it.
// Completes within ~10 s total (3 s per source × 3 sources).
//
// Source 1: Clearbit Logo API  (free, no key, reliable for established brands)
// Source 2: Google Favicon HD  (free, no key, covers almost every site)
// Source 3: og:image from HTML (already fetched — no extra request)
// Source 4: null

import { extractDomain } from '@/lib/website/normalize-url';

const SOURCE_TIMEOUT_MS = 3_000;

export async function extractLogoUrl(
  websiteUrl: string,
  rawHtml?: string,
): Promise<string | null> {
  const domain = extractDomain(websiteUrl);
  if (!domain) {
    console.log('[FSIQ LOGO] source: null (no domain)');
    return null;
  }

  // Source 1: Clearbit
  const clearbitUrl = `https://logo.clearbit.com/${domain}`;
  if (await isValidImageUrl(clearbitUrl)) {
    console.log('[FSIQ LOGO] source: clearbit');
    return clearbitUrl;
  }

  // Source 2: Google Favicon HD
  const googleUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`;
  if (await isValidImageUrl(googleUrl)) {
    console.log('[FSIQ LOGO] source: google');
    return googleUrl;
  }

  // Source 3: og:image from existing HTML (no re-fetch)
  if (rawHtml) {
    const ogImage = extractOgImage(rawHtml);
    if (ogImage && isValidOgImageUrl(ogImage)) {
      console.log('[FSIQ LOGO] source: og-image');
      return ogImage;
    }
  }

  console.log('[FSIQ LOGO] source: null');
  return null;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function isValidImageUrl(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(SOURCE_TIMEOUT_MS),
    });
    if (!res.ok) return false;
    const ct = res.headers.get('content-type') ?? '';
    return ct.startsWith('image/');
  } catch {
    return false;
  }
}

function extractOgImage(html: string): string | null {
  const m =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*?)["']/i) ??
    html.match(/<meta[^>]+content=["']([^"']*?)["'][^>]+property=["']og:image["']/i);
  return m ? m[1].trim() : null;
}

function isValidOgImageUrl(url: string): boolean {
  return url.startsWith('http') && url.length > 15 && !url.includes(' ');
}
