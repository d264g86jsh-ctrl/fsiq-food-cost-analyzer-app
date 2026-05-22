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
  'sushi', 'ramen', 'taqueria', 'bbq', 'bakery', 'diner', 'gastropub',
  'bodega', 'pizzeria', 'seafood', 'pizza', 'brewery', 'pub',
];

const MODERATE_TEXT_KEYWORDS = [
  'restaurant', 'restaurants', 'chef', 'sommelier', 'mixologist', 'cuisine', 'menu', 'reservation',
  'appetizer', 'entree', 'entrée', 'dessert', 'cocktail', 'craft beer',
  'farm to table', 'locally sourced', 'seasonal menu',
  'pizza', 'burger', 'taco', 'sushi', 'bbq', 'pasta', 'seafood',
  'wings', 'sandwich', 'brunch', 'barbecue', 'steak', 'steaks', 'wine',
  'lunch', 'dinner', 'drive-in', 'fish', 'shrimp', 'oyster', 'crab',
];

const NON_ENGLISH_RESTAURANT_KEYWORDS: Record<string, string[]> = {
  spanish: ['menú', 'reservación', 'reservaciones', 'horarios', 'platillos', 'cocina'],
  chinese: ['菜单', '预订', '营业时间', '餐厅'],
  vietnamese: ['thực đơn', 'dat ban', 'đặt bàn', 'nhà hàng'],
  korean: ['메뉴', '예약', '레스토랑'],
};

// ── Strong negative (vendor / SaaS) signals ───────────────────────────────────

const STRONG_NEGATIVE_TEXT = [
  'book a demo', 'request a demo', 'free trial', 'start free trial',
  'pricing plans', 'enterprise', 'software platform', 'saas',
  'pos system', 'point of sale system', 'procurement software',
  'inventory management software', 'supply chain', 'distributor',
  'wholesale', 'manufacturer', 'foodservice equipment',
  'commercial kitchen equipment', 'marketing agency', 'digital agency',
  'consulting firm', 'law firm', 'legal services', 'attorneys', 'attorney',
  'lawyers', 'law office', 'dental', 'dentist', 'orthodontic',
  'medical clinic', 'healthcare', 'patients', 'patient portal',
  'real estate', 'homes for sale', 'property management', 'apartments',
  'insurance', 'accounting', 'bookkeeping', 'tax services', 'cpa firm',
  'auto repair', 'vehicle repair', 'car dealership', 'collision center',
  'hotel rooms', 'book your stay', 'guest rooms', 'home services',
  'plumbing', 'hvac', 'roofing', 'remodeling', 'contractor',
];

const STRONG_NEGATIVE_NAV = ['/pricing', '/demo', '/enterprise', '/solutions', '/integrations', '/docs', '/developers'];

// ── Moderate negative signals ─────────────────────────────────────────────────

const MODERATE_NEGATIVE_TEXT = [
  'clients', 'partners', 'roi', 'scalability', 'implementation',
  'schedule a call with sales', 'talk to sales', 'case studies',
  'solutions', 'industries', 'services', 'careers', 'team', 'portfolio',
  'practice areas', 'personal injury', 'family law', 'cosmetic dentistry',
  'urgent care', 'primary care', 'therapy', 'brokerage', 'listing',
  'realtor', 'wealth management', 'payroll', 'audit', 'tire', 'brake',
  'oil change', 'reservations hotel', 'check-in', 'amenities',
];

export function computeRestaurantScores(signals: WebsiteSignals, domain: string): RestaurantScores {
  let restaurantRaw = 0;
  let negativeRaw = 0;
  const bodyLower = signals.bodyText.toLowerCase();
  const navText = signals.navLinkTexts.join(' ').toLowerCase();
  const headingText = signals.headingTexts.join(' ').toLowerCase();
  const buttonText = signals.buttonTexts.join(' ').toLowerCase();
  const schemaText = `${signals.schemaOrgNames.join(' ')} ${signals.schemaOrgDescriptions.join(' ')}`.toLowerCase();
  const titleAndDesc = [
    signals.pageTitle,
    signals.metaDescription,
    signals.ogTitle,
    signals.ogDescription,
    signals.ogSiteName,
    signals.ogType,
  ].join(' ').toLowerCase();
  const combinedText = `${bodyLower} ${titleAndDesc} ${navText} ${headingText} ${buttonText} ${schemaText}`;
  const hasStrongNonRestaurantExclusion = strongNonRestaurantExclusionPresent(combinedText);

  // Schema.org type — highest weight signals
  restaurantRaw += scoreRestaurantSchemaTypes(signals.schemaOrgTypes);
  if (signals.hasVendorSchema) negativeRaw += 20;

  // Nav links
  for (const navText of signals.navLinkTexts) {
    if (STRONG_POSITIVE_NAV.some((k) => navText.includes(k))) restaurantRaw += 15;
    if (STRONG_NEGATIVE_NAV.some((k) => navText.includes(k))) negativeRaw += 15;
  }

  for (const text of [...signals.headingTexts, ...signals.buttonTexts]) {
    if (STRONG_POSITIVE_NAV.some((k) => text.includes(k))) restaurantRaw += 12;
    if (MODERATE_TEXT_KEYWORDS.some((k) => text.includes(k))) restaurantRaw += 6;
  }

  // Body text — strong positive
  for (const kw of STRONG_POSITIVE_TEXT) {
    if (combinedText.includes(kw)) restaurantRaw += 10;
  }

  // Body text — moderate positive
  for (const kw of MODERATE_TEXT_KEYWORDS) {
    if (combinedText.includes(kw)) restaurantRaw += 6;
  }

  // Domain keywords — moderate positive
  const domainWords = splitDomainWords(domain);
  for (const kw of MODERATE_DOMAIN_KEYWORDS) {
    if (domainWords.includes(kw) || domain.includes(kw)) restaurantRaw += 8;
  }

  // Page title / meta description / og fields
  for (const kw of MODERATE_TEXT_KEYWORDS) {
    if (titleAndDesc.includes(kw)) restaurantRaw += 5;
  }
  for (const kw of MODERATE_DOMAIN_KEYWORDS) {
    if (titleAndDesc.includes(kw)) restaurantRaw += 5;
  }
  if (signals.ogType.toLowerCase().includes('restaurant')) restaurantRaw += 15;

  // URL path signals
  for (const segment of signals.urlPathSegments) {
    if (['menu', 'menus', 'reservations', 'reserve', 'book-a-table'].includes(segment)) restaurantRaw += 12;
    if (['order', 'order-online'].includes(segment)) restaurantRaw += 8;
    if (['hours', 'locations'].includes(segment)) restaurantRaw += 6;
    if (['our-story', 'about-us', 'about'].includes(segment)) restaurantRaw += 4;
  }

  // og:type restaurant detection (~104 sites use restaurant.restaurant)
  if (signals.ogType === 'restaurant.restaurant' || signals.ogType.includes('restaurant')) {
    restaurantRaw += 15;
  }

  // Strong negative text
  for (const kw of STRONG_NEGATIVE_TEXT) {
    if (combinedText.includes(kw)) negativeRaw += 20;
  }

  // Moderate negative
  for (const kw of MODERATE_NEGATIVE_TEXT) {
    if (combinedText.includes(kw)) negativeRaw += 10;
  }

  // Social / ordering platform links — weak positive
  for (const link of signals.socialLinks) {
    if (STRONG_POSITIVE_SOCIAL.some((p) => link.includes(p))) restaurantRaw += 8;
  }

  // Embedded restaurant commerce / reservation infrastructure.
  if (!hasStrongNonRestaurantExclusion && signals.hasReservationWidget) restaurantRaw += 12;
  if (!hasStrongNonRestaurantExclusion && signals.hasOrderingWidget) restaurantRaw += 10;

  // Hours-of-operation pattern in body text — strong positive
  if (/(?:mon|tue|wed|thu|fri|sat|sun)[\s\S]{0,30}(?:\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm))/i.test(signals.bodyText)) {
    restaurantRaw += 12;
  }

  // Phone number prominently displayed — moderate positive
  if (/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(signals.bodyText)) restaurantRaw += 6;
  if (!hasStrongNonRestaurantExclusion && signals.hasAddressPhoneBlock) restaurantRaw += 8;

  // Food imagery is weak but useful when markup is otherwise thin.
  if (!hasStrongNonRestaurantExclusion && signals.hasFoodImageAltText) restaurantRaw += 4;

  // Special states
  if (signals.hasBotProtection) restaurantRaw = Math.max(restaurantRaw, 0); // no penalty but no boost
  if (signals.hasComingSoon) restaurantRaw = Math.max(restaurantRaw, 10); // thin but plausible
  if (signals.hasParkingPage) { restaurantRaw = 0; negativeRaw = 0; } // handled separately
  if (signals.hasAgeGate) restaurantRaw += 10; // bars/restaurants often have age gates

  if (!hasStrongNonRestaurantExclusion) {
    restaurantRaw += computeBundleScore(signals, domain, restaurantRaw, negativeRaw, titleAndDesc, combinedText);
  }

  const cappedRestaurantRaw = capUnanchoredRestaurantScore(restaurantRaw, signals);

  return {
    restaurantSignalScore: clamp(cappedRestaurantRaw),
    negativeSignalScore: clamp(negativeRaw),
  };
}

function capUnanchoredRestaurantScore(score: number, signals: WebsiteSignals): number {
  if (score < 60) return score;

  const hasPhone = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(signals.bodyText);
  const hasAddress = hasAddressPattern(signals.bodyText);
  const hasNonEnglishBundle = Object.values(signals.nonEnglishKeywordHits).some((hits) => hits.length >= 2);
  const hasOperationalAnchor =
    signals.hasRestaurantSchema ||
    signals.hasReservationWidget ||
    signals.hasOrderingWidget ||
    signals.hasAddressPhoneBlock ||
    signals.hasFoodImageAltText ||
    signals.socialLinks.some((link) => STRONG_POSITIVE_SOCIAL.some((platform) => link.includes(platform))) ||
    Boolean(signals.ogImage) ||
    (hasPhone && hasAddress) ||
    hasNonEnglishBundle;

  return hasOperationalAnchor ? score : 59;
}

function scoreRestaurantSchemaTypes(types: string[]): number {
  let score = 0;
  for (const type of types.map((t) => t.toLowerCase())) {
    if (type === 'restaurant' || type === 'foodestablishment') score += 20;
    else if (type === 'cafeorcoffeeshop' || type === 'barorpub' || type === 'bakery') score += 15;
    else if (type === 'foodservice') score += 10;
    else if (type === 'fastfoodrestaurant' || type === 'icecreamshop' || type === 'winery' || type === 'brewery') score += 15;
  }
  return Math.min(score, 30);
}

function computeBundleScore(
  signals: WebsiteSignals,
  domain: string,
  currentRestaurantRaw: number,
  currentNegativeRaw: number,
  titleAndDesc: string,
  combinedText: string,
): number {
  let bundleScore = 0;
  const scoreBeforeBundles = clamp(currentRestaurantRaw);
  const negativeBeforeBundles = clamp(currentNegativeRaw);
  const hasPhone = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(signals.bodyText);
  const hasAddress = hasAddressPattern(signals.bodyText);
  const hasMenuSignal = hasMenuLanguage(signals);
  const restaurantLikeMetadata =
    restaurantLanguagePresent(titleAndDesc) ||
    restaurantDomainLanguagePresent(domain) ||
    restaurantLanguagePresent(`${signals.ogSiteName} ${signals.pageTitle}`.toLowerCase());

  if (restaurantLikeMetadata && hasPhone && (signals.ogImage || hasAddress) && negativeBeforeBundles === 0) {
    bundleScore += 15;
  }

  if (signals.hasRestaurantSchema && hasMenuSignal && negativeBeforeBundles < 10) {
    bundleScore += 20;
  }

  for (const hits of Object.values(signals.nonEnglishKeywordHits)) {
    if (hits.length >= 2 && negativeBeforeBundles < 10) {
      bundleScore += 15;
      break;
    }
  }

  const independentSignals = countIndependentSignals(signals);
  if (scoreBeforeBundles >= 55 && scoreBeforeBundles <= 59 && negativeBeforeBundles === 0 && independentSignals >= 4) {
    bundleScore += 60 - scoreBeforeBundles;
  }

  if (restaurantLanguagePresent(combinedText) && independentSignals >= 4 && scoreBeforeBundles >= 50 && negativeBeforeBundles === 0) {
    bundleScore += 10;
  }

  return bundleScore;
}

function countIndependentSignals(signals: WebsiteSignals): number {
  let count = 0;
  if (signals.schemaOrgTypes.length > 0) count += 1;
  if (signals.navLinkTexts.some((text) => text.includes('menu'))) count += 1;
  if (signals.navLinkTexts.some((text) => /reservation|reserve|book a table/.test(text))) count += 1;
  if (/\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(signals.bodyText)) count += 1;
  if (hasAddressPattern(signals.bodyText)) count += 1;
  if (/(?:mon|tue|wed|thu|fri|sat|sun)[\s\S]{0,30}(?:\d{1,2}:\d{2}|\d{1,2}\s*(?:am|pm))/i.test(signals.bodyText)) count += 1;
  if (signals.ogTitle) count += 1;
  if (signals.metaDescription) count += 1;
  return count;
}

function hasMenuLanguage(signals: WebsiteSignals): boolean {
  const text = `${signals.bodyText} ${signals.navLinkTexts.join(' ')} ${signals.headingTexts.join(' ')} ${signals.buttonTexts.join(' ')}`.toLowerCase();
  return /menu|menus|menú|菜单|thực đơn|메뉴/.test(text);
}

function hasAddressPattern(text: string): boolean {
  return /\b\d{1,6}\s+[A-Za-z0-9.' -]+(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|hwy|highway|pkwy|parkway)\b/i.test(text) ||
    /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(text);
}

function restaurantLanguagePresent(text: string): boolean {
  const lower = text.toLowerCase();
  if ([...STRONG_POSITIVE_TEXT, ...MODERATE_TEXT_KEYWORDS, ...MODERATE_DOMAIN_KEYWORDS].some((keyword) => lower.includes(keyword))) return true;
  return Object.values(NON_ENGLISH_RESTAURANT_KEYWORDS).some((keywords) =>
    keywords.some((keyword) => lower.includes(keyword.toLowerCase())),
  );
}

function restaurantDomainLanguagePresent(domain: string): boolean {
  const words = splitDomainWords(domain);
  return MODERATE_DOMAIN_KEYWORDS.some((keyword) => words.includes(keyword) || domain.includes(keyword));
}

function strongNonRestaurantExclusionPresent(text: string): boolean {
  return STRONG_NEGATIVE_TEXT.some((keyword) => text.includes(keyword)) ||
    /\b(wholesale|distributor|software|saas|marketing agency|remodeling|supplier|manufacturer|logistics|law firm|attorney|lawyer|dental|dentist|medical|clinic|healthcare|real estate|realtor|insurance|accounting|bookkeeping|auto repair|dealership|hotel|plumbing|hvac|roofing|contractor)\b/.test(text);
}

function clamp(n: number): number {
  return Math.min(100, Math.max(0, n));
}

function splitDomainWords(domain: string): string[] {
  const root = domain
    .replace(/^www\./, '')
    .replace(/\.(com|net|org|io|co|us|biz|info|restaurant)$/i, '');

  const compactTerms = [
    'restaurant', 'grill', 'bistro', 'kitchen', 'cafe', 'eatery', 'diner',
    'brasserie', 'trattoria', 'cantina', 'tavern', 'chophouse', 'smokehouse',
    'gastropub', 'bodega', 'taqueria', 'pizzeria', 'seafood', 'pizza',
    'brewery', 'pub', 'bbq', 'bakery', 'bar',
  ];

  const explicitWords = root
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/gi, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);

  const words = new Set(explicitWords);
  for (const word of explicitWords) {
    for (const term of compactTerms) {
      if (word.includes(term)) words.add(term);
    }
  }

  return [...words];
}
