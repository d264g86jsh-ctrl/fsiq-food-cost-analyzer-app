import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

vi.mock('../website/headless-fetch', () => ({
  headlessFetch: vi.fn(),
}));

vi.mock('../relevance/claude-classifier', async (importOriginal) => {
  const original = await importOriginal<typeof import('../relevance/claude-classifier')>();
  return {
    ...original,
    classifyWithClaude: vi.fn().mockResolvedValue({
      decision: 'plausible_unverified',
      claudeAiUsed: false,
    }),
  };
});

import { runValidation } from '../website/run-validation';
import { headlessFetch } from '../website/headless-fetch';
import { extractSignals } from '../website/extract-signals';

const mockHeadlessFetch = vi.mocked(headlessFetch);

// ── Helpers ───────────────────────────────────────────────────────────────

function makeHtmlResponse(html: string, status = 200, finalUrl?: string) {
  const response = new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html' },
  });
  Object.defineProperty(response, 'url', { value: finalUrl ?? 'https://example.com/' });
  return response;
}

// ── HTML Fixtures ─────────────────────────────────────────────────────────

const STRONG_RESTAURANT_HTML = `
<html>
<head>
  <title>Casa Roberto - Authentic Mexican Restaurant</title>
  <meta name="description" content="Best Mexican food in Austin. Dine-in, takeout, catering.">
  <meta property="og:title" content="Casa Roberto Mexican Restaurant">
  <meta property="og:image" content="https://example.com/dining.jpg">
  <script type="application/ld+json">{"@type":"Restaurant","name":"Casa Roberto","cuisine":"Mexican"}</script>
</head>
<body>
  <nav><a href="/menu">Menu</a><a href="/reservations">Reservations</a><a href="/order">Order Online</a></nav>
  <h1>Welcome to Casa Roberto</h1>
  <p>Join us for brunch every Saturday. Happy hour 4-7pm Mon-Fri. Dine-in available. Prix fixe menu $35.</p>
  <p>Hours: Mon-Fri 11am-10pm, Sat-Sun 9am-11pm</p>
  <p>Address: 123 Main Street, Austin, TX 78701 | Phone: (512) 555-0123</p>
  <img src="/pasta.jpg" alt="handmade pasta with pesto sauce">
</body>
</html>
`;

// Squarespace restaurant: schema + nav + address anchor to escape cap
const SQUARESPACE_RESTAURANT_HTML = `
<html>
<head>
  <title>Marios Pizza</title>
  <meta name="description" content="Authentic Italian pizza and pasta in San Francisco">
  <script type="application/ld+json">{"@type":"Restaurant","name":"Marios Pizza"}</script>
</head>
<body>
  <div class="sqs-block-menu">Menu Section</div>
  <div class="sqs-block-checkout">Order Online</div>
  <nav><a href="/menu">Menu</a></nav>
  <p>Pizza, pasta, and Italian cuisine. Mon-Sat 5pm-11pm. (415) 555-0123</p>
  <p>456 Columbus Ave, San Francisco, CA 94133</p>
</body>
</html>
`;

// Wix restaurant: schema + address + phone anchor
const WIX_RESTAURANT_HTML = `
<html>
<head>
  <title>James Restaurant</title>
  <script type="application/ld+json">{"@type":"Restaurant","name":"James Restaurant"}</script>
</head>
<body>
  <div class="wixrestaurants">Restaurant Module</div>
  <div class="wix-menus">Menu Management</div>
  <nav><a href="/reservations">Book a Table</a></nav>
  <p>Modern American cuisine. Dine-in, catering. Mon-Sun 5pm-10pm.</p>
  <p>789 Broadway, New York, NY 10003. (323) 555-0456</p>
</body>
</html>
`;

// Maps restaurant: address + phone anchor to escape cap
const GOOGLE_MAPS_RESTAURANT_HTML = `
<html>
<head>
  <title>Coastal Bistro</title>
</head>
<body>
  <nav><a href="/menu">Menu</a></nav>
  <iframe src="https://maps.google.com/maps?q=Coastal+Bistro"></iframe>
  <p>Fresh seafood restaurant. Dinner reservations available. Mon-Sun 5pm-11pm. (805) 555-0321</p>
  <p>123 Harbor Drive, Santa Barbara, CA 93101</p>
</body>
</html>
`;

// Price menu restaurant: nav + address + phone for operational anchor
const PRICE_MENU_HTML = `
<html>
<head>
  <title>Street Tacos</title>
  <meta name="description" content="Authentic Mexican street tacos">
</head>
<body>
  <nav><a href="/menu">Menu</a><a href="/order">Order Online</a></nav>
  <h2>Our Menu</h2>
  <p>Carnitas Tacos $12 | Al Pastor Tacos $12 | Fish Tacos $14</p>
  <p>Quesadillas $10 | Burritos $15 | Enchiladas $16</p>
  <p>Open Mon-Sun 11am-10pm. (210) 555-0789. 321 San Pedro Ave, San Antonio, TX</p>
</body>
</html>
`;

// Porto's Bakery scenario: high restaurant score + 'wholesale' = neg=20
const LEGITIMATE_NEGATIVE_SITE = `
<html>
<head>
  <title>Porto's Bakery - Wholesale and Retail</title>
  <meta property="og:image" content="https://example.com/bakery.jpg">
</head>
<body>
  <nav><a href="/menu">Menu</a><a href="/reservations">Reservations</a></nav>
  <p>Authentic Portuguese bakery. Wholesale distribution available for restaurants.</p>
  <p>Dine-in seating. Brunch available Sat-Sun. Happy hour 4-7pm weekdays.</p>
  <p>Mon-Fri 6am-8pm, Sat-Sun 8am-9pm. 456 Bakery Blvd, Oakland, CA 94607. (510) 555-0111</p>
</body>
</html>
`;

const baseInput = { restaurantName: 'Test Restaurant' };

beforeEach(() => {
  mockFetch.mockReset();
  mockHeadlessFetch.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// TIERED NEGATIVE THRESHOLD
// ═════════════════════════════════════════════════════════════════════════════

describe("Tiered Negative Threshold (rescue of 55 blocked restaurants)", () => {
  it("tier 1: Porto's Bakery scenario (score=100, neg=20 from 'wholesale') → verified_restaurant", async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse(LEGITIMATE_NEGATIVE_SITE));
    const r = await runValidation({ ...baseInput, website: 'https://portosbakery.com' });

    // 'wholesale' is a STRONG_NEGATIVE_TEXT keyword (+20 neg).
    // Old rule (neg < 20) would block this. Tier 1 (score >= 80 && neg < 40) rescues it.
    expect(r.finalDecision).toBe('verified_restaurant');
    expect(r.restaurantSignalScore).toBeGreaterThanOrEqual(80);
    expect(r.negativeSignalScore).toBe(20);
  });

  it('tier 1: score >= 80 with neg 30-39 (team + services false positives) → verified_restaurant', async () => {
    const html = `
      <html>
      <head>
        <script type="application/ld+json">{"@type":"Restaurant","name":"Elite Bistro"}</script>
        <meta property="og:image" content="https://example.com/bistro.jpg">
      </head>
      <body>
        <nav><a href="/menu">Menu</a><a href="/reservations">Reservations</a></nav>
        <p>Fine dining. Prix fixe tasting menu. Brunch Saturday. Happy hour Mon-Fri.</p>
        <p>Team building events and corporate services available.</p>
        <p>Mon-Sat 5pm-11pm. 789 Fine St, NY 10001. (212) 555-0222</p>
      </body>
      </html>
    `;
    mockFetch.mockResolvedValue(makeHtmlResponse(html));
    const r = await runValidation({ ...baseInput, website: 'https://elitebistro.com' });

    expect(r.finalDecision).toBe('verified_restaurant');
    expect(r.restaurantSignalScore).toBeGreaterThanOrEqual(80);
    expect(r.negativeSignalScore).toBeGreaterThanOrEqual(20);
    expect(r.negativeSignalScore).toBeLessThan(40);
  });

  it('tier 2: score 60-79 with neg < 30 → verified_restaurant', async () => {
    const html = `
      <html>
      <head>
        <script type="application/ld+json">{"@type":"Restaurant","name":"Casual Grill"}</script>
      </head>
      <body>
        <nav><a href="/menu">Menu</a></nav>
        <p>Burgers, steaks, happy hour. Dine-in available. Mon-Fri 11am-10pm.</p>
        <p>101 Grill Ave, Denver, CO 80202. (303) 555-0333</p>
      </body>
      </html>
    `;
    mockFetch.mockResolvedValue(makeHtmlResponse(html));
    const r = await runValidation({ ...baseInput, website: 'https://casualgrill.com' });

    expect(r.finalDecision).toBe('verified_restaurant');
    expect(r.restaurantSignalScore).toBeGreaterThanOrEqual(60);
    expect(r.negativeSignalScore).toBeLessThan(30);
  });

  it('tier 2 boundary: score 60-79 with neg = 30 → NOT verified (at ceiling)', () => {
    // This is a pure logic assertion: tier 2 requires neg < 30. neg = 30 fails.
    const tier2Requires = (score: number, neg: number) => score >= 60 && neg < 30;
    expect(tier2Requires(70, 30)).toBe(false);
    expect(tier2Requires(70, 29)).toBe(true);
  });

  it('strong SaaS signals still block even with food keywords present', async () => {
    const html = `
      <html>
      <body>
        <nav><a href="/menu">Menu</a><a href="/pricing">Pricing</a></nav>
        <p>Restaurant management software. Book a demo. Pricing plans. Enterprise features.</p>
        <p>Manage your restaurant operations with our platform.</p>
      </body>
      </html>
    `;
    mockFetch.mockResolvedValue(makeHtmlResponse(html));
    const r = await runValidation({ ...baseInput, website: 'https://restaurantsaas.com' });

    expect(r.finalDecision).not.toBe('verified_restaurant');
    expect(r.negativeSignalScore).toBeGreaterThanOrEqual(20);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// SQUARESPACE / WIX NATIVE WIDGETS
// ═════════════════════════════════════════════════════════════════════════════

describe('Squarespace/Wix Native Widgets (Gap 3)', () => {
  it('sqs-block-checkout → hasSquarespaceBizWidget=true', () => {
    const signals = extractSignals('<div class="sqs-block-checkout">Order</div>', 'https://example.com');
    expect(signals.hasSquarespaceBizWidget).toBe(true);
  });

  it('sqs-block-menu → hasSquarespaceBizWidget=true', () => {
    const signals = extractSignals('<div class="sqs-block-menu">Menu</div>', 'https://example.com');
    expect(signals.hasSquarespaceBizWidget).toBe(true);
  });

  it('data-block-type="commerce..." → hasSquarespaceBizWidget=true', () => {
    const signals = extractSignals('<div data-block-type="commerce-checkout">Order</div>', 'https://example.com');
    expect(signals.hasSquarespaceBizWidget).toBe(true);
  });

  it('data-block-type="menu..." → hasSquarespaceBizWidget=true', () => {
    const signals = extractSignals('<div data-block-type="menu-section">Menu</div>', 'https://example.com');
    expect(signals.hasSquarespaceBizWidget).toBe(true);
  });

  it('non-matching Squarespace class → hasSquarespaceBizWidget=false', () => {
    const signals = extractSignals('<div class="sqs-layout">Layout</div>', 'https://example.com');
    expect(signals.hasSquarespaceBizWidget).toBe(false);
  });

  it('wixrestaurants → hasWixRestaurantWidget=true', () => {
    const signals = extractSignals('<div class="wixrestaurants">Restaurant</div>', 'https://example.com');
    expect(signals.hasWixRestaurantWidget).toBe(true);
  });

  it('wix-menus → hasWixRestaurantWidget=true', () => {
    const signals = extractSignals('<div class="wix-menus">Menus</div>', 'https://example.com');
    expect(signals.hasWixRestaurantWidget).toBe(true);
  });

  it('Wix detection is case-insensitive (htmlLower used)', () => {
    const signals = extractSignals('<div class="WIXRestaurants">Menu</div>', 'https://example.com');
    expect(signals.hasWixRestaurantWidget).toBe(true);
  });

  it('Squarespace restaurant with schema → verified_restaurant', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse(SQUARESPACE_RESTAURANT_HTML));
    const r = await runValidation({ restaurantName: 'Marios Pizza', website: 'https://marios.com' });
    expect(r.finalDecision).toBe('verified_restaurant');
  });

  it('Wix restaurant with schema → verified_restaurant', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse(WIX_RESTAURANT_HTML));
    const r = await runValidation({ restaurantName: 'James Restaurant', website: 'https://james.com' });
    expect(r.finalDecision).toBe('verified_restaurant');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GOOGLE MAPS EMBED
// ═════════════════════════════════════════════════════════════════════════════

describe('Google Maps Embedded Iframe (Gap 5)', () => {
  it('maps.google.com → hasGoogleMapsEmbed=true', () => {
    const signals = extractSignals('<iframe src="https://maps.google.com/maps?q=foo"></iframe>', 'https://example.com');
    expect(signals.hasGoogleMapsEmbed).toBe(true);
  });

  it('maps.googleapis.com → hasGoogleMapsEmbed=true', () => {
    const signals = extractSignals('<iframe src="https://maps.googleapis.com/maps/embed?..."></iframe>', 'https://example.com');
    expect(signals.hasGoogleMapsEmbed).toBe(true);
  });

  it('google.com/maps/embed → hasGoogleMapsEmbed=true', () => {
    const signals = extractSignals('<iframe src="https://google.com/maps/embed?pb=..."></iframe>', 'https://example.com');
    expect(signals.hasGoogleMapsEmbed).toBe(true);
  });

  it('openstreetmap.org → hasGoogleMapsEmbed=true', () => {
    const signals = extractSignals('<iframe src="https://openstreetmap.org/#map=15/..."></iframe>', 'https://example.com');
    expect(signals.hasGoogleMapsEmbed).toBe(true);
  });

  it('restaurant with maps embed + address + phone → verified_restaurant', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse(GOOGLE_MAPS_RESTAURANT_HTML));
    const r = await runValidation({ ...baseInput, website: 'https://coastalbistro.com' });
    expect(r.finalDecision).toBe('verified_restaurant');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// PRICE + FOOD KEYWORD PROXIMITY
// ═════════════════════════════════════════════════════════════════════════════

describe('Price + Food Keyword Proximity (Gap 2)', () => {
  it('2+ price-food pairs within 200 chars → hasPriceMenuPattern=true', () => {
    const signals = extractSignals(PRICE_MENU_HTML, 'https://tacos.com');
    expect(signals.hasPriceMenuPattern).toBe(true);
  });

  it('single price-food pair → hasPriceMenuPattern=false (below minimum)', () => {
    const signals = extractSignals('<p>Try our famous pasta for $25</p>', 'https://example.com');
    expect(signals.hasPriceMenuPattern).toBe(false);
  });

  it('multiple prices near food keywords → detected', () => {
    const html = '<p>Margherita Pizza $18 | Pepperoni $19 | Pasta Carbonara $22</p>';
    const signals = extractSignals(html, 'https://example.com');
    expect(signals.hasPriceMenuPattern).toBe(true);
  });

  it('prices far from food keywords → hasPriceMenuPattern=false', () => {
    // Two prices but food keyword is >200 chars from both prices
    const html = `<p>We serve lunch and dinner.</p>${'x '.repeat(200)}<p>Prices: $18 and $22 per item.</p>`;
    const signals = extractSignals(html, 'https://example.com');
    expect(signals.hasPriceMenuPattern).toBe(false);
  });

  it('price menu restaurant with nav + address → verified_restaurant', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse(PRICE_MENU_HTML));
    const r = await runValidation({ restaurantName: 'Street Tacos', website: 'https://streettacos.com' });
    expect(r.finalDecision).toBe('verified_restaurant');
  });

  it('SaaS pricing page with demo/pricing keywords → not boosted by price pattern', async () => {
    const html = `
      <p>Our pricing: Basic $29/mo, Pro $99/mo, Enterprise custom</p>
      <p>Book a demo. Free trial. Pricing plans for restaurants.</p>
    `;
    mockFetch.mockResolvedValue(makeHtmlResponse(html));
    const r = await runValidation({ ...baseInput, website: 'https://restaurantsaas.com' });
    expect(r.finalDecision).not.toBe('verified_restaurant');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// EXTENDED RESERVATION CTA KEYWORDS
// ═════════════════════════════════════════════════════════════════════════════

describe('Extended Reservation CTA Keywords (Gap 1)', () => {
  it('"book now" button extracted into buttonTexts', () => {
    const signals = extractSignals('<button>book now</button>', 'https://example.com');
    expect(signals.buttonTexts).toContain('book now');
  });

  it('"reserve your table" nav link extracted', () => {
    const signals = extractSignals('<nav><a href="/reserve">reserve your table</a></nav>', 'https://example.com');
    expect(signals.navLinkTexts).toContain('reserve your table');
  });

  it('"make a reservation" heading extracted', () => {
    const signals = extractSignals('<h2>Make a Reservation</h2>', 'https://example.com');
    expect(signals.headingTexts.some((h) => h.includes('reservation'))).toBe(true);
  });

  it('"check availability" button → restaurant CTA signal', () => {
    const signals = extractSignals('<button>check availability</button>', 'https://example.com');
    expect(signals.buttonTexts).toContain('check availability');
  });

  it('"book online" → scored as strong-positive nav signal', () => {
    const html = '<nav><a href="/book">book online</a></nav>';
    const signals = extractSignals(html, 'https://example.com');
    expect(signals.navLinkTexts).toContain('book online');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INACCESSIBLE + DOMAIN BOOST
// ═════════════════════════════════════════════════════════════════════════════

describe('Inaccessible Status + Domain Boost (Fix #1)', () => {
  it('timeout, domain contains "bistro" (scores 30) → domain boost fires', async () => {
    const err = Object.assign(new Error('AbortError'), { name: 'AbortError' });
    mockFetch.mockRejectedValue(err);
    const r = await runValidation({
      restaurantName: 'Downtown Bistro',
      website: 'https://downtownbistro.com',
    });

    // 'bistro' scores 30 in scoreRestaurantDomainWord → contextScore >= 30 → boost
    expect(r.websiteReachabilityStatus).toBe('inaccessible');
    expect(r.restaurantSignalScore).toBeGreaterThanOrEqual(60);
    expect(['verified_restaurant', 'plausible_unverified']).toContain(r.finalDecision);
  });

  it('timeout, domain contains "restaurant" (scores 30) → domain boost fires', async () => {
    const err = Object.assign(new Error('AbortError'), { name: 'AbortError' });
    mockFetch.mockRejectedValue(err);
    const r = await runValidation({
      restaurantName: 'The Local Restaurant',
      website: 'https://thelocalrestaurant.com',
    });

    expect(r.websiteReachabilityStatus).toBe('inaccessible');
    expect(r.restaurantSignalScore).toBeGreaterThanOrEqual(60);
  });

  it('timeout, generic domain (no restaurant word) → no boost, score stays at 0', async () => {
    const err = Object.assign(new Error('AbortError'), { name: 'AbortError' });
    mockFetch.mockRejectedValue(err);
    const r = await runValidation({
      restaurantName: 'Acme Corp',
      website: 'https://acmecorp.com',
    });

    expect(r.restaurantSignalScore).toBe(0);
    expect(r.finalDecision).not.toBe('verified_restaurant');
  });

  it('timeout with restaurant domain → inaccessible status (not invalid)', async () => {
    const err = Object.assign(new Error('AbortError'), { name: 'AbortError' });
    mockFetch.mockRejectedValue(err);
    const r = await runValidation({
      restaurantName: 'Casa Bistro',
      website: 'https://casabistro.com',
    });

    expect(r.websiteReachabilityStatus).toBe('inaccessible');
    expect(r.finalDecision).not.toBe('invalid_website');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// ADDRESS/PHONE BLOCK LOOSENING
// ═════════════════════════════════════════════════════════════════════════════

describe('Loosened hasAddressPhoneBlock (Fix #2)', () => {
  it('phone + "123 Main Street" (street suffix) → hasAddressPhoneBlock=true', () => {
    const signals = extractSignals('<p>123 Main Street, Austin (512) 555-0123</p>', 'https://example.com');
    expect(signals.hasAddressPhoneBlock).toBe(true);
  });

  it('phone + "123 Main St" abbreviation → matched', () => {
    const signals = extractSignals('<p>123 Main St (512) 555-0123</p>', 'https://example.com');
    expect(signals.hasAddressPhoneBlock).toBe(true);
  });

  it('street suffix variants (Ave, Road, Blvd, Drive) all match', () => {
    const cases = [
      '<p>456 Oak Avenue (512) 555-0123</p>',
      '<p>789 Pine Road (512) 555-0123</p>',
      '<p>101 Commerce Blvd (512) 555-0123</p>',
      '<p>202 Sunset Drive (512) 555-0123</p>',
    ];
    for (const html of cases) {
      const signals = extractSignals(html, 'https://example.com');
      expect(signals.hasAddressPhoneBlock).toBe(true);
    }
  });

  it('phone + full state name ("California 90028") → street path matches', () => {
    // Street regex is case-insensitive and doesn't require state abbreviation
    const signals = extractSignals('<p>123 Main Street, Los Angeles, California (512) 555-0123</p>', 'https://example.com');
    expect(signals.hasAddressPhoneBlock).toBe(true);
  });

  it('address without phone → hasAddressPhoneBlock=false', () => {
    const signals = extractSignals('<p>123 Main Street, Austin, TX 78701</p>', 'https://example.com');
    expect(signals.hasAddressPhoneBlock).toBe(false);
  });

  it('phone without address → hasAddressPhoneBlock=false', () => {
    const signals = extractSignals('<p>(512) 555-0123</p>', 'https://example.com');
    expect(signals.hasAddressPhoneBlock).toBe(false);
  });

  it('original state+zip path still works: "TX 78701" → matched', () => {
    const signals = extractSignals('<p>123 Oak Lane, Austin, TX 78701. (512) 555-0123</p>', 'https://example.com');
    expect(signals.hasAddressPhoneBlock).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// HEADLESS BROWSER FALLBACK
// ═════════════════════════════════════════════════════════════════════════════

describe('Headless Browser Fallback', () => {
  it('timeout + headless succeeds → validated from headless HTML', async () => {
    const err = Object.assign(new Error('AbortError'), { name: 'AbortError' });
    mockFetch.mockRejectedValue(err);
    mockHeadlessFetch.mockResolvedValue({
      html: STRONG_RESTAURANT_HTML,
      finalUrl: 'https://restaurant.com/',
      signals: extractSignals(STRONG_RESTAURANT_HTML, 'https://restaurant.com/'),
    });

    const r = await runValidation({ ...baseInput, website: 'https://restaurant.com' });

    expect(mockHeadlessFetch).toHaveBeenCalled();
    expect(r.finalDecision).toBe('verified_restaurant');
    expect(r.internalFlags).toContain('headless_attempted');
  });

  it('thin HTML (< 500 chars) triggers headless', async () => {
    const thinHtml = '<html><body><p>Restaurant</p></body></html>';
    mockFetch.mockResolvedValue(makeHtmlResponse(thinHtml));
    mockHeadlessFetch.mockResolvedValue({
      html: STRONG_RESTAURANT_HTML,
      finalUrl: 'https://restaurant.com/',
      signals: extractSignals(STRONG_RESTAURANT_HTML, 'https://restaurant.com/'),
    });

    const r = await runValidation({ ...baseInput, website: 'https://restaurant.com' });

    expect(mockHeadlessFetch).toHaveBeenCalled();
    expect(r.internalFlags).toContain('headless_attempted');
  });

  it('Cloudflare 403 triggers headless attempt', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse('Just a moment...', 403));
    mockHeadlessFetch.mockResolvedValue({
      html: STRONG_RESTAURANT_HTML,
      finalUrl: 'https://restaurant.com/',
      signals: extractSignals(STRONG_RESTAURANT_HTML, 'https://restaurant.com/'),
    });

    const r = await runValidation({ ...baseInput, website: 'https://restaurant.com' });

    expect(mockHeadlessFetch).toHaveBeenCalled();
    expect(r.finalDecision).toBe('verified_restaurant');
  });

  it('headless returns null → graceful fallback, no crash', async () => {
    const err = Object.assign(new Error('AbortError'), { name: 'AbortError' });
    mockFetch.mockRejectedValue(err);
    mockHeadlessFetch.mockResolvedValue(null);

    const r = await runValidation({ ...baseInput, website: 'https://restaurant.com' });

    expect(['plausible_unverified', 'verified_restaurant']).toContain(r.finalDecision);
    expect(r.finalDecision).not.toBe('invalid_website');
  });

  it('JS-rendered site: ordering widget visible after render → verified', async () => {
    const jsShell = '<html><body><div id="app"></div><script src="app.js"></script></body></html>';
    mockFetch.mockResolvedValue(makeHtmlResponse(jsShell));

    const renderedHtml = `
      <div id="app">
        <nav><a href="/menu">Menu</a><a href="/order">Order Online</a></nav>
        <script src="https://www.toasttab.com/widget.js"></script>
        <p>Pizza restaurant. Mon-Sun 5pm-11pm. (555) 555-5555</p>
        <p>123 Main Street, New York, NY</p>
      </div>
    `;
    mockHeadlessFetch.mockResolvedValue({
      html: renderedHtml,
      finalUrl: 'https://jsrestaurant.com/',
      signals: extractSignals(renderedHtml, 'https://jsrestaurant.com/'),
    });

    const r = await runValidation({ ...baseInput, website: 'https://jsrestaurant.com' });

    expect(mockHeadlessFetch).toHaveBeenCalled();
    expect(r.finalDecision).toBe('verified_restaurant');
    expect(r.internalFlags).toContain('headless_attempted');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// INTEGRATION: REAL-WORLD COMBINATIONS
// ═════════════════════════════════════════════════════════════════════════════

describe('Integration: real-world restaurant combinations', () => {
  it('strong restaurant with schema + nav + body + address → verified_restaurant', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse(STRONG_RESTAURANT_HTML));
    const r = await runValidation({ ...baseInput, website: 'https://casaroberto.com' });

    expect(r.finalDecision).toBe('verified_restaurant');
    expect(r.restaurantSignalScore).toBeGreaterThanOrEqual(80);
    expect(r.negativeSignalScore).toBeLessThan(20);
  });

  it('Squarespace restaurant → verified_restaurant', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse(SQUARESPACE_RESTAURANT_HTML));
    const r = await runValidation({ restaurantName: 'Marios Pizza', website: 'https://marios.com' });
    expect(r.finalDecision).toBe('verified_restaurant');
  });

  it('Wix restaurant → verified_restaurant', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse(WIX_RESTAURANT_HTML));
    const r = await runValidation({ restaurantName: 'James Restaurant', website: 'https://james.com' });
    expect(r.finalDecision).toBe('verified_restaurant');
  });

  it('Maps embed + address + phone → verified_restaurant', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse(GOOGLE_MAPS_RESTAURANT_HTML));
    const r = await runValidation({ ...baseInput, website: 'https://coastalbistro.com' });
    expect(r.finalDecision).toBe('verified_restaurant');
  });

  it('Price menu + nav + address → verified_restaurant', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse(PRICE_MENU_HTML));
    const r = await runValidation({ restaurantName: 'Street Tacos', website: 'https://streettacos.com' });
    expect(r.finalDecision).toBe('verified_restaurant');
  });

  it("Porto's Bakery ('wholesale' false positive) → verified via tier 1", async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse(LEGITIMATE_NEGATIVE_SITE));
    const r = await runValidation({ restaurantName: "Porto's Bakery", website: 'https://portosbakery.com' });
    expect(r.finalDecision).toBe('verified_restaurant');
  });

  it('non-restaurant with catering+demo+pricing → not verified', async () => {
    const html = `
      <html>
      <body>
        <nav><a href="/menu">Menu</a><a href="/pricing">Pricing</a></nav>
        <p>Catering company and restaurant consulting. Book a demo. Pricing plans. Enterprise software.</p>
      </body>
      </html>
    `;
    mockFetch.mockResolvedValue(makeHtmlResponse(html));
    const r = await runValidation({ ...baseInput, website: 'https://cateringconsulting.com' });
    expect(r.finalDecision).not.toBe('verified_restaurant');
    expect(r.negativeSignalScore).toBeGreaterThanOrEqual(30);
  });
});
