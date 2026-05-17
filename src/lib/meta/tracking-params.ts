// Client-only tracking param persistence and retrieval.
// Uses sessionStorage with first-touch semantics — never overwrites once set.
// Safe to import in 'use client' components; all functions guard for SSR.

const STORAGE_KEY = 'fsiq_tracking';

export interface StoredTrackingParams {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string;
  utm_term?: string;
  utm_id?: string;
  fbclid?: string;
  gclid?: string;
  fbadid?: string;
  creative_name?: string;
  creative_id?: string;
  campaign?: string;
  landing_page_url?: string;
  referrer?: string;
}

const URL_PARAM_KEYS = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'fbclid',
  'gclid',
  'fbadid',
  'creative_name',
  'creative_id',
  'campaign',
] as const;

// Reads the current URL and writes tracking params to sessionStorage.
// Only writes if sessionStorage is empty (first-touch model).
export function persistTrackingParams(): void {
  if (typeof window === 'undefined') return;
  try {
    if (sessionStorage.getItem(STORAGE_KEY)) return;

    const params = new URLSearchParams(window.location.search);
    const tracked: StoredTrackingParams = {};

    for (const key of URL_PARAM_KEYS) {
      const val = params.get(key);
      if (val) (tracked as Record<string, string>)[key] = val;
    }

    tracked.landing_page_url = window.location.href;
    if (document.referrer) tracked.referrer = document.referrer;

    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(tracked));
  } catch { /* best effort — sessionStorage may be blocked */ }
}

// Returns stored tracking params, or empty object on SSR / parse error.
export function getTrackingParams(): StoredTrackingParams {
  if (typeof window === 'undefined') return {};
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as StoredTrackingParams) : {};
  } catch {
    return {};
  }
}

// Reads fbp/fbc from cookies. Derives fbc from fbclid when _fbc cookie is absent.
export function readMetaCookies(fbclid?: string): { fbp?: string; fbc?: string } {
  if (typeof window === 'undefined') return {};
  try {
    const cookieMap = Object.fromEntries(
      document.cookie.split(';').map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k.trim(), v.join('=')];
      }),
    );
    const fbp = cookieMap['_fbp'] || undefined;
    let fbc = cookieMap['_fbc'] || undefined;
    if (!fbc && fbclid) {
      fbc = `fb.1.${Date.now()}.${fbclid}`;
    }
    return { fbp, fbc };
  } catch {
    return {};
  }
}
