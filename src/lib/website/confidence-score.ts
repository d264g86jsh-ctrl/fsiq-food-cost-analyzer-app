// Validation confidence scoring — computes how certain we are that a validated
// site is a real restaurant, independent of the final decision.
// Used to choose between two messaging tiers for plausible_unverified results.

import type { FinalDecision } from './types';

export interface ValidationConfidence {
  score: number;            // 0–100
  hasLogoHint: boolean;
  hasRestaurantSignals: boolean;
  hasNegativeSignals: boolean;
  reasoning: string;        // comma-separated codes
}

export function computeValidationConfidence(options: {
  httpStatus: number;
  logoHints: string[];
  restaurantSignalScore: number;
  negativeSignalScore: number;
  hasRestaurantInDomain: boolean;
}): ValidationConfidence {
  const { httpStatus, logoHints, restaurantSignalScore, negativeSignalScore, hasRestaurantInDomain } = options;

  // Hard gate: 404 kills all confidence regardless of other signals
  if (httpStatus === 404) {
    return {
      score: 0,
      hasLogoHint: false,
      hasRestaurantSignals: false,
      hasNegativeSignals: true,
      reasoning: 'website_404',
    };
  }

  let score = 0;
  const reasons: string[] = [];

  // Website is reachable (any non-zero status except 404) = base +20
  if (httpStatus !== 0) {
    score += 20;
    reasons.push('website_exists');
  }

  // Logo found = +40 (strong signal — site has content + branding)
  if (logoHints.length > 0) {
    score += 40;
    reasons.push('logo_found');
  }

  // Restaurant keyword in domain = +30 (e.g. centurionrestaurantgroup.com)
  if (hasRestaurantInDomain) {
    score += 30;
    reasons.push('restaurant_in_domain');
  }

  // Meaningful restaurant signals = +20
  if (restaurantSignalScore > 30) {
    score += 20;
    reasons.push('restaurant_signals');
  }

  // Low negative signal noise = +10
  if (negativeSignalScore < 40) {
    score += 10;
    reasons.push('low_negative_signals');
  }

  return {
    score: Math.min(100, score),
    hasLogoHint: logoHints.length > 0,
    hasRestaurantSignals: restaurantSignalScore > 30,
    hasNegativeSignals: negativeSignalScore >= 40,
    reasoning: reasons.join(','),
  };
}

// Confidence-aware user-facing message for each final decision.
// Only plausible_unverified varies by confidence — all others are fixed.
export function buildConfidenceAwareMessage(
  decision: FinalDecision,
  confidence: ValidationConfidence,
): string | null {
  switch (decision) {
    case 'verified_restaurant':
      return null; // Handled by UI state machine (green checkmark)
    case 'plausible_unverified':
      if (confidence.score >= 50) {
        return "We're still working on verifying your website, you can continue.";
      }
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
