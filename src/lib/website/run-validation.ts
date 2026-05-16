// Core website validation logic, extracted from the route handler.
// Imported by both POST /api/validate-website and src/actions/validateWebsite.ts.
// Next.js route files may only export HTTP handlers — shared logic lives here.

import { normalizeUrl, extractDomain } from '@/lib/website/normalize-url';
import { checkWebsite } from '@/lib/website/check-website';
import { headlessFetch } from '@/lib/website/headless-fetch';
import { detectNationalChain } from '@/lib/qualification/national-chains';
import { computeRestaurantScores } from '@/lib/relevance/classify-restaurant';
import { computeWebsiteRelationship } from '@/lib/relevance/website-relationship';
import { queryGooglePlaces } from '@/lib/relevance/google-places';
import { validateZipCode, computeCountryEligibility } from '@/lib/relevance/location-eligibility';
import { classifyWithClaude, isAmbiguous } from '@/lib/relevance/claude-classifier';
import type { ValidationResult, ValidateWebsiteRequest, FinalDecision } from '@/lib/website/types';

export async function runValidation(input: ValidateWebsiteRequest): Promise<ValidationResult> {
  const { website, restaurantName, zipCode, conceptType } = input;
  const internalFlags: string[] = [];
  const reasons: string[] = [];
  let headlessBrowserUsed = false;

  // ── Step 1: ZIP validation ────────────────────────────────────────────────
  const zipResult = validateZipCode(zipCode);
  internalFlags.push(...zipResult.internalFlags);

  if (zipResult.status === 'non_us_format') {
    const eligibility = computeCountryEligibility({
      zipStatus: zipResult.status,
      googlePlacesQueried: false,
    });
    return buildResult({
      finalDecision: 'clear_non_fit',
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
      internalFlags: [...internalFlags, ...eligibility.internalFlags],
      reasons: ['non_us_postal_code'],
      userFacingMessage: zipResult.userFacingMessage,
      manualReviewRequired: false,
    });
  }

  // ── Step 2: URL normalization ─────────────────────────────────────────────
  const normalized = normalizeUrl(website);
  if (!normalized.isValid) {
    internalFlags.push('malformed_url');
    const eligibility = computeCountryEligibility({ zipStatus: zipResult.status, googlePlacesQueried: false });
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
      internalFlags: [...internalFlags, 'malformed_url'],
      reasons: ['malformed_url'],
      userFacingMessage: "That doesn't look like a valid web address.",
      manualReviewRequired: false,
    });
  }

  const normalizedUrl = normalized.normalizedUrl;

  // ── Step 3: Chain detection — name-only pass ──────────────────────────────
  const nameChainCheck = detectNationalChain({ restaurantName, domain: normalizedUrl });
  if (nameChainCheck.score >= 85) {
    const eligibility = computeCountryEligibility({ zipStatus: zipResult.status, googlePlacesQueried: false });
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
      internalFlags: [...internalFlags, 'chain_detected_by_name'],
      reasons: [`national_chain:${nameChainCheck.matchedChain ?? 'unknown'}`],
      userFacingMessage:
        "Our program is designed for independent operators and doesn't cover national chains. If you operate an independent concept, please use that website instead.",
      manualReviewRequired: false,
    });
  }

  // ── Step 4: Fetch website ─────────────────────────────────────────────────
  const fetchResult = await checkWebsite(normalizedUrl);
  let { signals } = fetchResult;
  let { finalUrl } = fetchResult;
  internalFlags.push(...fetchResult.reachability.internalFlags);

  if (fetchResult.reachability.status === 'invalid') {
    const eligibility = computeCountryEligibility({ zipStatus: zipResult.status, googlePlacesQueried: false });
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
      internalFlags: [...internalFlags],
      reasons: fetchResult.reachability.internalFlags,
      userFacingMessage: fetchResult.reachability.userFacingMessage,
      manualReviewRequired: false,
    });
  }

  // ── Step 5: Headless fallback ─────────────────────────────────────────────
  const needsHeadless =
    fetchResult.reachability.status === 'blocked' ||
    fetchResult.reachability.status === 'thin' ||
    (signals?.hasBotProtection ?? false);

  if (needsHeadless) {
    const headlessResult = await headlessFetch(normalizedUrl);
    if (headlessResult) {
      signals = headlessResult.signals;
      finalUrl = headlessResult.finalUrl;
      headlessBrowserUsed = true;
      internalFlags.push('headless_attempted');
    }
  }

  // ── Step 6: Chain detection — domain + page content pass ──────────────────
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
    const eligibility = computeCountryEligibility({ zipStatus: zipResult.status, googlePlacesQueried: false });
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
      internalFlags: [...internalFlags, 'chain_detected_by_page'],
      reasons: [`national_chain:${pageChainCheck.matchedChain ?? 'unknown'}`],
      userFacingMessage:
        "Our program is designed for independent operators and doesn't cover national chains. If you operate an independent concept, please use that website instead.",
      manualReviewRequired: false,
    });
  }

  // ── Step 7: Signal scoring ────────────────────────────────────────────────
  const scores = signals
    ? computeRestaurantScores(signals, domain)
    : { restaurantSignalScore: 0, negativeSignalScore: 0 };

  const relationship = computeWebsiteRelationship(restaurantName, normalizedUrl, finalUrl);
  internalFlags.push(...relationship.internalFlags);

  if (relationship.isKnownVendorDomain) {
    const eligibility = computeCountryEligibility({ zipStatus: zipResult.status, googlePlacesQueried: false });
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
      internalFlags: [...internalFlags],
      reasons: ['known_vendor_domain'],
      userFacingMessage:
        "This website doesn't appear to match a restaurant or foodservice operation. If this is incorrect, you can still submit and our team will review it.",
      manualReviewRequired: true,
    });
  }

  // ── Step 8: Google Places ─────────────────────────────────────────────────
  const placesResult = await queryGooglePlaces({ restaurantName, zipCode, domain, conceptType });
  internalFlags.push(...placesResult.internalFlags);

  // ── Step 9: Country eligibility ───────────────────────────────────────────
  const eligibility = computeCountryEligibility({
    zipStatus: zipResult.status,
    placesCountry: placesResult.placesCountry,
    googlePlacesQueried: placesResult.googlePlacesQueried,
  });
  internalFlags.push(...eligibility.internalFlags);

  if (eligibility.countryEligibility === 'non_us') {
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
      googlePlacesQueried: placesResult.googlePlacesQueried,
      claudeAiUsed: false,
      websiteLogoHints: signals?.logoHints ?? [],
      internalFlags: [...internalFlags],
      reasons: ['non_us_ineligible'],
      userFacingMessage:
        "We're currently only able to provide reports for U.S.-based restaurants. Thank you for your interest.",
      manualReviewRequired: false,
    });
  }

  // ── Step 10: Rule-based decision ──────────────────────────────────────────
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
      googlePlacesQueried: placesResult.googlePlacesQueried,
      claudeAiUsed: false,
      websiteLogoHints: signals?.logoHints ?? [],
      internalFlags: [...internalFlags],
      reasons,
      userFacingMessage: buildUserMessage(ruleBased.decision),
      manualReviewRequired: manualReview,
    });
  }

  // ── Step 11: Claude tiebreaker (ambiguous only) ───────────────────────────
  let finalDecision: FinalDecision = 'plausible_unverified';
  let claudeAiUsed = false;

  const ambiguous = isAmbiguous({
    restaurantSignalScore: scores.restaurantSignalScore,
    negativeSignalScore: scores.negativeSignalScore,
    googlePlacesScore: placesResult.googlePlacesScore,
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
    googlePlacesQueried: placesResult.googlePlacesQueried,
    claudeAiUsed,
    websiteLogoHints: signals?.logoHints ?? [],
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
  if (restaurantSignalScore >= 60 && negativeSignalScore < 40 && nationalChainScore < 50) {
    return { decision: 'verified_restaurant', reason: 'high_restaurant_score' };
  }
  if (googlePlacesScore >= 80 && nationalChainScore < 50 && negativeSignalScore < 60) {
    return { decision: 'verified_restaurant', reason: 'google_places_confirmed' };
  }
  return null;
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
