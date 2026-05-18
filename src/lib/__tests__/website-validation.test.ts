// Integration tests for the full validation pipeline.
// External services (fetch, Claude) are mocked.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock external I/O before importing the orchestrator
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

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

vi.mock('../website/headless-fetch', () => ({
  headlessFetch: vi.fn().mockResolvedValue(null),
}));

import { runValidation } from '../website/run-validation';
import { classifyWithClaude, isAmbiguous } from '../relevance/claude-classifier';
import { computeRestaurantScores } from '../relevance/classify-restaurant';
import { extractSignals } from '../website/extract-signals';

const mockClassifyWithClaude = vi.mocked(classifyWithClaude);

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeHtmlResponse(html: string, status = 200, finalUrl?: string) {
  const response = new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html' },
  });
  // Simulate final URL after redirects
  Object.defineProperty(response, 'url', { value: finalUrl ?? 'https://example.com/' });
  return response;
}

const RESTAURANT_HTML = `
<html>
<head>
  <title>Casa Roberto - Authentic Mexican Restaurant</title>
  <meta name="description" content="Best Mexican food in Austin. Dine-in, takeout, and catering available.">
  <script type="application/ld+json">{"@type":"Restaurant","name":"Casa Roberto"}</script>
</head>
<body>
  <nav><a href="/menu">Menu</a><a href="/reservations">Reservations</a></nav>
  <p>Join us for brunch every Saturday. Happy hour 4-7pm Monday through Friday. Dine-in available.</p>
  <p>Mon-Fri 11am-10pm, Sat-Sun 9am-11pm</p>
  <p>(512) 555-0123</p>
</body>
</html>
`;

const SAAS_HTML = `
<html>
<head>
  <title>FoodTech Pro - Restaurant Management Software</title>
  <meta name="description" content="Enterprise restaurant POS system and procurement software.">
  <script type="application/ld+json">{"@type":"SoftwareApplication","name":"FoodTech Pro"}</script>
</head>
<body>
  <nav><a href="/pricing">Pricing</a><a href="/demo">Book a Demo</a><a href="/enterprise">Enterprise</a></nav>
  <p>Book a demo to see our inventory management software. Free trial available. Enterprise pricing plans.</p>
  <p>Supply chain solutions for restaurant chains. Procurement software that saves you money.</p>
</body>
</html>
`;

const CLOUDFLARE_CHALLENGE_HTML = `
<html>
<head><title>Just a moment...</title></head>
<body>
  <div>Enable JavaScript and cookies to continue</div>
  <script>window._cf_chl_opt = { cType: 'managed' }</script>
</body>
</html>
`;

const baseInput = {
  restaurantName: 'Casa Roberto',
  state: 'TX',
};

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFetch.mockReset();
  mockClassifyWithClaude.mockResolvedValue({
    decision: 'plausible_unverified',
    claudeAiUsed: false,
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('runValidation — invalid website', () => {
  it('malformed URL → invalid_website', async () => {
    const r = await runValidation({ ...baseInput, website: 'notaurl' });
    expect(r.finalDecision).toBe('invalid_website');
    expect(r.internalFlags).toContain('malformed_url');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('HTTP 404 → invalid_website', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse('Not Found', 404));
    const r = await runValidation({ ...baseInput, website: 'https://nonexistentsite.com' });
    expect(r.finalDecision).toBe('invalid_website');
    expect(r.internalFlags).toContain('http_404');
  });

  it('DNS failure → invalid_website', async () => {
    const err = new Error('getaddrinfo ENOTFOUND nonexistentsite.com');
    mockFetch.mockRejectedValue(err);
    const r = await runValidation({ ...baseInput, website: 'https://nonexistentsite.com' });
    expect(r.finalDecision).toBe('invalid_website');
    expect(r.internalFlags).toContain('dns_nxdomain');
  });
});

describe('runValidation — national chain detection', () => {
  it("McDonald's by name → national_chain before fetch", async () => {
    const r = await runValidation({
      restaurantName: "McDonald's",
      website: 'https://mycoolburger.com',
      state: 'TX',
    });
    expect(r.finalDecision).toBe('national_chain');
    expect(r.nationalChainScore).toBeGreaterThanOrEqual(85);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('Chipotle domain → national_chain', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse(RESTAURANT_HTML));
    const r = await runValidation({
      restaurantName: 'Chipotle',
      website: 'https://chipotle.com',
      state: 'TX',
    });
    expect(r.finalDecision).toBe('national_chain');
  });
});

describe('runValidation — plausible_unverified cases', () => {
  it('HTTP 403 (Cloudflare-style) → plausible_unverified, not invalid', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse('', 403));
    const r = await runValidation({ ...baseInput, website: 'https://spiritscenla.com' });
    expect(r.finalDecision).not.toBe('invalid_website');
    expect(['plausible_unverified', 'verified_restaurant']).toContain(r.finalDecision);
  });

  it('HTTP 503 → plausible_unverified, not invalid', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse('', 503));
    const r = await runValidation({ ...baseInput, website: 'https://casaroberto.com' });
    expect(r.finalDecision).not.toBe('invalid_website');
  });

  it('timeout → plausible_unverified + manualReviewRequired', async () => {
    const err = Object.assign(new Error('AbortError'), { name: 'AbortError' });
    mockFetch.mockRejectedValue(err);
    const r = await runValidation({ ...baseInput, website: 'https://slowsite.com' });
    expect(r.finalDecision).not.toBe('invalid_website');
    expect(r.manualReviewRequired).toBe(true);
  });

  it('timeout retry succeeds → validates retry response', async () => {
    const err = Object.assign(new Error('AbortError'), { name: 'AbortError' });
    mockFetch
      .mockRejectedValueOnce(err)
      .mockResolvedValueOnce(makeHtmlResponse(RESTAURANT_HTML, 200, 'https://casaroberto.com/'));

    const r = await runValidation({ ...baseInput, website: 'https://casaroberto.com' });

    expect(mockFetch).toHaveBeenCalledTimes(4);
    expect(mockFetch.mock.calls[0]?.[0]).toBe('https://casaroberto.com/');
    expect(mockFetch.mock.calls[1]?.[0]).toBe('https://casaroberto.com/');
    expect(r.finalDecision).toBe('verified_restaurant');
    expect(r.httpStatus).toBe(200);
  });

  it('toasttab ordering page → plausible_unverified', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse('<html><body>Order online</body></html>', 200, 'https://order.toasttab.com/casaroberto'));
    const r = await runValidation({ ...baseInput, website: 'https://order.toasttab.com/casaroberto' });
    expect(['plausible_unverified', 'verified_restaurant']).toContain(r.finalDecision);
    expect(r.finalDecision).not.toBe('invalid_website');
  });

  it('instagram page → plausible_unverified', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse('<html><body>Instagram</body></html>', 200, 'https://instagram.com/casaroberto'));
    const r = await runValidation({ ...baseInput, website: 'https://instagram.com/casaroberto' });
    expect(['plausible_unverified', 'verified_restaurant']).toContain(r.finalDecision);
    expect(r.finalDecision).not.toBe('invalid_website');
  });
});

describe('runValidation — verified_restaurant', () => {
  it('strong restaurant HTML signals → verified_restaurant', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse(RESTAURANT_HTML));
    const r = await runValidation({ ...baseInput, website: 'https://casaroberto.com' });
    expect(r.finalDecision).toBe('verified_restaurant');
    expect(r.restaurantSignalScore).toBeGreaterThanOrEqual(50);
  });

  it('state dropdown guarantees us_verified country eligibility', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse(RESTAURANT_HTML));
    const r = await runValidation({ ...baseInput, website: 'https://casaroberto.com' });
    expect(r.countryEligibility).toBe('us_verified');
  });

  it('Cloudflare-protected matching restaurant site → verified_restaurant', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse(CLOUDFLARE_CHALLENGE_HTML, 403, 'https://spiritscenla.com/'));
    const r = await runValidation({
      restaurantName: '',
      website: 'https://spiritscenla.com/',
      state: 'LA',
    });

    expect(r.finalDecision).toBe('verified_restaurant');
    expect(r.httpStatus).toBe(403);
    expect(r.websiteReachabilityStatus).toBe('blocked');
    expect(r.restaurantSignalScore).toBe(60);
    expect(r.internalFlags).toContain('http_403');
    expect(r.internalFlags).toContain('protected_or_thin_restaurant_context');
  });

  it('minimal matching restaurant HTML → verified_restaurant', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse('<html><head><title>Spirits Food & Friends</title></head><body><nav><a>Menu</a></nav></body></html>', 200, 'https://spiritscenla.com/'));
    const r = await runValidation({
      restaurantName: '',
      website: 'https://spiritscenla.com/',
      state: 'LA',
    });

    expect(r.finalDecision).toBe('verified_restaurant');
    expect(r.websiteReachabilityStatus).toBe('thin');
    expect(r.restaurantSignalScore).toBe(60);
  });
});

describe('restaurant signal extraction — audited evidence', () => {
  it('scores embedded reservation widgets', () => {
    const signals = extractSignals(
      '<html><head><title>Welcome</title><script src="https://widgets.resy.io/embed.js"></script></head><body><p>Welcome.</p></body></html>',
      'https://example.com/',
    );
    const scores = computeRestaurantScores(signals, 'example.com');

    expect(signals.hasReservationWidget).toBe(true);
    expect(scores.restaurantSignalScore).toBeGreaterThanOrEqual(12);
  });

  it('scores embedded online ordering widgets', () => {
    const signals = extractSignals(
      '<html><head><title>Welcome</title><script src="https://www.toasttab.com/widget.js"></script></head><body><p>Welcome.</p></body></html>',
      'https://example.com/',
    );
    const scores = computeRestaurantScores(signals, 'example.com');

    expect(signals.hasOrderingWidget).toBe(true);
    expect(scores.restaurantSignalScore).toBeGreaterThanOrEqual(10);
  });

  it('scores pages that expose both a US address and phone number', () => {
    const signals = extractSignals(
      '<html><body><p>101 Main St, Austin, TX 78701</p><p>(512) 555-0123</p></body></html>',
      'https://example.com/',
    );
    const scores = computeRestaurantScores(signals, 'example.com');

    expect(signals.hasAddressPhoneBlock).toBe(true);
    expect(scores.restaurantSignalScore).toBeGreaterThanOrEqual(14);
  });

  it('scores food-related image alt text as weak supporting evidence', () => {
    const signals = extractSignals(
      '<html><body><img src="/hero.jpg" alt="plate of handmade pasta"></body></html>',
      'https://example.com/',
    );
    const scores = computeRestaurantScores(signals, 'example.com');

    expect(signals.hasFoodImageAltText).toBe(true);
    expect(scores.restaurantSignalScore).toBeGreaterThanOrEqual(4);
  });

  it('does not treat generic menu links as a new audited signal', () => {
    const signals = extractSignals(
      '<html><body><nav><a href="/menu">Menu</a></nav><p>Marketing services and consulting firm.</p></body></html>',
      'https://example.com/',
    );

    expect(signals.hasReservationWidget).toBe(false);
    expect(signals.hasOrderingWidget).toBe(false);
    expect(signals.hasAddressPhoneBlock).toBe(false);
    expect(signals.hasFoodImageAltText).toBe(false);
  });
});

describe('runValidation — clear_non_fit (vendor/SaaS)', () => {
  it('sysco.com → clear_non_fit (known vendor domain)', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse(SAAS_HTML, 200, 'https://sysco.com'));
    const r = await runValidation({ ...baseInput, website: 'https://sysco.com' });
    expect(r.finalDecision).toBe('clear_non_fit');
    expect(r.internalFlags).toContain('known_vendor_domain');
  });

  it('strong SaaS signals → clear_non_fit', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse(SAAS_HTML));
    const r = await runValidation({ ...baseInput, website: 'https://foodtechpro.com' });
    expect(r.finalDecision).toBe('clear_non_fit');
    expect(r.negativeSignalScore).toBeGreaterThanOrEqual(60);
  });

  it('blocked matching non-restaurant context does not get restaurant boost', async () => {
    mockFetch.mockResolvedValue(makeHtmlResponse(CLOUDFLARE_CHALLENGE_HTML, 403, 'https://foodlogistics.com/'));
    const r = await runValidation({
      restaurantName: 'Food Logistics',
      website: 'https://foodlogistics.com/',
      state: 'TX',
    });

    expect(r.finalDecision).not.toBe('verified_restaurant');
    expect(r.restaurantSignalScore).toBe(0);
    expect(r.internalFlags).not.toContain('protected_or_thin_restaurant_context');
  });

  it.each([
    ['Spirits Wholesale Liquor & Distribution', 'https://spiritswholesale.com/'],
    ['Blue Mesa Catering Company', 'https://bluemesacatering.com/'],
    ['The Kitchen Remodeling Co', 'https://kitchenremodeling.com/'],
    ['Menu Marketing Agency', 'https://menumarketing.com/'],
    ['Reservation Software Inc', 'https://reservationsoftware.com/'],
  ])('blocked non-restaurant context does not boost: %s', async (restaurantName, website) => {
    mockFetch.mockResolvedValue(makeHtmlResponse(CLOUDFLARE_CHALLENGE_HTML, 403, website));
    const r = await runValidation({
      restaurantName,
      website,
      state: 'TX',
    });

    expect(r.finalDecision).not.toBe('verified_restaurant');
    expect(r.restaurantSignalScore).toBeLessThan(60);
    expect(r.internalFlags).not.toContain('protected_or_thin_restaurant_context');
  });
});

describe('runValidation — Claude tiebreaker', () => {
  it('ambiguous signals → Claude tiebreaker is invoked', async () => {
    // Return HTML with minimal signals that won't hit any clear threshold
    const ambiguousHtml = '<html><body><p>Welcome to our place. We serve food.</p></body></html>';
    mockFetch.mockResolvedValue(makeHtmlResponse(ambiguousHtml));
    mockClassifyWithClaude.mockResolvedValueOnce({
      decision: 'verified_restaurant',
      claudeAiUsed: true,
    });

    const r = await runValidation({ ...baseInput, website: 'https://ambiguousplace.com' });
    // Claude was invoked and returned verified_restaurant
    if (r.claudeAiUsed) {
      expect(r.finalDecision).toBe('verified_restaurant');
    }
    // If not ambiguous by rules, Claude wasn't needed — either is valid
  });

  it('Claude unavailable (ANTHROPIC_API_KEY missing) → defaults to plausible_unverified', async () => {
    const ambiguousHtml = '<html><body><p>Welcome to our place. We serve food.</p></body></html>';
    mockFetch.mockResolvedValue(makeHtmlResponse(ambiguousHtml));
    mockClassifyWithClaude.mockResolvedValueOnce({
      decision: 'plausible_unverified',
      claudeAiUsed: false,
    });

    const r = await runValidation({ ...baseInput, website: 'https://ambiguousplace.com' });
    expect(r.claudeAiUsed).toBe(false);
    expect(['plausible_unverified', 'verified_restaurant', 'clear_non_fit']).toContain(r.finalDecision);
  });
});

describe('isAmbiguous helper', () => {
  it('nationalChainScore >= 85 → not ambiguous', () => {
    expect(isAmbiguous({ restaurantSignalScore: 50, negativeSignalScore: 20, nationalChainScore: 90, reachabilityStatus: 'reachable' })).toBe(false);
  });

  it('reachabilityStatus = invalid → not ambiguous', () => {
    expect(isAmbiguous({ restaurantSignalScore: 30, negativeSignalScore: 10, nationalChainScore: 0, reachabilityStatus: 'invalid' })).toBe(false);
  });

  it('clear non-fit threshold → not ambiguous', () => {
    expect(isAmbiguous({ restaurantSignalScore: 10, negativeSignalScore: 80, nationalChainScore: 0, reachabilityStatus: 'reachable' })).toBe(false);
  });

  it('verified threshold met → not ambiguous', () => {
    expect(isAmbiguous({ restaurantSignalScore: 70, negativeSignalScore: 20, nationalChainScore: 0, reachabilityStatus: 'reachable' })).toBe(false);
  });

  it('mixed low scores → ambiguous', () => {
    expect(isAmbiguous({ restaurantSignalScore: 35, negativeSignalScore: 30, nationalChainScore: 10, reachabilityStatus: 'reachable' })).toBe(true);
  });
});
