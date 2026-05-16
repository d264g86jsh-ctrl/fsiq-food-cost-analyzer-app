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
  navLinkTexts: string[];
  bodyText: string; // stripped HTML, up to 5000 chars
  logoHints: string[]; // candidate logo URLs (verbatim)
  socialLinks: string[];
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

export function extractSignals(html: string, pageUrl: string): WebsiteSignals {
  const pageTitle = extractTag(html, 'title') ?? '';
  const metaDescription = extractMeta(html, 'description') ?? '';
  const ogTitle = extractOg(html, 'og:title') ?? '';
  const ogType = extractOg(html, 'og:type') ?? '';
  const ogDescription = extractOg(html, 'og:description') ?? '';
  const ogSiteName = extractOg(html, 'og:site_name') ?? '';
  const ogImage = extractOg(html, 'og:image') ?? null;

  const schemaOrgTypes = extractSchemaOrgTypes(html);
  const navLinkTexts = extractNavLinkTexts(html);
  const bodyText = stripHtml(html).slice(0, 5000);
  const logoHints = extractLogoHints(html, pageUrl, ogImage);
  const socialLinks = extractSocialLinks(html);

  const hasRestaurantSchema = schemaOrgTypes.some((t) => RESTAURANT_SCHEMA_TYPES.includes(t));
  const hasVendorSchema = schemaOrgTypes.some((t) => VENDOR_SCHEMA_TYPES.includes(t));

  const htmlLower = html.toLowerCase();
  const textLower = bodyText.toLowerCase();

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
    navLinkTexts,
    bodyText,
    logoHints,
    socialLinks,
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

function extractSchemaOrgTypes(html: string): string[] {
  const types: string[] = [];

  // JSON-LD blocks
  const jsonLdBlocks = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  for (const block of jsonLdBlocks) {
    try {
      const data = JSON.parse(block[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item['@type']) {
          const t = item['@type'];
          if (Array.isArray(t)) types.push(...t);
          else types.push(String(t));
        }
        // Check nested @graph
        if (item['@graph'] && Array.isArray(item['@graph'])) {
          for (const node of item['@graph']) {
            if (node['@type']) {
              const t = node['@type'];
              if (Array.isArray(t)) types.push(...t);
              else types.push(String(t));
            }
          }
        }
      }
    } catch {
      // Malformed JSON-LD — skip
    }
  }

  // Microdata itemtype attributes
  const itemTypes = html.matchAll(/itemtype=["']https?:\/\/schema\.org\/([A-Za-z]+)["']/gi);
  for (const m of itemTypes) {
    types.push(m[1]);
  }

  return [...new Set(types)];
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
  const hrefs = html.matchAll(/href=["']([^"']+)["']/gi);
  for (const m of hrefs) {
    const href = m[1];
    if (SOCIAL_PATTERNS.some((p) => href.includes(p))) {
      social.push(href);
    }
  }
  return [...new Set(social)].slice(0, 10);
}

function stripHtml(html: string): string {
  return stripHtmlTags(html).replace(/\s+/g, ' ').trim();
}

function stripHtmlTags(s: string): string {
  return s.replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ');
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
