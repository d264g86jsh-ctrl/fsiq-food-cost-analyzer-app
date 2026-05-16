// Fuzzy name-to-domain matching.
// A mismatch lowers confidence but is NOT a blocker.

import { KNOWN_VENDOR_DOMAINS } from '../website/normalize-url';

export interface RelationshipResult {
  websiteRelationshipScore: number; // 0–100
  isKnownVendorDomain: boolean;
  internalFlags: string[];
}

// Known restaurant group / hospitality group domain patterns
const HOSPITALITY_GROUP_PATTERNS = [
  'hospitalitygroup', 'restaurantgroup', 'dininggroup', 'foodgroup',
  'cuisines', 'hospitality', 'concepts', 'bistrogroup',
];

// Known ordering / social platforms (when URL is a platform page, not vendor)
const PLATFORM_PATHS_THAT_ARE_PLAUSIBLE = [
  'toasttab.com', 'order.online', 'olo.com', 'grubhub.com', 'doordash.com',
  'ubereats.com', 'squareup.com', 'instagram.com', 'facebook.com', 'linktr.ee',
  'resy.com', 'opentable.com',
];

export function computeWebsiteRelationship(
  restaurantName: string,
  normalizedUrl: string,
  finalUrl?: string,
): RelationshipResult {
  const flags: string[] = [];

  let domain = '';
  try {
    domain = new URL(finalUrl || normalizedUrl).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return { websiteRelationshipScore: 0, isKnownVendorDomain: false, internalFlags: [] };
  }

  // Known vendor domain → clear non-fit signal
  const isKnownVendorDomain = KNOWN_VENDOR_DOMAINS.some(
    (d) => domain === d || domain.endsWith(`.${d}`),
  );
  if (isKnownVendorDomain) {
    flags.push('known_vendor_domain');
    return { websiteRelationshipScore: 0, isKnownVendorDomain: true, internalFlags: flags };
  }

  // Platform domain (toasttab, instagram, etc.) — plausible, not a vendor
  const isPlatformDomain = PLATFORM_PATHS_THAT_ARE_PLAUSIBLE.some((p) => domain.includes(p));
  if (isPlatformDomain) {
    flags.push('third_party_platform');
    return { websiteRelationshipScore: 50, isKnownVendorDomain: false, internalFlags: flags };
  }

  // Hospitality group domain — plausible
  if (HOSPITALITY_GROUP_PATTERNS.some((p) => domain.includes(p))) {
    flags.push('redirected_to_group_domain');
    return { websiteRelationshipScore: 55, isKnownVendorDomain: false, internalFlags: flags };
  }

  // Compute token similarity between restaurant name and domain
  const score = tokenSimilarity(restaurantName, domain);

  if (score >= 0.8) return { websiteRelationshipScore: 90, isKnownVendorDomain: false, internalFlags: flags };
  if (score >= 0.5) return { websiteRelationshipScore: 70, isKnownVendorDomain: false, internalFlags: flags };
  if (score >= 0.3) return { websiteRelationshipScore: 50, isKnownVendorDomain: false, internalFlags: flags };

  // Low match — still not a blocker, just low confidence
  flags.push('low_name_domain_match');
  return { websiteRelationshipScore: 25, isKnownVendorDomain: false, internalFlags: flags };
}

// Token overlap similarity: what fraction of name tokens appear in domain
function tokenSimilarity(name: string, domain: string): number {
  const nameTokens = tokenize(name);
  const domainStr = domain.replace(/\.(com|net|org|io|co|us|biz|info)$/, '');

  if (nameTokens.length === 0) return 0;

  const matches = nameTokens.filter((t) => t.length > 2 && domainStr.includes(t));
  return matches.length / nameTokens.length;
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'of', 'in', 'at', 'on', 'for', 'to',
  'restaurant', 'grill', 'bar', 'cafe', 'kitchen', 'bistro',
]);
