// Regex-based HTML signal extraction. No DOM dependency required in Node.js server context.

export interface WebsiteSignals {
  pageTitle: string;
  metaDescription: string;
  ogTitle: string;
  ogType: string;
  ogDescription: string;
  ogSiteName: string;
  ogImage: string | null;
  schemaOrgTypes: string[];
  schemaOrgNames: string[];
  schemaOrgDescriptions: string[];
  navLinkTexts: string[];
  headingTexts: string[];
  buttonTexts: string[];
  urlPathSegments: string[];
  bodyText: string; // stripped/scoring HTML text; large pages keep targeted signal windows
  logoHints: string[]; // candidate logo URLs (verbatim)
  socialLinks: string[];
  imageAltTexts: string[];
  nonEnglishKeywordHits: Record<string, string[]>;
  hasReservationWidget: boolean;
  hasOrderingWidget: boolean;
  hasAddressPhoneBlock: boolean;
  hasFoodImageAltText: boolean;
  hasRestaurantSchema: boolean;
  hasVendorSchema: boolean;
  hasBotProtection: boolean;
  hasComingSoon: boolean;
  hasParkingPage: boolean;
  hasLinkInBio: boolean;
  hasAgeGate: boolean;
  hasCookieGate: boolean;
}

const RESTAURANT_SCHEMA_TYPES = [
  'Restaurant',
  'FoodEstablishment',
  'CafeOrCoffeeShop',
  'FastFoodRestaurant',
  'BarOrPub',
  'Bakery',
  'IceCreamShop',
  'Winery',
  'Brewery',
];

const VENDOR_SCHEMA_TYPES = ['SoftwareApplication', 'WebApplication', 'MobileApplication'];

const TARGET_WINDOW_KEYWORDS = [
  'menu', 'menus', 'hours', 'reservation', 'reservations', 'reserve', 'address',
  'order online', 'dining', 'restaurant', 'cafe', 'bar', 'brunch', 'lunch',
  'dinner', 'catering', 'private dining', 'phone', 'contact',
  'menú', 'reservación', 'horarios', 'platillos', 'cocina',
  '菜单', '预订', '营业时间', '餐厅',
  'thực đơn', 'đặt bàn', 'nhà hàng',
  '메뉴', '예약', '레스토랑',
];

const NON_ENGLISH_KEYWORDS: Record<string, string[]> = {
  spanish: ['menú', 'reservación', 'reservaciones', 'horarios', 'platillos', 'cocina'],
  chinese: ['菜单', '预订', '营业时间', '餐厅'],
  vietnamese: ['thực đơn', 'dat ban', 'đặt bàn', 'nhà hàng'],
  korean: ['메뉴', '예약', '레스토랑'],
};

export function extractSignals(html: string, pageUrl: string): WebsiteSignals {
  const pageTitle = extractTag(html, 'title') ?? '';
  const metaDescription = extractMeta(html, 'description') ?? '';
  const ogTitle = extractOg(html, 'og:title') ?? '';
  const ogType = extractOg(html, 'og:type') ?? '';
  const ogDescription = extractOg(html, 'og:description') ?? '';
  const ogSiteName = extractOg(html, 'og:site_name') ?? '';
  const ogImage = extractOg(html, 'og:image') ?? null;

  const schemaOrg = extractSchemaOrg(html);
  const schemaOrgTypes = schemaOrg.types;
  const navLinkTexts = extractNavLinkTexts(html);
  const headingTexts = extractHeadingTexts(html);
  const buttonTexts = extractButtonTexts(html);
  const urlPathSegments = extractUrlPathSegments(pageUrl);
  const bodyText = extractScoringBodyText(html);
  const logoHints = extractLogoHints(html, pageUrl, ogImage);
  const socialLinks = extractSocialLinks(html);
  const imageAltTexts = extractImageAltTexts(html);
  const nonEnglishKeywordHits = extractNonEnglishKeywordHits(`${bodyText} ${pageTitle} ${metaDescription} ${ogTitle} ${ogDescription} ${navLinkTexts.join(' ')} ${headingTexts.join(' ')} ${buttonTexts.join(' ')}`);

  const hasRestaurantSchema = schemaOrgTypes.some((t) => RESTAURANT_SCHEMA_TYPES.includes(t));
  const hasVendorSchema = schemaOrgTypes.some((t) => VENDOR_SCHEMA_TYPES.includes(t));

  const htmlLower = html.toLowerCase();
  const textLower = bodyText.toLowerCase();
  const linkedAssetsLower = [htmlLower, ...extractAttributeValues(html, 'href'), ...extractAttributeValues(html, 'src'), ...extractAttributeValues(html, 'data-src')]
    .join(' ')
    .toLowerCase();

  const hasReservationWidget = /opentable|resy|exploretock|sevenrooms|reservewithgoogle|wisely/.test(linkedAssetsLower);

  const hasOrderingWidget = /toasttab|chownow|popmenu|olo\.com|squareup|doordash|ubereats|grubhub|slice\.life/.test(linkedAssetsLower);

  const hasAddressPhoneBlock =
    /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(bodyText) &&
    /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(bodyText);

  const hasFoodImageAltText = imageAltTexts.some((text) =>
    /\b(pasta|burger|cocktail|entree|entrée|pizza|taco|sushi|bbq|barbecue|steak|seafood|oyster|brunch|dessert|sandwich|salad|wine|beer|dish|plate)\b/i.test(text),
  );

  const hasBotProtection =
    /captcha|cloudflare.*checking|just a moment|ddos.*protection|security.*check/i.test(textLower) ||
    html.includes('cf-browser-verification') ||
    html.includes('challenge-form');

  const hasComingSoon =
    /coming soon|under construction|launching soon|we['']re (working|building)|stay tuned/i.test(textLower);

  const hasParkingPage =
    /this domain (is for sale|may be for sale|has expired)|buy this domain|domain parking|parked (free|by)|related searches/i.test(textLower) ||
    html.includes('domainsponsor') ||
    html.includes('sedo.com') ||
    html.includes('bodis.com');

  const hasLinkInBio =
    htmlLower.includes('linktr.ee') ||
    htmlLower.includes('linktree') ||
    html.includes('beacons.ai') ||
    html.includes('bio.site') ||
    /link.?in.?bio/i.test(textLower);

  const hasAgeGate =
    /age.*verif|verify.*age|are you (over|at least|21)|must be (21|18|of legal)/i.test(textLower) ||
    html.includes('age-gate') ||
    html.includes('agegate');

  const hasCookieGate =
    html.includes('cookie-consent') ||
    html.includes('cookieconsent') ||
    /accept.*cookies|cookie.*policy|we use cookies/i.test(textLower);

  return {
    pageTitle,
    metaDescription,
    ogTitle,
    ogType,
    ogDescription,
    ogSiteName,
    ogImage,
    schemaOrgTypes,
    schemaOrgNames: schemaOrg.names,
    schemaOrgDescriptions: schemaOrg.descriptions,
    navLinkTexts,
    headingTexts,
    buttonTexts,
    urlPathSegments,
    bodyText,
    logoHints,
    socialLinks,
    imageAltTexts,
    nonEnglishKeywordHits,
    hasReservationWidget,
    hasOrderingWidget,
    hasAddressPhoneBlock,
    hasFoodImageAltText,
    hasRestaurantSchema,
    hasVendorSchema,
    hasBotProtection,
    hasComingSoon,
    hasParkingPage,
    hasLinkInBio,
    hasAgeGate,
    hasCookieGate,
  };
}

function extractUrlPathSegments(pageUrl: string): string[] {
  try {
    const url = new URL(pageUrl);
    return url.pathname
      .split('/')
      .map((segment) => segment.trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 20);
  } catch {
    return [];
  }
}

function extractTag(html: string, tag: string): string | null {
  const m = html.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return m ? stripHtmlTags(m[1]).trim() : null;
}

function extractMeta(html: string, name: string): string | null {
  const m = html.match(new RegExp(`<meta[^>]+name=["']${name}["'][^>]+content=["']([^"']*?)["']`, 'i'))
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*?)["'][^>]+name=["']${name}["']`, 'i'));
  return m ? m[1].trim() : null;
}

function extractOg(html: string, property: string): string | null {
  const m = html.match(new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([^"']*?)["']`, 'i'))
    ?? html.match(new RegExp(`<meta[^>]+content=["']([^"']*?)["'][^>]+property=["']${property}["']`, 'i'));
  return m ? m[1].trim() : null;
}

function extractSchemaOrg(html: string): { types: string[]; names: string[]; descriptions: string[] } {
  const types: string[] = [];
  const names: string[] = [];
  const descriptions: string[] = [];

  // JSON-LD blocks
  const jsonLdBlocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block[1]);
      collectSchemaNode(data, types, names, descriptions);
    } catch {
      // Malformed JSON-LD — skip
    }
  }

  // Microdata itemtype attributes
  const itemTypes = html.matchAll(/itemtype=["']https?:\/\/schema\.org\/([A-Za-z]+)["']/gi);
  for (const m of itemTypes) {
    types.push(m[1]);
  }

  return {
    types: [...new Set(types)],
    names: [...new Set(names)].slice(0, 20),
    descriptions: [...new Set(descriptions)].slice(0, 20),
  };
}

function collectSchemaNode(
  value: unknown,
  types: string[],
  names: string[],
  descriptions: string[],
): void {
  if (!value) return;

  if (Array.isArray(value)) {
    for (const item of value) collectSchemaNode(item, types, names, descriptions);
    return;
  }

  if (typeof value !== 'object') return;
  const item = value as Record<string, unknown>;
  const type = item['@type'];
  if (Array.isArray(type)) types.push(...type.map(String));
  else if (type) types.push(String(type));

  if (typeof item.name === 'string') names.push(item.name);
  if (typeof item.description === 'string') descriptions.push(item.description);

  for (const child of Object.values(item)) {
    if (child && typeof child === 'object') collectSchemaNode(child, types, names, descriptions);
  }
}

function extractNavLinkTexts(html: string): string[] {
  const texts: string[] = [];
  const navBlock = html.match(/<nav[\s\S]*?<\/nav>/i)?.[0] ?? '';
  const source = navBlock || html;
  const links = source.matchAll(/<a[^>]*>([\s\S]*?)<\/a>/gi);
  for (const m of links) {
    const text = stripHtmlTags(m[1]).trim().toLowerCase();
    if (text && text.length < 40) texts.push(text);
  }
  return [...new Set(texts)].slice(0, 30);
}

function extractHeadingTexts(html: string): string[] {
  const texts: string[] = [];
  const headings = html.matchAll(/<h[1-4][^>]*>([\s\S]*?)<\/h[1-4]>/gi);
  for (const m of headings) {
    const text = stripHtmlTags(m[1]).trim().toLowerCase();
    if (text && text.length < 120) texts.push(text);
  }
  return [...new Set(texts)].slice(0, 40);
}

function extractButtonTexts(html: string): string[] {
  const texts: string[] = [];
  const buttons = html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/gi);
  for (const m of buttons) {
    const text = stripHtmlTags(m[1]).trim().toLowerCase();
    if (text && text.length < 80) texts.push(text);
  }

  const buttonInputs = html.matchAll(/<(?:input|a)[^>]+(?:type=["']button["'][^>]+)?(?:aria-label|title|value)=["']([^"']+)["'][^>]*>/gi);
  for (const m of buttonInputs) {
    const text = stripHtmlTags(m[1]).trim().toLowerCase();
    if (text && text.length < 80) texts.push(text);
  }

  return [...new Set(texts)].slice(0, 40);
}

function extractLogoHints(html: string, pageUrl: string, ogImage: string | null): string[] {
  const hints: string[] = [];

  // og:image
  if (ogImage) hints.push(ogImage);

  // apple-touch-icon
  const touch = html.match(/<link[^>]+rel=["'][^"']*apple-touch-icon[^"']*["'][^>]+href=["']([^"']+)["']/i)
    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*apple-touch-icon[^"']*["']/i);
  if (touch) hints.push(resolveUrl(touch[1], pageUrl));

  // schema.org logo
  const logoMatches = html.matchAll(/"logo"\s*:\s*\{[^}]*"url"\s*:\s*"([^"]+)"/g);
  for (const m of logoMatches) hints.push(m[1]);

  // Inline logo img in header
  const headerBlock = html.match(/<header[\s\S]*?<\/header>/i)?.[0] ?? '';
  if (headerBlock) {
    const imgs = headerBlock.matchAll(/<img[^>]+src=["']([^"']+)["'][^>]*>/gi);
    for (const m of imgs) {
      const src = m[1];
      if (/logo|brand|icon/i.test(src) || /logo|brand/i.test(m[0])) {
        hints.push(resolveUrl(src, pageUrl));
      }
    }
  }

  // favicon (lowest priority)
  const favicon = html.match(/<link[^>]+rel=["'][^"']*icon[^"']*["'][^>]+href=["']([^"']+)["']/i)
    ?? html.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*icon[^"']*["']/i);
  if (favicon) hints.push(resolveUrl(favicon[1], pageUrl));

  return [...new Set(hints.filter(Boolean))].slice(0, 5);
}

function extractSocialLinks(html: string): string[] {
  const social: string[] = [];
  const SOCIAL_PATTERNS = ['instagram.com', 'facebook.com', 'twitter.com', 'x.com', 'tiktok.com', 'yelp.com', 'tripadvisor.com', 'opentable.com', 'resy.com', 'doordash.com', 'ubereats.com', 'grubhub.com'];
  for (const href of extractAttributeValues(html, 'href')) {
    if (SOCIAL_PATTERNS.some((p) => href.includes(p))) {
      social.push(href);
    }
  }
  return [...new Set(social)].slice(0, 10);
}

function extractAttributeValues(html: string, attribute: string): string[] {
  const values: string[] = [];
  const matches = html.matchAll(new RegExp(`${attribute}=["']([^"']+)["']`, 'gi'));
  for (const m of matches) values.push(m[1]);
  return values;
}

function extractImageAltTexts(html: string): string[] {
  const alts: string[] = [];
  const matches = html.matchAll(/<img[^>]+alt=["']([^"']+)["'][^>]*>/gi);
  for (const m of matches) alts.push(stripHtmlTags(m[1]).trim());
  return alts;
}

function stripHtml(html: string): string {
  return stripHtmlTags(html).replace(/\s+/g, ' ').trim();
}

function extractScoringBodyText(html: string): string {
  const stripped = stripHtml(html);
  if (stripped.length <= 50_000) return stripped;

  const windows: string[] = [stripped.slice(0, 5000), stripped.slice(-2000)];
  const lower = stripped.toLowerCase();
  for (const keyword of TARGET_WINDOW_KEYWORDS) {
    const index = lower.indexOf(keyword.toLowerCase());
    if (index === -1) continue;
    const start = Math.max(0, index - 800);
    const end = Math.min(stripped.length, index + keyword.length + 1200);
    windows.push(stripped.slice(start, end));
  }

  return [...new Set(windows)].join(' ').replace(/\s+/g, ' ').trim();
}

function stripHtmlTags(s: string): string {
  return s.replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ');
}

function extractNonEnglishKeywordHits(text: string): Record<string, string[]> {
  const lower = text.toLowerCase();
  const hits: Record<string, string[]> = {};
  for (const [language, keywords] of Object.entries(NON_ENGLISH_KEYWORDS)) {
    const matched = keywords.filter((keyword) => lower.includes(keyword.toLowerCase()));
    if (matched.length > 0) hits[language] = [...new Set(matched)];
  }
  return hits;
}

function resolveUrl(href: string, base: string): string {
  if (!href) return '';
  if (/^https?:\/\//i.test(href)) return href;
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}
