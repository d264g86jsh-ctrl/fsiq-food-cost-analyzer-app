// Derives a canonical lead source from UTM params and fbclid.
// Used at submission time to tag GHL contacts and DB records for campaign attribution.
//
// Priority order:
//   1. fbclid present         → 'meta'   (any Meta-ad click carries fbclid)
//   2. utm_source = fb/meta   → 'meta'   (manually tagged Meta traffic)
//   3. utm_source = google    → 'google'
//   4. any other utm_source   → 'organic'
//   5. no attribution at all  → 'direct'

export type LeadSource = 'meta' | 'google' | 'organic' | 'direct';

const META_SOURCES   = new Set(['facebook', 'instagram', 'meta', 'fb', 'ig']);
const GOOGLE_SOURCES = new Set(['google', 'google-ads', 'googleads', 'adwords']);

export function deriveLeadSource(
  utmSource?: string | null,
  fbclid?: string | null,
): LeadSource {
  if (fbclid) return 'meta';
  const src = (utmSource ?? '').toLowerCase().trim();
  if (META_SOURCES.has(src))   return 'meta';
  if (GOOGLE_SOURCES.has(src)) return 'google';
  if (src)                     return 'organic';
  return 'direct';
}
