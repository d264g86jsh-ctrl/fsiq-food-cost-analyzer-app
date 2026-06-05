export type KnownPlatform =
  | 'toasttab'
  | 'instagram'
  | 'facebook'
  | 'linktree'
  | 'resy'
  | 'opentable'
  | 'grubhub'
  | 'doordash'
  | 'ubereats'
  | 'squareup'
  | 'yelp'
  | 'olo'
  | 'twitter'
  | 'tiktok';

export const KNOWN_VENDOR_DOMAINS = [
  'sysco.com',
  'usfoods.com',
  'usfoodservice.com',
  'pfgc.com',
  'gordonfoodservice.com',
  'gfs.com',
  'reinhart.com',
  'benekeith.com',
  'performancefoodgroup.com',
  'unilever.com',
  'nestle.com',
  'kraftheinz.com',
  'conagra.com',
  'tysonfoods.com',
  'jbs.com.br',
  'oie.usda.gov',
];

export interface NormalizeResult {
  normalizedUrl: string;
  isValid: boolean;
  platform: KnownPlatform | null;
  isKnownVendor: boolean;
  originalInput: string;
}

export function normalizeUrl(raw: string): NormalizeResult {
  const original = raw;

  // Trim whitespace, collapse internal spaces
  let input = raw.trim().replace(/\s+/g, '');

  if (!input) {
    return { normalizedUrl: '', isValid: false, platform: null, isKnownVendor: false, originalInput: original };
  }

  // Add scheme if missing
  if (!/^https?:\/\//i.test(input)) {
    input = `https://${input}`;
  }

  let url: URL;
  try {
    url = new URL(input.toLowerCase());
  } catch {
    // One more attempt: lowercase and try again
    try {
      url = new URL(`https://${input.replace(/^https?:\/\//i, '').toLowerCase()}`);
    } catch {
      return { normalizedUrl: input, isValid: false, platform: null, isKnownVendor: false, originalInput: original };
    }
  }

  // Validate: must have a recognizable domain structure (at least one dot in hostname)
  if (!url.hostname.includes('.') || url.hostname.endsWith('.')) {
    return { normalizedUrl: input, isValid: false, platform: null, isKnownVendor: false, originalInput: original };
  }

  // Reject loopback, private, and non-routable addresses immediately — no fetch attempted.
  // http://localhost, http://192.168.1.1, http://10.0.0.1, etc. are never valid restaurant URLs.
  if (isPrivateOrReservedHost(url.hostname)) {
    return { normalizedUrl: input, isValid: false, platform: null, isKnownVendor: false, originalInput: original };
  }

  // Remove trailing slash from pathname
  if (url.pathname !== '/') {
    url.pathname = url.pathname.replace(/\/$/, '');
  }

  const platform = detectPlatform(url.hostname);
  const isKnownVendor = KNOWN_VENDOR_DOMAINS.some((d) => url.hostname === d || url.hostname.endsWith(`.${d}`));

  return {
    normalizedUrl: url.toString(),
    isValid: true,
    platform,
    isKnownVendor,
    originalInput: original,
  };
}

function isPrivateOrReservedHost(hostname: string): boolean {
  // Loopback names
  if (hostname === 'localhost') return true;
  // IPv6 loopback
  if (hostname === '::1' || hostname === '[::1]') return true;
  // IPv4 — validate and check reserved ranges
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (ipv4) {
    const octets = ipv4.slice(1).map(Number);
    if (octets.some((o) => o > 255)) return false; // malformed — let it through to fail
    const [a, b] = octets;
    if (a === 10) return true;                          // 10.0.0.0/8 private
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12 private
    if (a === 192 && b === 168) return true;            // 192.168.0.0/16 private
    if (a === 127) return true;                          // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true;            // 169.254.0.0/16 link-local
    if (a === 0) return true;                            // 0.0.0.0/8 this-network
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 shared address space
  }
  return false;
}

function detectPlatform(hostname: string): KnownPlatform | null {
  if (hostname.includes('toasttab.com')) return 'toasttab';
  if (hostname.includes('instagram.com')) return 'instagram';
  if (hostname.includes('facebook.com')) return 'facebook';
  if (hostname.includes('linktr.ee') || hostname.includes('linktree.com')) return 'linktree';
  if (hostname.includes('resy.com')) return 'resy';
  if (hostname.includes('opentable.com')) return 'opentable';
  if (hostname.includes('grubhub.com')) return 'grubhub';
  if (hostname.includes('doordash.com')) return 'doordash';
  if (hostname.includes('ubereats.com')) return 'ubereats';
  if (hostname.includes('squareup.com') || hostname.includes('square.com')) return 'squareup';
  if (hostname.includes('yelp.com')) return 'yelp';
  if (hostname.includes('olo.com')) return 'olo';
  if (hostname.includes('twitter.com') || hostname.includes('x.com')) return 'twitter';
  if (hostname.includes('tiktok.com')) return 'tiktok';
  return null;
}

export function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}
