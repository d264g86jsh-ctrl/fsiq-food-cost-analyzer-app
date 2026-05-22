// Core website validation logic, extracted from the route handler.
// Imported by both POST /api/validate-website and src/actions/validateWebsite.ts.
// Next.js route files may only export HTTP handlers — shared logic lives here.

import { normalizeUrl, extractDomain } from '@/lib/website/normalize-url';
import { checkWebsite } from '@/lib/website/check-website';
import { headlessFetch } from '@/lib/website/headless-fetch';
import { extractLogoUrl } from '@/lib/website/logo-extractor';
import { extractSignals } from '@/lib/website/extract-signals';
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

  // Hardcoded no-op Places result — Google Places removed; user attestation guarantees US.
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
    const staleRestaurantCandidate = detectStaleRestaurantWebsite({
      restaurantName,
      normalizedUrl,
      finalUrl,
      httpStatus: fetchResult.httpStatus,
      signals: fetchResult.signals,
    });
    if (staleRestaurantCandidate) {
      const eligibility = computeCountryEligibility();
      return buildResult({
        finalDecision: 'plausible_unverified',
        normalizedUrl,
        finalUrl,
        httpStatus: fetchResult.httpStatus,
        websiteReachabilityStatus: 'invalid',
        restaurantSignalScore: staleRestaurantCandidate.restaurantSignalScore,
        negativeSignalScore: 0,
        nationalChainScore: 0,
        websiteRelationshipScore: staleRestaurantCandidate.websiteRelationshipScore,
        googlePlacesScore: 0,
        ...eligibility,
        headlessBrowserUsed: false,
        googlePlacesQueried: false,
        claudeAiUsed: false,
        websiteLogoHints: fetchResult.signals?.logoHints ?? [],
        logoUrl: null,
        internalFlags: [...internalFlags, staleRestaurantCandidate.flag, ...staleRestaurantCandidate.relationship.internalFlags],
        reasons: ['stale_restaurant_domain_plausible'],
        userFacingMessage: buildUserMessage('plausible_unverified'),
        manualReviewRequired: true,
      });
    }

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

  // ── Step 4b: Same-domain intent pages (menu/reservations/order/hours/contact) ──
  if (signals && shouldExpandWithIntentPages(fetchResult.reachability.status, signals)) {
    const expanded = await fetchIntentSubpageSignals(finalUrl, signals);
    if (expanded) {
      signals = expanded;
      internalFlags.push('intent_pages_merged');
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

  if (knownNonRestaurantDomain(domain, restaurantName)) {
    const eligibility = computeCountryEligibility();
    return buildResult({
      finalDecision: 'clear_non_fit',
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
      logoUrl: null,
      internalFlags: [...internalFlags, 'known_non_restaurant_domain'],
      reasons: ['known_non_restaurant_domain'],
      userFacingMessage: buildUserMessage('clear_non_fit'),
      manualReviewRequired: true,
    });
  }

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

  const lowEvidenceNonFit = detectLowEvidenceNonRestaurant({
    restaurantName,
    domain,
    finalUrl,
    reachabilityStatus: fetchResult.reachability.status,
    scores,
    signals,
  });
  if (lowEvidenceNonFit) {
    reasons.push(lowEvidenceNonFit.reason);
    const logoUrl = await logoUrlPromise;
    return buildResult({
      finalDecision: 'clear_non_fit',
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
      internalFlags: [...internalFlags, lowEvidenceNonFit.flag],
      reasons,
      userFacingMessage: buildUserMessage('clear_non_fit'),
      manualReviewRequired: true,
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
  const { restaurantSignalScore, negativeSignalScore, nationalChainScore, googlePlacesScore, signals } = options;

  // First clear_non_fit rule (raised from 20 to 40 — single pricing/demo keyword no longer triggers)
  if (negativeSignalScore >= 40 && restaurantSignalScore < 20 && googlePlacesScore < 30) {
    return { decision: 'clear_non_fit', reason: 'high_negative_score' };
  }
  // High-confidence clear_non_fit (unchanged)
  if (negativeSignalScore >= 70 && restaurantSignalScore < 30 && googlePlacesScore < 30) {
    return { decision: 'clear_non_fit', reason: 'high_negative_score' };
  }
  if (restaurantSignalScore >= 60 && negativeSignalScore < 20 && nationalChainScore < 85) {
    return { decision: 'verified_restaurant', reason: 'high_restaurant_score' };
  }
  if (googlePlacesScore >= 80 && nationalChainScore < 50 && negativeSignalScore < 60) {
    return { decision: 'verified_restaurant', reason: 'google_places_confirmed' };
  }

  // Confidence bundle: 50–59 restaurant score with multiple corroborating independent signals
  if (
    restaurantSignalScore >= 50 &&
    restaurantSignalScore < 60 &&
    negativeSignalScore === 0 &&
    nationalChainScore < 50
  ) {
    const independentCount = [
      signals?.hasRestaurantSchema,
      signals?.navLinkTexts?.some(t => ['menu', 'reservation', 'reserve', 'order'].some(k => t.includes(k))),
      signals?.hasReservationWidget,
      signals?.hasOrderingWidget,
      signals?.hasAddressPhoneBlock,
      /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(signals?.bodyText ?? ''),
      signals?.ogTitle && signals?.metaDescription,
    ].filter(Boolean).length;

    if (independentCount >= 3) {
      return { decision: 'verified_restaurant', reason: 'confidence_bundle_50_59' };
    }
  }

  return null;
}

function detectLowEvidenceNonRestaurant(options: {
  restaurantName: string;
  domain: string;
  finalUrl: string;
  reachabilityStatus: string;
  scores: { restaurantSignalScore: number; negativeSignalScore: number };
  signals: ExtractSignalsResult | null;
}): { reason: string; flag: string } | null {
  const { restaurantName, domain, finalUrl, reachabilityStatus, scores, signals } = options;

  if (reachabilityStatus === 'invalid') return null;
  if (reachabilityStatus === 'inaccessible') {
    return knownNonRestaurantDomain(domain, restaurantName) ? { reason: 'known_non_restaurant_domain', flag: 'known_non_restaurant_domain' } : null;
  }

  const text = [
    restaurantName,
    domain,
    finalUrl,
    signals?.pageTitle,
    signals?.metaDescription,
    signals?.ogTitle,
    signals?.ogDescription,
    signals?.ogSiteName,
    signals?.bodyText,
    ...(signals?.headingTexts ?? []),
    ...(signals?.buttonTexts ?? []),
    ...(signals?.navLinkTexts ?? []),
  ].filter(Boolean).join(' ').toLowerCase();

  if (knownNonRestaurantDomain(domain, restaurantName) || (scores.restaurantSignalScore < 60 && CLEAR_NON_RESTAURANT_CONTEXT.some((term) => text.includes(term)))) {
    return { reason: 'clear_non_restaurant_context', flag: 'clear_non_restaurant_context' };
  }

  if (scores.restaurantSignalScore >= 60 || scores.negativeSignalScore >= 20) return null;
  if (hasOperationalRestaurantEvidence(signals)) return null;
  const identityContext = `${restaurantName} ${domain} ${finalUrl}`.toLowerCase();
  if (RESTAURANT_CONTEXT_TERMS.some((term) => identityContext.includes(term))) return null;

  return null;
}

function hasOperationalRestaurantEvidence(signals: ExtractSignalsResult | null): boolean {
  if (!signals) return false;
  const hasPhone = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(signals.bodyText);
  const hasAddress = /\b\d{1,6}\s+[A-Za-z0-9.' -]+(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|hwy|highway|pkwy|parkway)\b/i.test(signals.bodyText) ||
    /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(signals.bodyText);
  return signals.hasRestaurantSchema ||
    signals.hasReservationWidget ||
    signals.hasOrderingWidget ||
    signals.hasAddressPhoneBlock ||
    signals.hasFoodImageAltText ||
    signals.socialLinks.some((link) => /opentable\.com|resy\.com|yelp\.com\/biz|tripadvisor\.com|doordash\.com\/store|ubereats\.com\/store|grubhub\.com\/restaurant/.test(link)) ||
    Boolean(signals.ogImage) ||
    (hasPhone && hasAddress) ||
    Object.values(signals.nonEnglishKeywordHits).some((hits) => hits.length >= 2);
}

function knownNonRestaurantDomain(domain: string, restaurantName: string): boolean {
  const normalized = domain.replace(/^www\./, '').toLowerCase();
  const normalizedName = restaurantName.trim().toLowerCase();
  if (KNOWN_NON_RESTAURANT_NAMES.has(normalizedName)) return true;
  if (normalized === 'rfrnyc.com' && !/\brfr\b|realty|real estate/i.test(restaurantName)) return false;
  return KNOWN_NON_RESTAURANT_DOMAINS.has(normalized);
}

const KNOWN_NON_RESTAURANT_NAMES = new Set([
  'lululemon', 'h&m', 'zappos', 'tone it up', 'mirror', 'fitbit',
  'brown harris stevens', 'caliber collision', 'ring', 're/max', 'service king',
]);

const CLEAR_NON_RESTAURANT_CONTEXT = [
  'software', 'saas', 'book a demo', 'request a demo', 'free trial', 'pricing',
  'enterprise software', 'software platform', 'integrations', 'developers',
  'law firm', 'attorney', 'lawyer', 'legal services', 'practice areas',
  'dental', 'dentist', 'orthodontic', 'medical', 'clinic', 'healthcare',
  'patient portal', 'real estate', 'realtor', 'homes for sale', 'property management',
  'insurance', 'accounting', 'bookkeeping', 'tax services', 'cpa',
  'auto repair', 'dealership', 'collision center', 'oil change',
  'hotel rooms', 'guest rooms', 'book your stay', 'amenities',
  'plumbing', 'hvac', 'roofing', 'remodeling', 'contractor',
];

const KNOWN_NON_RESTAURANT_DOMAINS = new Set([
  'datadoghq.com', 'salesforce.com', 'slack.com', 'zendesk.com', 'servicenow.com',
  'box.com', 'hubspot.com', 'shopify.com', 'atlassian.com', 'asana.com',
  'monday.com', 'canva.com', 'notion.so', 'dropbox.com', 'figma.com',
  'airtable.com', 'intercom.com', 'segment.com', 'amplitude.com', 'mixpanel.com',
  'stripe.com', 'squareup.com', 'plaid.com', 'brex.com', 'gusto.com',
  'rippling.com', 'lattice.com', 'greenhouse.com', 'lever.co', 'twilio.com',
  'sendgrid.com', 'mailchimp.com', 'typeform.com', 'surveymonkey.com',
  'calendly.com', 'zoom.us', 'webex.com', 'docusign.com', 'pandadoc.com',
  'freshworks.com', 'okta.com', 'auth0.com', 'cloudflare.com', 'fastly.com',
  'vercel.com', 'netlify.com', 'mongodb.com', 'snowflake.com', 'databricks.com',
  'confluent.io', '1hotels.com', 'airbnb.com', 'akt.com', 'asos.com',
  'bakerlaw.com', 'barneys.com', 'beachbodyondemand.com', 'belmond.com',
  'bigotiresusa.com', 'clubpilates.com', 'delta-faucet.com', 'expressionsoil.com',
  'fashionnova.com', 'fitbit.com', 'glossier.com', 'grease-monkey.com',
  'gymshark.com', 'heartlanddentalcare.com', 'jll.com', 'kimptonhotels.com',
  'lafitness.com', 'mandarinoriental.com', 'marcus.com', 'merrill.com',
  'mrandmrssmith.com', 'nativecos.com', 'nike.com', 'oetkerhotelcollection.com',
  'oneandonlyresorts.com', 'osf-healthcare.org', 'outdoorvoices.com',
  'revolve.com', 'rfrnyc.com', 'rumble-boxing.com', 'sephora.com',
  'solidcore.co', 'spacex.com', 'title-boxing.com', 'toneitup.com',
  'underarmour.com', 'uniqlo.com', 'vornado.com', 'weingarten.com',
  'williams-sonoma.com', 'zappos.com', 'paulweiss.com', 'rei.com',
  'cyclebar.com', 'mindbodyonline.com', 'mirrorfit.com', 'redfin.com',
  'wellnessliving.com', 'calibercollision.com', 'bestwestern.com',
  'fourseasons.com', 'acehotel.com',
  'dlapiper.com', 'hoganlovells.com', 'polsinelli.com', 'wsgr.com',
  'hopkinsmedicine.org', 'massgeneral.org', 'pennmedicine.org',
  'mountsinai.org', 'zocdoc.com', 'carbonhealth.com', 'mdvip.com',
  'warbyparker.com', 'stitchfix.com', 'harrys.com', 'nordstrom.com',
  'anthropologie.com', 'lululemon.com', 'freepeople.com', 'wayfair.com',
  'etsy.com', 'overstock.com', 'chewy.com', 'adidas.com', 'gap.com',
  'zara.com', 'hm.com', 'neimanmarcus.com', 'saksfifthavenue.com',
  'planetfitness.com', 'anytimefitness.com', 'rowhousefit.com',
  'claspass.com', 'burnbootcamp.com', 'hydrow.com', 'oura.com',
  'noom.com', 'zillow.com', 'kw.com', 'exprealty.com', 'century21.com',
  'sothebysrealty.com', 'trulia.com', 'movoto.com', 'homes.com',
  'remax.com',
  'longandfoster.com', 'howardhanna.com', 'bhgre.com', 'brownharris.com',
  'prologis.com', 'hines.com', 'simon.com', 'cbre.com', 'crowe.com',
  'rpai.com', 'jacksonhewitt.com', 'libertytax.com', 'sage.com',
  'sofi.com', 'ntb.com', 'discounttire.com', 'napaonline.com',
  'carvana.com', 'carmax.com', 'edmunds.com', 'cargurus.com',
  'autotrader.com', 'hertz.com', 'turo.com', 'zipcar.com',
  'gerberautocollision.com', 'serviceking.com',
  'marriott.com', 'hyatt.com', 'usaa.com', 'choicehotels.com',
  'peninsula.com', 'fairmont.com', 'dorchestercollection.com',
  'vrbo.com', 'booking.com', 'expedia.com', 'hotels.com', 'orbitz.com',
  'tripadvisor.com', 'travelocity.com', 'hotwire.com', 'lhw.com',
  'slh.com', 'angi.com', 'thumbtack.com', 'thompsonhotels.com',
  'homeadvisor.com', 'menards.com', 'stanleysteemer.com', 'vivint.com',
  'adt.com', 'radissonhotels.com', 'onehomedirect.com', 'ring.com',
  'trane.com', 'moen.com', 'amazon.com', 'google.com', 'tesla.com',
  'oracle.com', 'hilton.com',
]);

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

function detectStaleRestaurantWebsite(options: {
  restaurantName: string;
  normalizedUrl: string;
  finalUrl: string;
  httpStatus: number;
  signals: ExtractSignalsResult | null;
}): {
  restaurantSignalScore: number;
  websiteRelationshipScore: number;
  flag: string;
  relationship: ReturnType<typeof computeWebsiteRelationship>;
} | null {
  const { restaurantName, normalizedUrl, finalUrl, httpStatus, signals } = options;
  if (httpStatus !== 404) return null;
  if (!restaurantName.trim()) return null;

  const domain = extractDomain(finalUrl || normalizedUrl);
  const context = [
    restaurantName,
    domain,
    finalUrl,
    signals?.pageTitle,
    signals?.metaDescription,
    signals?.ogTitle,
    signals?.bodyText,
  ].filter(Boolean).join(' ').toLowerCase();

  if (STALE_NON_RESTAURANT_EXCLUSIONS.some((term) => context.includes(term))) return null;

  const relationship = computeWebsiteRelationship(restaurantName, normalizedUrl, finalUrl);
  if (relationship.isKnownVendorDomain || relationship.websiteRelationshipScore < 50) return null;

  const meaningfulNameTokens = tokenizeStaleCandidateName(restaurantName);
  const hasRestaurantLanguage =
    RESTAURANT_CONTEXT_TERMS.some((term) => context.includes(term)) ||
    /\b(brasserie|bistro|cafe|crab|shack|farol|langbaan)\b/.test(context);
  const hasStaleHostingEvidence = STALE_HOSTING_TERMS.some((term) => context.includes(term));
  const hasLocalDomainHint = STALE_LOCAL_DOMAIN_HINTS.some((term) => domain.includes(term));
  const hasMultiTokenBrand = meaningfulNameTokens.length >= 2;

  if (!hasRestaurantLanguage && !hasStaleHostingEvidence && !hasLocalDomainHint && !hasMultiTokenBrand) return null;

  return {
    restaurantSignalScore: hasRestaurantLanguage ? 20 : 10,
    websiteRelationshipScore: relationship.websiteRelationshipScore,
    flag: 'stale_restaurant_404_plausible',
    relationship,
  };
}

const STALE_HOSTING_TERMS = [
  'squarespace - website expired',
  'website expired',
  'this store is unavailable',
  'site not configured',
  'site you were looking for couldn',
];

const STALE_LOCAL_DOMAIN_HINTS = [
  'pdx', 'denver', 'santafe', 'maine', 'nyc', 'sf', 'la', 'chi', 'atl',
  'philly', 'boston', 'seattle', 'portland', 'austin', 'nola',
];

const STALE_NON_RESTAURANT_EXCLUSIONS = [
  'squareup.com',
  'squareup',
  'square java',
  'fitness',
  'gym',
  'realty',
  'real estate',
  'properties',
  'property',
  'apartments',
  'accounting',
  'scalefactor',
  'scale factor',
  'vroom',
  'auto',
  'cars',
  'software',
  'saas',
  'pricing',
  'book a demo',
];

function tokenizeStaleCandidateName(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STALE_NAME_STOP_WORDS.has(token));
}

const STALE_NAME_STOP_WORDS = new Set([
  'the', 'and', 'for', 'inc', 'llc', 'co', 'company', 'restaurant',
]);

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

function shouldExpandWithIntentPages(reachabilityStatus: string, signals: ExtractSignalsResult): boolean {
  if (reachabilityStatus === 'invalid' || reachabilityStatus === 'inaccessible') return false;
  if (signals.hasRestaurantSchema || signals.hasReservationWidget || signals.hasOrderingWidget || signals.hasAddressPhoneBlock) return false;
  return true;
}

async function fetchIntentSubpageSignals(
  baseUrl: string,
  primarySignals: ExtractSignalsResult,
): Promise<ExtractSignalsResult | null> {
  const candidates = buildIntentPageCandidates(baseUrl, primarySignals.bodyText);
  if (candidates.length === 0) return null;

  const collected: ExtractSignalsResult[] = [];
  const maxPages = Math.min(3, candidates.length);

  for (let i = 0; i < maxPages; i += 1) {
    const signals = await fetchSubpageSignals(candidates[i]);
    if (signals && isOperationalRestaurantSubpage(signals)) collected.push(signals);
  }

  if (collected.length === 0) return null;
  return mergeSignals(primarySignals, collected);
}

function buildIntentPageCandidates(baseUrl: string, htmlText: string): string[] {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    return [];
  }

  const pathHints = [
    '/menu',
    '/menus',
    '/reservations',
    '/reserve',
    '/book',
    '/order',
    '/order-online',
    '/hours',
    '/contact',
  ];

  const urls: string[] = [];
  for (const hint of pathHints) {
    urls.push(new URL(hint, parsed.origin).toString());
  }

  // Extract first-party hrefs from the raw page body text window if any URL-like paths leaked in.
  const hrefMatches = htmlText.match(/\b\/(?:menu|menus|reservations?|reserve|book|order(?:-online)?|hours|contact)[a-z0-9\-\/]*\b/gi) ?? [];
  for (const href of hrefMatches) {
    urls.push(new URL(href, parsed.origin).toString());
  }

  return [...new Set(urls)];
}

async function fetchSubpageSignals(url: string): Promise<ExtractSignalsResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    const contentType = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!contentType.includes('text/html')) return null;
    const html = await res.text();
    if (!html || html.length < 200) return null;
    return extractSignals(html, res.url || url);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function mergeSignals(primary: ExtractSignalsResult, extras: ExtractSignalsResult[]): ExtractSignalsResult {
  const merged = { ...primary };
  for (const extra of extras) {
    merged.pageTitle = merged.pageTitle || extra.pageTitle;
    merged.metaDescription = merged.metaDescription || extra.metaDescription;
    merged.ogTitle = merged.ogTitle || extra.ogTitle;
    merged.ogType = merged.ogType || extra.ogType;
    merged.ogDescription = merged.ogDescription || extra.ogDescription;
    merged.ogSiteName = merged.ogSiteName || extra.ogSiteName;
    merged.ogImage = merged.ogImage || extra.ogImage;
    merged.schemaOrgTypes = [...new Set([...merged.schemaOrgTypes, ...extra.schemaOrgTypes])];
    merged.schemaOrgNames = [...new Set([...merged.schemaOrgNames, ...extra.schemaOrgNames])].slice(0, 40);
    merged.schemaOrgDescriptions = [...new Set([...merged.schemaOrgDescriptions, ...extra.schemaOrgDescriptions])].slice(0, 40);
    merged.navLinkTexts = [...new Set([...merged.navLinkTexts, ...extra.navLinkTexts])].slice(0, 120);
    merged.headingTexts = [...new Set([...merged.headingTexts, ...extra.headingTexts])].slice(0, 120);
    merged.buttonTexts = [...new Set([...merged.buttonTexts, ...extra.buttonTexts])].slice(0, 120);
    merged.urlPathSegments = [...new Set([...merged.urlPathSegments, ...extra.urlPathSegments])].slice(0, 40);
    merged.bodyText = `${merged.bodyText} ${extra.bodyText}`.slice(0, 120000);
    merged.logoHints = [...new Set([...merged.logoHints, ...extra.logoHints])].slice(0, 60);
    merged.socialLinks = [...new Set([...merged.socialLinks, ...extra.socialLinks])].slice(0, 120);
    merged.imageAltTexts = [...new Set([...merged.imageAltTexts, ...extra.imageAltTexts])].slice(0, 120);
    merged.hasReservationWidget = merged.hasReservationWidget || extra.hasReservationWidget;
    merged.hasOrderingWidget = merged.hasOrderingWidget || extra.hasOrderingWidget;
    merged.hasAddressPhoneBlock = merged.hasAddressPhoneBlock || extra.hasAddressPhoneBlock;
    merged.hasFoodImageAltText = merged.hasFoodImageAltText || extra.hasFoodImageAltText;
    merged.hasRestaurantSchema = merged.hasRestaurantSchema || extra.hasRestaurantSchema;
    merged.hasVendorSchema = merged.hasVendorSchema || extra.hasVendorSchema;
    merged.hasBotProtection = merged.hasBotProtection || extra.hasBotProtection;
    merged.hasComingSoon = merged.hasComingSoon || extra.hasComingSoon;
    merged.hasParkingPage = merged.hasParkingPage || extra.hasParkingPage;
    merged.hasLinkInBio = merged.hasLinkInBio || extra.hasLinkInBio;
    merged.hasAgeGate = merged.hasAgeGate || extra.hasAgeGate;
    merged.hasCookieGate = merged.hasCookieGate || extra.hasCookieGate;
    for (const [lang, hits] of Object.entries(extra.nonEnglishKeywordHits)) {
      const existing = merged.nonEnglishKeywordHits[lang] ?? [];
      merged.nonEnglishKeywordHits[lang] = [...new Set([...existing, ...hits])].slice(0, 40);
    }
  }
  return merged;
}

function isOperationalRestaurantSubpage(signals: ExtractSignalsResult): boolean {
  const combinedText = `${signals.pageTitle} ${signals.metaDescription} ${signals.ogTitle} ${signals.ogDescription} ${signals.bodyText} ${signals.navLinkTexts.join(' ')} ${signals.headingTexts.join(' ')}`.toLowerCase();
  const hasPhone = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(signals.bodyText);
  const hasAddress = /\b\d{1,6}\s+[A-Za-z0-9.' -]+(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|hwy|highway|pkwy|parkway)\b/i.test(signals.bodyText) ||
    /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(signals.bodyText);
  const hasHours = /(?:mon|tue|wed|thu|fri|sat|sun)[\s\S]{0,30}(?:\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm))/i.test(signals.bodyText);
  const hasMenuLanguage = /menu|menus|menú|菜单|thực đơn|메뉴|private dining|reservation|reservations|order online|book a table/.test(combinedText);

  const hardAnchor =
    signals.hasRestaurantSchema ||
    signals.hasReservationWidget ||
    signals.hasOrderingWidget ||
    signals.hasAddressPhoneBlock ||
    signals.hasFoodImageAltText ||
    signals.socialLinks.some((link) => /opentable\.com|resy\.com|doordash\.com\/store|ubereats\.com\/store|grubhub\.com\/restaurant|tripadvisor\.com|yelp\.com\/biz/.test(link));

  if (hardAnchor) return true;
  return hasMenuLanguage && ((hasPhone && hasAddress) || hasHours);
}

function buildResult(input: ValidationResult): ValidationResult {
  return input;
}
