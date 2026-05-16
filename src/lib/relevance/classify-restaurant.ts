// Rule-based restaurant / vendor signal scoring.
// Weights are: strong = 15, moderate = 8, weak = 4.
// Scores are clamped 0–100.

import type { WebsiteSignals } from '../website/extract-signals';

export interface RestaurantScores {
  restaurantSignalScore: number; // 0–100
  negativeSignalScore: number;   // 0–100
}

// ── Strong restaurant positive signals ────────────────────────────────────────

const STRONG_POSITIVE_NAV = ['menu', 'reservations', 'book a table', 'order online', 'catering', 'private dining'];

const STRONG_POSITIVE_TEXT = [
  'dine-in', 'dine in', 'happy hour', 'brunch', 'tasting menu', 'prix fixe',
  'private dining', 'outdoor seating', 'rooftop', 'full bar',
];

const STRONG_POSITIVE_SOCIAL = [
  'opentable.com', 'resy.com', 'yelp.com/biz', 'tripadvisor.com',
  'doordash.com/store', 'ubereats.com/store', 'grubhub.com/restaurant',
];

// ── Moderate restaurant signals ───────────────────────────────────────────────

const MODERATE_DOMAIN_KEYWORDS = [
  'grill', 'kitchen', 'cafe', 'bistro', 'bar', 'tavern', 'eatery', 'brasserie',
  'cantina', 'trattoria', 'chophouse', 'smokehouse', 'steakhouse', 'pizzeria',
  'sushi', 'ramen', 'taqueria', 'bbq', 'bakery', 'diner',
];

const MODERATE_TEXT_KEYWORDS = [
  'chef', 'sommelier', 'mixologist', 'cuisine', 'menu', 'reservation',
  'appetizer', 'entree', 'entrée', 'dessert', 'cocktail', 'craft beer',
  'farm to table', 'locally sourced', 'seasonal menu',
  'pizza', 'burger', 'taco', 'sushi', 'bbq', 'pasta', 'seafood',
  'wings', 'sandwich', 'brunch',
];

// ── Strong negative (vendor / SaaS) signals ───────────────────────────────────

const STRONG_NEGATIVE_TEXT = [
  'book a demo', 'request a demo', 'free trial', 'start free trial',
  'pricing plans', 'enterprise', 'software platform', 'saas',
  'pos system', 'point of sale system', 'procurement software',
  'inventory management software', 'supply chain', 'distributor',
  'wholesale', 'manufacturer', 'foodservice equipment',
  'commercial kitchen equipment', 'marketing agency', 'digital agency',
  'consulting firm',
];

const STRONG_NEGATIVE_NAV = ['/pricing', '/demo', '/enterprise', '/solutions', '/integrations', '/docs', '/developers'];

// ── Moderate negative signals ─────────────────────────────────────────────────

const MODERATE_NEGATIVE_TEXT = [
  'clients', 'partners', 'roi', 'scalability', 'implementation',
  'schedule a call with sales', 'talk to sales',
];

export function computeRestaurantScores(signals: WebsiteSignals, domain: string): RestaurantScores {
  let restaurantRaw = 0;
  let negativeRaw = 0;

  // Schema.org type — highest weight signals
  if (signals.hasRestaurantSchema) restaurantRaw += 20;
  if (signals.hasVendorSchema) negativeRaw += 20;

  // Nav links
  for (const navText of signals.navLinkTexts) {
    if (STRONG_POSITIVE_NAV.some((k) => navText.includes(k))) restaurantRaw += 15;
    if (STRONG_NEGATIVE_NAV.some((k) => navText.includes(k))) negativeRaw += 15;
  }

  // Body text — strong positive
  const bodyLower = signals.bodyText.toLowerCase();
  for (const kw of STRONG_POSITIVE_TEXT) {
    if (bodyLower.includes(kw)) restaurantRaw += 10;
  }

  // Body text — moderate positive
  for (const kw of MODERATE_TEXT_KEYWORDS) {
    if (bodyLower.includes(kw)) restaurantRaw += 6;
  }

  // Domain keywords — moderate positive
  for (const kw of MODERATE_DOMAIN_KEYWORDS) {
    if (domain.includes(kw)) restaurantRaw += 8;
  }

  // Page title / meta description / og fields
  const titleAndDesc = `${signals.pageTitle} ${signals.metaDescription} ${signals.ogDescription}`.toLowerCase();
  for (const kw of MODERATE_TEXT_KEYWORDS) {
    if (titleAndDesc.includes(kw)) restaurantRaw += 5;
  }

  // Strong negative text
  for (const kw of STRONG_NEGATIVE_TEXT) {
    if (bodyLower.includes(kw)) negativeRaw += 15;
  }

  // Moderate negative
  for (const kw of MODERATE_NEGATIVE_TEXT) {
    if (bodyLower.includes(kw)) negativeRaw += 8;
  }

  // Social / ordering platform links — weak positive
  for (const link of signals.socialLinks) {
    if (STRONG_POSITIVE_SOCIAL.some((p) => link.includes(p))) restaurantRaw += 8;
  }

  // Hours-of-operation pattern in body text — strong positive
  if (/(?:mon|tue|wed|thu|fri|sat|sun)[\s\S]{0,30}(?:\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm))/i.test(signals.bodyText)) {
    restaurantRaw += 12;
  }

  // Phone number prominently displayed — moderate positive
  if (/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(signals.bodyText)) restaurantRaw += 6;

  // Special states
  if (signals.hasBotProtection) restaurantRaw = Math.max(restaurantRaw, 0); // no penalty but no boost
  if (signals.hasComingSoon) restaurantRaw = Math.max(restaurantRaw, 10); // thin but plausible
  if (signals.hasParkingPage) { restaurantRaw = 0; negativeRaw = 0; } // handled separately
  if (signals.hasAgeGate) restaurantRaw += 10; // bars/restaurants often have age gates

  return {
    restaurantSignalScore: clamp(restaurantRaw),
    negativeSignalScore: clamp(negativeRaw),
  };
}

function clamp(n: number): number {
  return Math.min(100, Math.max(0, n));
}
