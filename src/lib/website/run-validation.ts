// Core website validation logic, extracted from the route handler.
// Imported by both POST /api/validate-website and src/actions/validateWebsite.ts.
// Next.js route files may only export HTTP handlers — shared logic lives here.

import { normalizeUrl, extractDomain } from '@/lib/website/normalize-url';
import { checkWebsite } from '@/lib/website/check-website';
import { headlessFetch } from '@/lib/website/headless-fetch';
import { extractLogoUrl } from '@/lib/website/logo-extractor';
import { detectNationalChain } from '@/lib/qualification/national-chains';
import { computeRestaurantScores } from '@/lib/relevance/classify-restaurant';
import { computeWebsiteRelationship } from '@/lib/relevance/website-relationship';
import { classifyWithClaude, isAmbiguous } from '@/lib/relevance/claude-classifier';
import { computeCountryEligibility } from '@/lib/relevance/location-eligibility';
import type { ValidationResult, ValidateWebsiteRequest, FinalDecision } from '@/lib/website/types';

export async function runValidation(input: ValidateWebsiteRequest): Promise<ValidationResult> {
  const { website, restaurantName } = input;
  const internalFlags: string[] = [];
  const reasons: string[] = [];
  let headlessBrowserUsed = false;

  // Hardcoded no-op Places result — Google Places removed; state dropdown guarantees US.
  const placesResult = { googlePlacesScore: 0, placesCountry: null, googlePlacesQueried: false, internalFlags: [] as string[] };

  // ── Step 1: URL normalization ─────────────────────────────────────────────────
  const normalized = normalizeUrl(website);
  if (!normalized.isValid) {
    internalFlags.push('malformed_url');
    const eligibility = computeCountryEligibility();
    return buildResult({
      finalDecision: 'invalid_website',
      normalizedUrl: website,
      finalUrl: website,
      httpStatus: 0,
      websiteReachabilityStatus: 'invalid',
      restaurantSignalScore: 0,
      negativeSignalScore: 0,
      nationalChainScore: 0,
      websiteRelationshipScore: 0,
      googlePlacesScore: 0,
      ...eligibility,
      headlessBrowserUsed: false,
      googlePlacesQueried: false,
      claudeAiUsed: false,
      websiteLogoHints: [],
      logoUrl: null,
      internalFlags: [...internalFlags, 'malformed_url'],
      reasons: ['malformed_url'],
      userFacingMessage: "That doesn't look like a valid web address.",
      manualReviewRequired: false,
    });
  }

  const normalizedUrl = normalized.normalizedUrl;

  // ── Step 1b: Trusted restaurant merchant platforms ───────────────────────
  const platformMatch = detectTrustedMerchantPlatform(normalizedUrl);
  if (platformMatch?.verified) {
    const eligibility = computeCountryEligibility();
    return buildResult({
      finalDecision: 'verified_restaurant',
      normalizedUrl,
      finalUrl: normalizedUrl,
      httpStatus: 200,
      websiteReachabilityStatus: 'reachable',
      restaurantSignalScore: 60,
      negativeSignalScore: 0,
      nationalChainScore: 0,
      websiteRelationshipScore: 0,
      googlePlacesScore: 0,
      ...eligibility,
      headlessBrowserUsed: false,
      googlePlacesQueried: false,
      claudeAiUsed: false,
      websiteLogoHints: [],
      logoUrl: null,
      internalFlags: [...internalFlags, platformMatch.flag],
      reasons: ['trusted_restaurant_platform'],
      userFacingMessage: null,
      manualReviewRequired: false,
    });
  }

  // ── Step 2: Chain detection — name-only pass ──────────────────────────────
  const nameChainCheck = detectNationalChain({ restaurantName, domain: normalizedUrl });
  if (nameChainCheck.score >= 85) {
    const eligibility = computeCountryEligibility();
    return buildResult({
      finalDecision: 'national_chain',
      normalizedUrl,
      finalUrl: normalizedUrl,
      httpStatus: 0,
      websiteReachabilityStatus: 'blocked',
      restaurantSignalScore: 0,
      negativeSignalScore: 0,
      nationalChainScore: nameChainCheck.score,
      websiteRelationshipScore: 0,
      googlePlacesScore: 0,
      ...eligibility,
      headlessBrowserUsed: false,
      googlePlacesQueried: false,
      claudeAiUsed: false,
      websiteLogoHints: [],
      logoUrl: null,
      internalFlags: [...internalFlags, 'chain_detected_by_name'],
      reasons: [`national_chain:${nameChainCheck.matchedChain ?? 'unknown'}`],
      userFacingMessage:
        "Our program is designed for independent operators and doesn't cover national chains. If you operate an independent concept, please use that website instead.",
      manualReviewRequired: false,
    });
  }

  // ── Step 3: Fetch website ─────────────────────────────────────────────────
  const fetchResult = await checkWebsite(normalizedUrl);
  let { signals } = fetchResult;
  let { finalUrl } = fetchResult;
  internalFlags.push(...fetchResult.reachability.internalFlags);

  if (fetchResult.reachability.status === 'invalid') {
    const eligibility = computeCountryEligibility();
    return buildResult({
      finalDecision: 'invalid_website',
      normalizedUrl,
      finalUrl,
      httpStatus: fetchResult.httpStatus,
      websiteReachabilityStatus: 'invalid',
      restaurantSignalScore: 0,
      negativeSignalScore: 0,
      nationalChainScore: 0,
      websiteRelationshipScore: 0,
      googlePlacesScore: 0,
      ...eligibility,
      headlessBrowserUsed: false,
      googlePlacesQueried: false,
      claudeAiUsed: false,
      websiteLogoHints: [],
      logoUrl: null,
      internalFlags: [...internalFlags],
      reasons: fetchResult.reachability.internalFlags,
      userFacingMessage: fetchResult.reachability.userFacingMessage,
      manualReviewRequired: false,
    });
  }

  // ── Step 4: Headless fallback ─────────────────────────────────────────────
  const needsHeadless =
    fetchResult.reachability.status === 'blocked' ||
    fetchResult.reachability.status === 'thin' ||
    (signals?.hasBotProtection ?? false) ||
    fetchResult.html.length < 500 ||
    hasJsFrameworkShell(fetchResult.html);

  if (needsHeadless) {
    const headlessResult = await headlessFetch(normalizedUrl);
    if (headlessResult) {
      signals = headlessResult.signals;
      finalUrl = headlessResult.finalUrl;
      headlessBrowserUsed = true;
      internalFlags.push('headless_attempted');
    }
  }

  // Start logo extraction concurrently with remaining validation steps.
  // rawHtml comes from the standard fetch (headless doesn't return HTML).
  // Early-exit paths below don't need a logo (they never generate PDFs).
  const logoUrlPromise = extractLogoUrl(finalUrl, fetchResult.html);

  // ── Step 5: Chain detection — domain + page content pass ──────────────────
  const domain = extractDomain(finalUrl);
  const pageChainCheck = detectNationalChain({
    restaurantName,
    domain,
    pageTitle: signals?.pageTitle,
    ogSiteName: signals?.ogSiteName,
    bodyText: signals?.bodyText,
  });
  const nationalChainScore = Math.max(nameChainCheck.score, pageChainCheck.score);

  if (nationalChainScore >= 85) {
    const eligibility = computeCountryEligibility();
    return buildResult({
      finalDecision: 'national_chain',
      normalizedUrl,
      finalUrl,
      httpStatus: fetchResult.httpStatus,
      websiteReachabilityStatus: fetchResult.reachability.status,
      restaurantSignalScore: 0,
      negativeSignalScore: 0,
      nationalChainScore,
      websiteRelationshipScore: 0,
      googlePlacesScore: 0,
      ...eligibility,
      headlessBrowserUsed,
      googlePlacesQueried: false,
      claudeAiUsed: false,
      websiteLogoHints: [],
      logoUrl: null,
      internalFlags: [...internalFlags, 'chain_detected_by_page'],
      reasons: [`national_chain:${pageChainCheck.matchedChain ?? 'unknown'}`],
      userFacingMessage:
        "Our program is designed for independent operators and doesn't cover national chains. If you operate an independent concept, please use that website instead.",
      manualReviewRequired: false,
    });
  }

  // ── Step 6: Signal scoring ────────────────────────────────────────────────
  let scores = signals
    ? computeRestaurantScores(signals, domain)
    : { restaurantSignalScore: 0, negativeSignalScore: 0 };

  const relationship = computeWebsiteRelationship(restaurantName, normalizedUrl, finalUrl);
  internalFlags.push(...relationship.internalFlags);

  if (relationship.isKnownVendorDomain) {
    const eligibility = computeCountryEligibility();
    return buildResult({
      finalDecision: 'clear_non_fit',
      normalizedUrl,
      finalUrl,
      httpStatus: fetchResult.httpStatus,
      websiteReachabilityStatus: fetchResult.reachability.status,
      ...scores,
      nationalChainScore,
      websiteRelationshipScore: 0,
      googlePlacesScore: 0,
      ...eligibility,
      headlessBrowserUsed,
      googlePlacesQueried: false,
      claudeAiUsed: false,
      websiteLogoHints: signals?.logoHints ?? [],
      logoUrl: null,
      internalFlags: [...internalFlags],
      reasons: ['known_vendor_domain'],
      userFacingMessage:
        "This website doesn't appear to match a restaurant or foodservice operation. If this is incorrect, you can still submit and our team will review it.",
      manualReviewRequired: true,
    });
  }

  const contextualScore = computeProtectedRestaurantContextScore({
    domain,
    finalUrl,
    reachabilityStatus: fetchResult.reachability.status,
    scores,
    signals,
    nationalChainScore,
  });
  if (contextualScore) {
    scores = {
      ...scores,
      restaurantSignalScore: Math.max(scores.restaurantSignalScore, contextualScore.restaurantSignalScore),
    };
    internalFlags.push(contextualScore.flag);
  }

  // ── Step 7: Country eligibility ───────────────────────────────────────────
  const eligibility = computeCountryEligibility();
  internalFlags.push(...eligibility.internalFlags);

  // ── Step 8: Rule-based decision ──────────────────────────────────────────
  const ruleBased = applyDecisionRules({
    restaurantSignalScore: scores.restaurantSignalScore,
    negativeSignalScore: scores.negativeSignalScore,
    nationalChainScore,
    googlePlacesScore: placesResult.googlePlacesScore,
    reachabilityStatus: fetchResult.reachability.status,
    signals,
  });

  if (ruleBased) {
    reasons.push(ruleBased.reason);
    const manualReview = shouldFlagManualReview(fetchResult.reachability.status, scores, signals);
    const logoUrl = await logoUrlPromise;
    return buildResult({
      finalDecision: ruleBased.decision,
      normalizedUrl,
      finalUrl,
      httpStatus: fetchResult.httpStatus,
      websiteReachabilityStatus: fetchResult.reachability.status,
      ...scores,
      nationalChainScore,
      websiteRelationshipScore: relationship.websiteRelationshipScore,
      googlePlacesScore: placesResult.googlePlacesScore,
      ...eligibility,
      headlessBrowserUsed,
      googlePlacesQueried: false,
      claudeAiUsed: false,
      websiteLogoHints: signals?.logoHints ?? [],
      logoUrl,
      internalFlags: [...internalFlags],
      reasons,
      userFacingMessage: buildUserMessage(ruleBased.decision),
      manualReviewRequired: manualReview,
    });
  }

  // ── Step 9: Claude tiebreaker (ambiguous only) ───────────────────────────
  let finalDecision: FinalDecision = 'plausible_unverified';
  let claudeAiUsed = false;

  const ambiguous = isAmbiguous({
    restaurantSignalScore: scores.restaurantSignalScore,
    negativeSignalScore: scores.negativeSignalScore,
    nationalChainScore,
    reachabilityStatus: fetchResult.reachability.status,
  });

  if (ambiguous) {
    const claudeResult = await classifyWithClaude({
      restaurantName,
      domain,
      pageTitle: signals?.pageTitle ?? '',
      schemaOrgTypes: signals?.schemaOrgTypes ?? [],
      topPositiveSignals: buildPositiveSignalList(scores, signals),
      topNegativeSignals: buildNegativeSignalList(scores, signals),
      scores,
      reachabilityStatus: fetchResult.reachability.status,
    });
    finalDecision = claudeResult.decision;
    claudeAiUsed = claudeResult.claudeAiUsed;
    reasons.push('claude_tiebreaker');
  } else {
    reasons.push('plausible_unverified_fallback');
  }

  const manualReview = shouldFlagManualReview(fetchResult.reachability.status, scores, signals);
  const logoUrl = await logoUrlPromise;

  return buildResult({
    finalDecision,
    normalizedUrl,
    finalUrl,
    httpStatus: fetchResult.httpStatus,
    websiteReachabilityStatus: fetchResult.reachability.status,
    ...scores,
    nationalChainScore,
    websiteRelationshipScore: relationship.websiteRelationshipScore,
    googlePlacesScore: placesResult.googlePlacesScore,
    ...eligibility,
    headlessBrowserUsed,
    googlePlacesQueried: false,
    claudeAiUsed,
    websiteLogoHints: signals?.logoHints ?? [],
    logoUrl,
    internalFlags: [...internalFlags],
    reasons,
    userFacingMessage: buildUserMessage(finalDecision),
    manualReviewRequired: manualReview,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type ExtractSignalsResult = ReturnType<typeof import('@/lib/website/extract-signals').extractSignals>;

interface RuleResult {
  decision: FinalDecision;
  reason: string;
}

function applyDecisionRules(options: {
  restaurantSignalScore: number;
  negativeSignalScore: number;
  nationalChainScore: number;
  googlePlacesScore: number;
  reachabilityStatus: string;
  signals: ExtractSignalsResult | null;
}): RuleResult | null {
  const { restaurantSignalScore, negativeSignalScore, nationalChainScore, googlePlacesScore } = options;

  if (negativeSignalScore >= 70 && restaurantSignalScore < 30 && googlePlacesScore < 30) {
    return { decision: 'clear_non_fit', reason: 'high_negative_score' };
  }
  if (restaurantSignalScore >= 60 && negativeSignalScore < 40 && nationalChainScore < 85) {
    return { decision: 'verified_restaurant', reason: 'high_restaurant_score' };
  }
  if (googlePlacesScore >= 80 && nationalChainScore < 50 && negativeSignalScore < 60) {
    return { decision: 'verified_restaurant', reason: 'google_places_confirmed' };
  }
  return null;
}

function computeProtectedRestaurantContextScore(options: {
  domain: string;
  finalUrl: string;
  reachabilityStatus: string;
  scores: { restaurantSignalScore: number; negativeSignalScore: number };
  signals: ExtractSignalsResult | null;
  nationalChainScore: number;
}): { restaurantSignalScore: number; flag: string } | null {
  const {
    domain,
    finalUrl,
    reachabilityStatus,
    scores,
    signals,
    nationalChainScore,
  } = options;

  const isProtectedOrThin =
    reachabilityStatus === 'blocked' ||
    reachabilityStatus === 'thin' ||
    (signals?.hasBotProtection ?? false);

  if (!isProtectedOrThin) return null;
  if (scores.negativeSignalScore >= 40 || nationalChainScore >= 50) return null;

  const domainWords = splitDomainWords(domain);
  const pathSegments = splitUrlPathSegments(finalUrl);
  const pageContext = [
    signals?.pageTitle,
    signals?.metaDescription,
    signals?.ogTitle,
    signals?.ogDescription,
    signals?.ogSiteName,
    signals?.ogType,
    ...(signals?.schemaOrgTypes ?? []),
    ...(signals?.schemaOrgNames ?? []),
    ...(signals?.schemaOrgDescriptions ?? []),
    ...(signals?.navLinkTexts ?? []),
    ...(signals?.headingTexts ?? []),
    ...(signals?.buttonTexts ?? []),
    ...pathSegments,
  ].filter(Boolean).join(' ').toLowerCase();
  const context = `${domainWords.join(' ')} ${pageContext}`.toLowerCase();
  if (NON_RESTAURANT_CONTEXT_TERMS.some((term) => context.includes(term))) return null;

  const domainScore = domainWords.reduce((total, word) => total + scoreRestaurantDomainWord(word), 0);
  const metadataScore = scoreRestaurantText(pageContext);
  const pathScore = pathSegments.reduce((total, segment) => total + scoreRestaurantPathSegment(segment), 0);
  const pageHintScore =
    (signals?.hasRestaurantSchema ? 30 : 0) +
    (signals?.hasAgeGate ? 20 : 0) +
    ([...(signals?.navLinkTexts ?? []), ...(signals?.headingTexts ?? []), ...(signals?.buttonTexts ?? [])]
      .some((text) => RESTAURANT_NAV_HINTS.some((hint) => text.includes(hint))) ? 15 : 0);

  const contextScore = domainScore + metadataScore + pathScore + pageHintScore;
  if (contextScore < 30) return null;

  return {
    restaurantSignalScore: 60,
    flag: 'protected_or_thin_restaurant_context',
  };
}

const RESTAURANT_CONTEXT_TERMS = [
  'restaurant', 'food', 'foods', 'dining', 'diner', 'eatery', 'eats',
  'kitchen', 'cafe', 'coffee', 'bakery', 'bistro', 'bar', 'pub', 'tavern',
  'grill', 'bbq', 'barbecue', 'pizza', 'pizzeria', 'taco', 'taqueria',
  'sushi', 'ramen', 'seafood', 'steakhouse', 'smokehouse', 'catering',
  'cuisine', 'cantina', 'brasserie', 'trattoria', 'chophouse', 'brewery',
  'gastropub', 'bodega', 'spirits',
];

const RESTAURANT_NAV_HINTS = ['menu', 'order', 'reservation', 'catering', 'private dining'];

const NON_RESTAURANT_CONTEXT_TERMS = [
  'software', 'platform', 'saas', 'pos', 'pointofsale', 'demo', 'supplier',
  'supplies', 'supply', 'distributor', 'wholesale', 'equipment', 'agency',
  'consulting', 'logistics', 'manufacturer', 'packaging', 'remodeling',
  'catering company',
];

function scoreRestaurantDomainWord(word: string): number {
  if (['restaurant', 'bistro', 'brasserie', 'trattoria', 'taqueria', 'pizzeria', 'steakhouse', 'smokehouse', 'chophouse', 'gastropub'].includes(word)) return 30;
  if (['grill', 'kitchen', 'cafe', 'eatery', 'diner', 'cantina', 'tavern', 'brewery', 'seafood', 'bbq', 'bakery', 'pub', 'bar', 'bodega'].includes(word)) return 20;
  if (word === 'spirits') return 30;
  if (['pizza', 'sushi', 'ramen', 'taco', 'cuisine', 'food', 'foods', 'dining'].includes(word)) return 15;
  if (word === 'catering') return 8;
  return 0;
}

function scoreRestaurantText(text: string): number {
  let score = 0;
  for (const term of RESTAURANT_CONTEXT_TERMS) {
    if (text.includes(term)) score += 6;
  }
  if (text.includes('og:type restaurant') || text.includes('schema.org/restaurant')) score += 20;
  if (text.includes('book a table') || text.includes('private dining')) score += 12;
  return Math.min(score, 30);
}

function scoreRestaurantPathSegment(segment: string): number {
  if (['menu', 'menus', 'reservations', 'reserve', 'book-a-table'].includes(segment)) return 20;
  if (['order', 'order-online', 'hours'].includes(segment)) return 10;
  if (['our-story', 'about-us', 'about', 'catering'].includes(segment)) return 5;
  return 0;
}

function splitUrlPathSegments(url: string): string[] {
  try {
    return new URL(url).pathname
      .split('/')
      .map((segment) => segment.trim().toLowerCase())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function splitDomainWords(domain: string): string[] {
  const root = domain
    .replace(/^www\./, '')
    .replace(/\.(com|net|org|io|co|us|biz|info|restaurant)$/i, '');

  const explicitWords = root
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/gi, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const words = new Set(explicitWords);
  for (const word of explicitWords) {
    for (const term of [...RESTAURANT_CONTEXT_TERMS, ...NON_RESTAURANT_CONTEXT_TERMS]) {
      if (word.includes(term)) words.add(term);
    }
  }

  return [...words];
}

function detectTrustedMerchantPlatform(url: string): { verified: boolean; flag: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
  const pathSegments = parsed.pathname.split('/').filter(Boolean);
  const hasMerchantPath = pathSegments.some((segment) => /[a-z0-9]{3,}/i.test(segment)) &&
    !pathSegments.some((segment) => ['corporate', 'careers', 'pricing', 'demo', 'partners', 'developers'].includes(segment.toLowerCase()));

  if (host === 'toasttab.com' || host === 'squareup.com') return null;

  if (host === 'order.toasttab.com' && hasMerchantPath) {
    return { verified: true, flag: 'trusted_platform_toasttab_merchant' };
  }

  if (host.endsWith('.square.site') && host !== 'square.site') {
    return { verified: true, flag: 'trusted_platform_square_merchant' };
  }

  const wildcardPlatforms = ['popmenu.com', 'bentobox.com', 'chownow.com', 'owner.com', 'bopomenu.com'];
  for (const platform of wildcardPlatforms) {
    if (host.endsWith(`.${platform}`) && host !== platform) {
      return { verified: true, flag: `trusted_platform_${platform.replace(/\.com$/, '')}_merchant` };
    }
  }

  return null;
}

function hasJsFrameworkShell(html: string): boolean {
  if (!html) return false;
  const lower = html.toLowerCase();
  const scriptSignals = [
    'wixstatic.com',
    'wix-code',
    'static.parastorage.com',
    'squarespace.com',
    'static1.squarespace.com',
    'webflow.js',
    'data-wf-page',
    '__next',
    'react-dom',
    'vue.runtime',
    'angular.js',
    'ng-app',
  ];
  if (scriptSignals.some((signal) => lower.includes(signal))) return true;

  const bodyText = lower
    .replace(/<style[\s\S]*?<\/style>/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return bodyText.length < 500 && /<script[^>]+src=/i.test(html);
}

function shouldFlagManualReview(
  reachabilityStatus: string,
  scores: { restaurantSignalScore: number; negativeSignalScore: number },
  signals: ExtractSignalsResult | null,
): boolean {
  if (reachabilityStatus === 'inaccessible') return true;
  if (reachabilityStatus === 'blocked' && scores.restaurantSignalScore < 30) return true;
  if (signals?.hasParkingPage) return true;
  return false;
}

function buildUserMessage(decision: FinalDecision): string | null {
  switch (decision) {
    case 'verified_restaurant':
      return null;
    case 'plausible_unverified':
      return "We weren't able to fully verify this website, but you can still continue. Our team may follow up.";
    case 'clear_non_fit':
      return "This website doesn't appear to match a restaurant or foodservice operation. If this is incorrect, you can still submit and our team will review it.";
    case 'national_chain':
      return "Our program is designed for independent operators and doesn't cover national chains. If you operate an independent concept, please use that website instead.";
    case 'invalid_website':
      return "We couldn't reach that website. Please check the URL and try again.";
    default:
      return null;
  }
}

function buildPositiveSignalList(
  scores: { restaurantSignalScore: number },
  signals: ExtractSignalsResult | null,
): string[] {
  const list: string[] = [];
  if (signals?.hasRestaurantSchema) list.push('Restaurant schema.org type detected');
  if (signals?.navLinkTexts.some((t) => t.includes('menu'))) list.push('Menu navigation link');
  if (signals?.navLinkTexts.some((t) => t.includes('reservation'))) list.push('Reservations navigation link');
  if (signals?.hasAgeGate) list.push('Age gate (bar/alcohol indicator)');
  if (scores.restaurantSignalScore > 40) list.push(`Restaurant signal score: ${scores.restaurantSignalScore}/100`);
  return list;
}

function buildNegativeSignalList(
  scores: { negativeSignalScore: number },
  signals: ExtractSignalsResult | null,
): string[] {
  const list: string[] = [];
  if (signals?.hasVendorSchema) list.push('Vendor/SaaS schema.org type detected');
  if (scores.negativeSignalScore > 40) list.push(`Negative signal score: ${scores.negativeSignalScore}/100`);
  return list;
}

function buildResult(input: ValidationResult): ValidationResult {
  return input;
}
