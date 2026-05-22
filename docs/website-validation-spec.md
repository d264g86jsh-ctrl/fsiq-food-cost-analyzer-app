# Website Validation Spec — FSIQ Food Cost Analyzer

SOP reference: `docs/FSIQ_SOP_v3.3.md` (primary) / `docs/FSIQ_SOP_v3.3.pdf` (archive)  
Status: Spec only — no implementation yet.  
UX context: Validation runs during the quiz flow (see `docs/analyzer-ux-flow.md`). The `website` and `zip_code` fields appear in Step 1 (qualification fields) so validation fires before the user reaches contact fields.

---

## U.S.-Only Eligibility

The analyzer is for **U.S.-based restaurants only** in v1. International operators are not eligible for automated reports.

- ZIP/postal code field accepts U.S. 5-digit ZIP and ZIP+4 only. Canadian and international postal codes are not supported in v1.
- Google Places searches are biased/restricted to U.S. results. A non-U.S. Place result does not count as `verified_restaurant`.
- If country cannot be confirmed as U.S., classify as `plausible_unverified` (if plausibly U.S.) or route to manual review. Never auto-generate a full personalized PDF for a non-U.S. lead.
- Do not use harsh language ("we don't serve your country"). Use soft, neutral messaging.

### countryEligibility Values

| Value | Meaning |
|---|---|
| `us_verified` | U.S. ZIP valid + Google Places confirms U.S. address |
| `likely_us` | U.S. ZIP format valid; Places not queried or returned no result |
| `non_us` | ZIP or Places result indicates non-U.S. location |
| `unknown` | Cannot determine country from available signals |

---

## Decision Outputs

| Decision | Meaning | PDF | Email |
|---|---|---|---|
| `verified_restaurant` | High-confidence independent U.S. restaurant | Full personalized PDF | Qualified email |
| `plausible_unverified` | Unclear, blocked, thin, mixed, or plausibly U.S. but unconfirmed | Conservative profile-based PDF (no website-specific claims) | Qualified email (generic framing) |
| `clear_non_fit` | Clearly not a restaurant (SaaS, supplier, agency) **or** non-U.S. (`internalFlag: non_us_ineligible`) | None | Polite DQ email (vendor) or polite ineligible message (non-U.S.) |
| `national_chain` | Matched national chain list | None | National chain DQ email |
| `invalid_website` | Confirmed 404, DNS NXDOMAIN, or malformed URL only | None | Invalid website DQ email |
| `below_threshold` | Spend < $500K (post-qualification) | None | Below threshold DQ email |

**PDF eligibility rules:**
- Full personalized PDF: `verified_restaurant` + `countryEligibility` is `us_verified` or `likely_us` + not national chain + spend qualifies
- Conservative profile-based PDF: `plausible_unverified` + `countryEligibility` is `likely_us` or `unknown` + spend qualifies
- No PDF: `clear_non_fit` (including `non_us_ineligible`), `national_chain`, `invalid_website`, `below_threshold`

**Only a confirmed true-invalid signal becomes `invalid_website`.** All other blocked, timed out, or inaccessible cases become `plausible_unverified` unless strong non-restaurant or chain signals override.

---

## Where Validation Runs

1. **Live** — on blur of the website field in the form (`POST /api/validate-website`)
2. **On submit** — server-side re-check before saving submission
3. **Pre-PDF gate** — final check inside `submitAnalysis.ts` before calling PDFMonkey

---

## Validation Flow

Steps run in this order. Each step feeds into the next.

1. **Normalize URL** — trim raw input, fix missing `https://`, remove trailing slash, lowercase domain, detect known third-party platform domains. Only truly unrecoverable input (spaces that survive normalization, no recognizable domain structure) becomes `invalid_website` here.
2. **Trim and clean raw input** — do not judge input invalid before normalization. Spaces, capitalization, and minor formatting issues must be fixed first.
3. **Basic fetch** — browser-like headers, follow redirects, capture final URL, 10s timeout.
4. **Classify reachability** — map HTTP status + error type to reachability status (see Reachability Matrix). Only 404 and DNS NXDOMAIN are `invalid`. Everything else is `blocked`, `inaccessible`, `thin`, or `redirected`.
5. **Headless browser fallback** — if fetch is blocked, thin, JS-heavy, bot-protected, or content appears to load client-side, attempt headless rendering to extract full page content. Do not run headless on every request — only when normal fetch is insufficient.
6. **Extract website signals** — parse fetched or rendered HTML for restaurant/negative signals, logo hints, schema.org, navigation links, address/location hints.
7. **Google Places Text Search** — query using restaurant name, `zip_code`, website/domain, and concept type. Bias or restrict to U.S. results. ZIP is the primary location anchor.
8. **Google Places Place Details** — retrieve place types, business status, website, address, country. Non-U.S. address → set `countryEligibility: "non_us"`, `finalDecision: "clear_non_fit"`, `internalFlag: "non_us_ineligible"`.
9. **Country eligibility check** — determine `countryEligibility` from ZIP format + Places address country. Valid U.S. ZIP + Places confirms U.S. → `us_verified`. Valid U.S. ZIP, no Places match → `likely_us`. ZIP or Places indicates non-U.S. → `non_us` → route to `clear_non_fit` + `non_us_ineligible`. Undetermined → `unknown`.
10. **National chain detection** — check submitted name, normalized domain, page title, og:site_name, page text, and known chain domains.
11. **Rule-based scoring** — compute `restaurantSignalScore`, `negativeSignalScore`, `nationalChainScore`, `websiteRelationshipScore`, `googlePlacesScore`, `locationConfidenceScore`. Apply threshold rules to produce a preliminary decision.
12. **Claude AI tiebreaker** — only when the preliminary decision is ambiguous. Do not use as first or only classifier.
13. **Return final decision** — `verified_restaurant` | `plausible_unverified` | `clear_non_fit` | `national_chain` | `invalid_website` | `below_threshold`

---

## A. Data Sources to Inspect

In priority order:

1. **URL/domain** — structure, TLD, recognizable brand keywords, third-party platform detection
2. **HTTP status code** — see Reachability Matrix below
3. **Redirect chain** — final destination URL, number of hops, destination type
4. **Page title** (`<title>`) — highest-signal single field
5. **Meta description** — often contains concept/cuisine/location language
6. **OpenGraph tags** — `og:type`, `og:title`, `og:description`, `og:site_name`
7. **Schema.org structured data** — `Restaurant`, `FoodEstablishment`, `LocalBusiness`, `Organization`, `SoftwareApplication`, etc.
8. **Visible page text** (stripped HTML, up to 5000 chars) — keyword signals
9. **Navigation/link text** — menu, reservations, order, locations, catering, careers
10. **Logo hint URLs** — `og:image`, schema.org logo, header img, apple-touch-icon
11. **Business name vs. domain similarity** — fuzzy match, not a blocker
12. **Social links present** — Instagram, Facebook, Yelp, OpenTable, Resy, Google Maps links suggest hospitality
13. **Google Places Text Search** — restaurant name + `zip_code` + domain + concept type + extracted page hints; U.S.-biased
14. **Google Places Place Details** — place types, business status, website, address, country; country field drives `countryEligibility`
15. **Headless-rendered HTML** — fallback only; used when normal fetch is blocked, thin, or JS-heavy

---

## B. Restaurant-Positive Signals

**Strong (high weight):**
- Schema.org type: `Restaurant`, `FoodEstablishment`, `CafeOrCoffeeShop`, `FastFoodRestaurant`, `BarOrPub`, `Bakery`
- Page text or title contains: menu, reservations, order online, dine-in, pickup, delivery, catering, brunch, happy hour, private dining, tasting menu
- Navigation links to `/menu`, `/reservations`, `/order`, `/locations`, `/catering`
- OpenTable, Resy, Yelp, DoorDash, Uber Eats, Grubhub links or embeds
- Toast, Square, Clover ordering iframes
- Hours of operation block

**Moderate (medium weight):**
- Domain or page contains: grill, kitchen, cafe, bistro, bar, tavern, eatery, brasserie, cantina, trattoria, chophouse, smokehouse, steakhouse, pizzeria, sushi, ramen, taqueria
- Cuisine keywords: pizza, burger, taco, sushi, BBQ, pasta, seafood, wings, sandwich, brunch, cocktails
- Chef, sommelier, mixologist references
- "Book a table", "make a reservation", "join us", "visit us"
- Phone number prominently displayed
- Address or Google Maps embed

**Weak (low weight, tie-breaker only):**
- Food-related images in og:image
- Instagram/Facebook links (hospitality pattern)
- Yelp or TripAdvisor links

---

## C. Non-Restaurant Negative Signals

**Strong (high weight):**
- Schema.org type: `SoftwareApplication`, `WebApplication`, `Organization` (tech/corporate)
- Page text contains: book a demo, free trial, pricing plans, enterprise, API, SaaS, software platform, POS system, procurement software, inventory management software, supply chain, distributor, wholesale, manufacturer, foodservice equipment, commercial kitchen equipment, marketing agency, digital agency, consulting firm
- Navigation: /pricing, /demo, /enterprise, /solutions, /integrations, /docs, /developers
- "Request a demo", "Start free trial", "Schedule a call with sales"

**Moderate:**
- No food/dining language anywhere on page
- Primarily B2B language (clients, partners, ROI, scalability, implementation)
- Product/service focused without any restaurant context
- Copyright footer from a known tech, consulting, or manufacturing company

**Important:** Many food-tech companies (Toast, Olo, Resy, OpenTable, GRUBHQ, etc.) use restaurant language but are clearly vendors. Domain recognition of known vendor platforms is more reliable than keyword signals alone.

---

## D. National Chain Detection

Starting point: NATIONAL_CHAINS list in SOP §10 / `src/lib/qualification/national-chains.ts`.

**Check in this order:**
1. Submitted restaurant name (normalized, fuzzy match) — primary check
2. Normalized domain — e.g. `mcdonalds.com`, `chipotle.com`
3. Page title — often contains chain name
4. og:site_name
5. Visible page text — franchise/corporate language: "over X locations nationwide", "find a location near you", "corporate office", "investor relations"
6. Known chain domains list (maintain separately)

**Do not match partial brand words that could be coincidental** — e.g. "Subway Sandwiches" (local shop) vs. "Subway" (chain). Require full match or near-full match.

Franchisees using the national brand domain (e.g. a Subway franchise linking to `subway.com`) → `national_chain`. Franchisees using a local brand + locally-owned concept → evaluate on signals, not chain detection.

---

## E. Website/Name Relationship Logic

**Mismatch is not a blocker.** It lowers confidence and may trigger an internal flag.

| Pattern | Treatment |
|---|---|
| `"Casa Roberto"` + `casaroberto.com` | Strong positive match |
| `"Casa Roberto"` + `robertohospitalitygroup.com` | Plausible — restaurant group domain, not a block |
| `"Casa Roberto"` + `order.toasttab.com/casaroberto` | Plausible — third-party ordering page, not a block |
| `"Casa Roberto"` + `instagram.com/casaroberto` | Plausible — social presence, not a block |
| `"Casa Roberto"` + `sysco.com` | Clear non-fit — known supplier domain |
| `"Casa Roberto"` + `toasttab.com` (main corporate) | Plausible unverified / internal flag — vendor site, not restaurant page |
| `"Casa Roberto"` + `randommarketingagency.com` | Clear non-fit — if strong non-restaurant signals present |
| `"Casa Roberto"` + `casaroberto.xyz` (parked/thin) | Plausible unverified — flag internally |

**Known third-party platform domains** — if URL contains these, treat as plausible and extract the path/slug for the restaurant name check:
- `order.toasttab.com`, `toasttab.com/online-ordering`
- `order.online`, `olo.com`
- `instagram.com`, `facebook.com`, `linktr.ee`
- `resy.com`, `opentable.com`
- `grubhub.com/restaurant/`, `doordash.com/store/`
- `squareup.com/store/`

When URL is a known third-party platform page, extract signals from the path/page content. The platform itself does not make it non-restaurant.

---

## F. Edge Cases

| Scenario | Expected treatment |
|---|---|
| Third-party ordering page only | `plausible_unverified` — extract slug, check for restaurant name match |
| Instagram/Facebook page only | `plausible_unverified` — social presence is plausible; flag for review |
| Restaurant group parent domain | `plausible_unverified` or `verified_restaurant` if foodservice signals present |
| Hotel restaurant | `verified_restaurant` if restaurant schema/signals present; `plausible_unverified` if hotel-dominant |
| Ghost kitchen | `plausible_unverified` — often thin website, order-only platform; allow with flag |
| Food truck | `verified_restaurant` if signals present; `plausible_unverified` if thin |
| Catering business | `verified_restaurant` — foodservice operator, qualifies |
| Bar/nightclub with food | `verified_restaurant` if food signals present |
| Bakery/cafe | `verified_restaurant` |
| Locally-owned franchise (own domain) | Evaluate signals; if not a known chain domain → proceed normally |
| Franchisee using brand domain | `national_chain` — domain match overrides |
| Local restaurant with generic domain | `plausible_unverified` if few signals; `verified_restaurant` if page has strong signals |
| New restaurant, thin website (1-2 pages, real content) | `plausible_unverified` — allow with flag |
| Cloudflare / WAF blocked | `plausible_unverified` — never auto-DQ |
| Parked domain (ads, placeholder, GoDaddy page) | `plausible_unverified` — detect via parked domain signals (ad grids, "this domain is for sale") |
| Expired domain (NXDOMAIN or registrar parked) | `invalid_website` if DNS failure; `plausible_unverified` if returns 200 with thin content |
| Typo in URL (DNS failure) | `invalid_website` — NXDOMAIN; show "check your URL" message |
| Redirect to social media | `plausible_unverified` — follow redirect, classify final destination |
| Redirect to ordering platform | `plausible_unverified` — follow redirect, extract restaurant slug |
| http→https redirect | Normal — follow transparently |
| Redirect to parent restaurant group | `plausible_unverified` — check parent site signals |
| Redirect to national chain corporate page | `national_chain` if chain detected on final destination |
| Coming soon / under construction page | `plausible_unverified` — detect "coming soon", "under construction", "launching soon" |
| Link-in-bio page (Linktree, etc.) | `plausible_unverified` — check links on page for restaurant signals |
| Age gate (alcohol/casino) | `plausible_unverified` — age gates appear on real bars/restaurants |
| Cookie consent wall blocking content | `plausible_unverified` — real site, just inaccessible |
| JS-rendered SPA (near-empty initial HTML) | Attempt headless browser fallback; if content extracted → classify normally; if still thin → `plausible_unverified` |
| Geo-blocked site | `plausible_unverified` — real site, regional access restriction |
| Mobile-only site | `plausible_unverified` — real site |
| Multilingual site | Treat normally — detect signals in any language where possible |
| Supplier using restaurant-like words | `clear_non_fit` if strong B2B/vendor signals dominate |
| Restaurant tech company with menu/order language | `clear_non_fit` if Schema.org type is SoftwareApplication or B2B signals dominate |
| National chain lookalike (e.g. "McDonaldz") | Do not flag — name match must be exact/near-exact |
| Redirect loop | `plausible_unverified` — treat as inaccessible |

---

## Website Reachability vs. Tool Accessibility

The validator must distinguish between **websites that do not exist** and **websites our tool cannot access**.

### Reachability Matrix

| Scenario | Status / Signal | True Invalid? | Decision | PDF | Allow Continue? | User Message | Internal Flags |
|---|---|---|---|---|---|---|---|
| **404 Not Found** | HTTP 404 | Yes | `invalid_website` | None | No | "We couldn't find that website. Please double-check the URL." | `http_404` |
| **DNS failure / NXDOMAIN** | DNS error, no IP | Yes | `invalid_website` | None | No | "That domain doesn't appear to exist. Please check the URL for typos." | `dns_nxdomain` |
| **Malformed URL** | Unrecoverable after normalization (no domain structure, cannot resolve) | Yes | `invalid_website` | None | No | "That doesn't look like a valid web address." | `malformed_url` |
| **Domain expired / registrar parked** | 200 + parked page signals | No | `plausible_unverified` | Conservative | Yes | none shown / proceed | `possible_parked_domain` |
| **Parked domain (ads/for sale)** | 200 + "for sale", ad grid | No | `plausible_unverified` | Conservative | Yes | none shown / proceed | `possible_parked_domain` |
| **SSL/TLS certificate error** | TLS handshake error | No | `plausible_unverified` | Conservative | Yes | none shown | `ssl_error` |
| **Connection timeout** | Fetch timeout (>10s) | No | `plausible_unverified` | Conservative | Yes | none shown | `connection_timeout` |
| **Request timeout** | AbortSignal triggered | No | `plausible_unverified` | Conservative | Yes | none shown | `request_timeout` |
| **403 Forbidden** | HTTP 403 | No | `plausible_unverified` | Conservative | Yes | none shown | `http_403` |
| **401 Unauthorized** | HTTP 401 | No | `plausible_unverified` | Conservative | Yes | none shown | `http_401` |
| **429 Rate Limited** | HTTP 429 | No | `plausible_unverified` | Conservative | Yes | none shown | `http_429` |
| **500 Server Error** | HTTP 500 | No | `plausible_unverified` | Conservative | Yes | none shown | `http_500` |
| **502 Bad Gateway** | HTTP 502 | No | `plausible_unverified` | Conservative | Yes | none shown | `http_502` |
| **503 Service Unavailable** | HTTP 503 | No | `plausible_unverified` | Conservative | Yes | none shown | `http_503` |
| **520/521/522 Cloudflare errors** | HTTP 52x | No | `plausible_unverified` | Conservative | Yes | none shown | `cloudflare_error` |
| **Bot protection / CAPTCHA page** | 200 + CAPTCHA signals | No | `plausible_unverified` | Conservative | Yes | none shown | `bot_protection` |
| **WAF / security block** | 403 or 200 + block signals | No | `plausible_unverified` | Conservative | Yes | none shown | `waf_block` |
| **JS-rendered SPA (thin HTML)** | 200 + <200 chars body text | No | Headless fallback attempted; if still thin → `plausible_unverified` | Conservative | Yes | none shown | `js_rendered_spa`, `headless_attempted` |
| **Geo-blocked** | 403 or redirect by region | No | `plausible_unverified` | Conservative | Yes | none shown | `geo_blocked` |
| **Mobile-only redirect** | Redirect to m. or app store | No | `plausible_unverified` | Conservative | Yes | none shown | `mobile_only` |
| **Cookie/age gate blocking content** | 200 + gate signals | No | `plausible_unverified` | Conservative | Yes | none shown | `gated_content` |
| **Coming soon / under construction** | 200 + construction signals | No | `plausible_unverified` | Conservative | Yes | none shown | `coming_soon` |
| **Redirect loop** | Max redirects exceeded | No | `plausible_unverified` | Conservative | Yes | none shown | `redirect_loop` |
| **Redirect → social media** | Final URL = instagram/fb | No | `plausible_unverified` | Conservative | Yes | none shown | `redirects_to_social` |
| **Redirect → ordering platform** | Final URL = toasttab etc. | No | `plausible_unverified` | Conservative | Yes | none shown | `redirects_to_ordering_platform` |
| **Redirect → http→https** | Final URL = https | Transparent | (continue classification) | — | — | none | — |
| **Redirect → restaurant group** | Final URL = group domain | No | evaluate signals on final page | — | — | none | `redirected_to_group_domain` |
| **Redirect → national chain corporate** | Final URL = known chain | No | `national_chain` | None | No | national chain message | `chain_detected_via_redirect` |
| **200 but parked/ad page** | 200 + thin/ad signals | No | `plausible_unverified` | Conservative | Yes | none shown | `possible_parked_domain` |
| **200 but link-in-bio page** | 200 + Linktree/bio signals | No | `plausible_unverified` | Conservative | Yes | none shown | `link_in_bio` |
| **200 but almost no text (<200 chars)** | 200 + very thin content | No | `plausible_unverified` | Conservative | Yes | none shown | `thin_content` |

**Conservative PDF** = profile-based estimates only, no website-specific claims, no restaurant name used in website context.

---

## G. Scoring Model

```ts
interface ValidationResult {
  // Scores (0–100)
  restaurantSignalScore: number       // Positive restaurant signals from page content
  negativeSignalScore: number         // Non-restaurant / vendor signals
  nationalChainScore: number          // Chain match confidence
  websiteRelationshipScore: number    // Name-to-domain/page relevance
  googlePlacesScore: number           // 0 = no match, 50 = partial, 100 = confirmed restaurant
  locationConfidenceScore: number     // 0–100; combines ZIP validity + Places country confirmation

  // Country eligibility
  countryEligibility: "us_verified" | "likely_us" | "non_us" | "unknown"
  locationReasons: string[]           // e.g. ["us_zip_valid", "google_place_us_confirmed"]

  // Process metadata
  headlessBrowserUsed: boolean
  googlePlacesQueried: boolean
  claudeAiUsed: boolean

  // Reachability
  websiteReachabilityStatus:
    | "reachable"
    | "blocked"
    | "inaccessible"
    | "invalid"
    | "thin"
    | "redirected"

  // Output
  finalDecision:
    | "verified_restaurant"
    | "plausible_unverified"
    | "clear_non_fit"
    | "national_chain"
    | "invalid_website"

  normalizedUrl: string
  finalUrl: string                    // After following redirects
  httpStatus: number                  // 0 = timeout/error
  reasons: string[]                   // Machine-readable reason codes
  userFacingMessage: string | null    // null = show nothing (allow silently)
  internalFlags: string[]             // e.g. ["http_403", "thin_content", "bot_protection"]
  manualReviewRequired: boolean
}
```

### Score Thresholds (proposed defaults, tunable)

| Condition | Decision |
|---|---|
| `nationalChainScore >= 85` | `national_chain` (overrides all) |
| `websiteReachabilityStatus === "invalid"` | `invalid_website` |
| `nationalChainScore >= 85` | `national_chain` (overrides all) |
| `websiteReachabilityStatus === "invalid"` | `invalid_website` |
| `countryEligibility === "non_us"` | `clear_non_fit` + `internalFlag: non_us_ineligible` — no PDF, polite ineligible message |
| `negativeSignalScore >= 70` AND `restaurantSignalScore < 30` AND `googlePlacesScore < 30` | `clear_non_fit` |
| `restaurantSignalScore >= 60` AND `negativeSignalScore < 40` AND `nationalChainScore < 50` | `verified_restaurant` |
| `googlePlacesScore >= 80` AND `nationalChainScore < 50` AND `negativeSignalScore < 60` | `verified_restaurant` (Places confirms) |
| Ambiguous → Claude tiebreaker invoked | `verified_restaurant` or `plausible_unverified` per Claude output |
| Everything else | `plausible_unverified` |

---

## H. Decision Rules

| Decision | Trigger conditions |
|---|---|
| `national_chain` | Chain score ≥ 85 from name, domain, title, or page text. Overrides all other decisions. |
| `invalid_website` | Confirmed HTTP 404, DNS NXDOMAIN, or malformed URL. Nothing else. |
| `clear_non_fit` | Strong vendor/SaaS/non-restaurant signals dominate. Low restaurant score. Not a chain. |
| `verified_restaurant` | Strong restaurant signals, no chain match, not vendor, `countryEligibility` is `us_verified` or `likely_us`. |
| `plausible_unverified` | Blocked, thin, unclear, mixed signals, inaccessible, third-party page, or `countryEligibility === "unknown"` with plausible restaurant signals. |
| `clear_non_fit` (non_us) | `countryEligibility === "non_us"` — set `internalFlag: non_us_ineligible`; send polite ineligible message; no PDF. |
| `below_threshold` | Applied after qualification scoring, not by validator. |

**Do not surface `clear_non_fit` bluntly to users.** Never say "you are not a restaurant." Use soft language (see UX states below).

---

## I. Implementation File Layout

```
src/
  app/
    api/
      validate-website/
        route.ts                          # POST /api/validate-website
  actions/
    validateWebsite.ts                    # Server action (form submit + pre-PDF gate)
    submitAnalysis.ts                     # Calls validateWebsite as pre-PDF gate
  components/
    analyzer/
      WebsiteValidationStatus.tsx         # Inline badge / state indicator
  lib/
    website/
      normalize-url.ts                    # URL parsing, normalization, platform detection
      check-website.ts                    # Fetch with browser UA, redirect tracking, status classification
      extract-signals.ts                  # Parse HTML → restaurant/negative signals, logo hints
      reachability.ts                     # Classify HTTP status + error type → reachability status
      headless-fetch.ts                   # Headless browser fallback (Playwright); triggered only when normal fetch is insufficient
    relevance/
      classify-restaurant.ts              # Rule-based scoring → restaurantSignalScore, negativeSignalScore
      website-relationship.ts             # Name-to-domain/page fuzzy matching
      google-places.ts                    # Google Places Text Search + Place Details; returns googlePlacesScore + country
      location-eligibility.ts             # ZIP validation, countryEligibility logic, locationConfidenceScore
      claude-classifier.ts                # Claude AI tiebreaker; invoked only for ambiguous cases
    qualification/
      national-chains.ts                  # NATIONAL_CHAINS list + chain detection logic
    __tests__/
      website-validation.test.ts          # Full integration test cases (see Section L)
      national-chains.test.ts
      normalize-url.test.ts
      reachability.test.ts
      google-places.test.ts
      location-eligibility.test.ts
      headless-fetch.test.ts
```

---

## J. Backend API Contract

### Request

```
POST /api/validate-website
Content-Type: application/json
```

```ts
{
  website: string              // Raw user input (will be normalized server-side)
  restaurantName: string       // For name/domain relationship + Places search
  usBusinessConfirmed: boolean // Required — user has confirmed U.S.-based business
  conceptType?: string         // Optional — additional hint for Google Places Text Search
}
```

### Response

```ts
{
  success: boolean
  result: {
    normalizedUrl: string
    finalUrl: string
    httpStatus: number
    websiteReachabilityStatus: "reachable" | "blocked" | "inaccessible" | "invalid" | "thin" | "redirected"
    restaurantSignalScore: number         // 0–100
    negativeSignalScore: number           // 0–100
    nationalChainScore: number            // 0–100
    websiteRelationshipScore: number      // 0–100
    googlePlacesScore: number             // 0–100
    locationConfidenceScore: number       // 0–100
    countryEligibility: "us_verified" | "likely_us" | "non_us" | "unknown"
    locationReasons: string[]             // e.g. ["us_zip_valid", "google_place_us_confirmed"]
    headlessBrowserUsed: boolean
    googlePlacesQueried: boolean
    claudeAiUsed: boolean
    finalDecision: Decision
    reasons: string[]
    userFacingMessage: string | null
    internalFlags: string[]               // e.g. ["us_zip_valid", "non_us_postal_code", "google_place_non_us"]
    manualReviewRequired: boolean
  }
  error?: string
}
```

---

## K. Frontend UX States

| State | When | User-facing message | Submit enabled? |
|---|---|---|---|
| `idle` | Field empty or untouched | — | — |
| `checking` | Fetch in progress | "Checking your website…" | No (spinner) |
| `verified` | `verified_restaurant` | "✓ Restaurant website confirmed" | Yes |
| `unable_to_verify_but_can_continue` | `plausible_unverified` | "We weren't able to fully verify this website, but you can still continue. Our team may follow up." | Yes |
| `likely_not_fit` | `clear_non_fit` | "This website doesn't appear to match a restaurant or foodservice operation. If this is incorrect, you can still submit and our team will review it." | Yes (manual review) |
| `national_chain` | `national_chain` | "Our program is designed for independent operators and doesn't cover national chains. If you operate an independent concept, please use that website instead." | No |
| `invalid_website` | `invalid_website` | "We couldn't reach that website. Please check the URL and try again." | No |
| `error` | Network/server error | "Something went wrong on our end. You can continue and we'll verify manually." | Yes |

**UX rule:** Never use aggressive language. `likely_not_fit` and `national_chain` are the only states with directional language. All others are neutral or permissive.

### ZIP / Postal Code Field Validation

Validated client-side on blur and before form submission. Not sent to the validation API until it passes basic format check.

**v1 accepts U.S. ZIP codes only.** Canadian and international postal codes are not supported in v1.

| Input | Valid in v1? | Message |
|---|---|---|
| `78704` | Yes | — |
| `78704-1234` | Yes | — |
| `H2X 1Y4` | No — non-U.S. | "Our program is currently available for U.S.-based restaurants. Please enter a U.S. ZIP code." |
| `abc` | No — malformed | "Please enter a valid U.S. ZIP code (e.g. 78704)." |
| empty | No | "ZIP code is required." |

**Rules:**
- Accept U.S. 5-digit ZIP (`\d{5}`) and ZIP+4 (`\d{5}-\d{4}`) only in v1
- Non-U.S. postal code format → friendly message; flag `non_us_postal_code`; `countryEligibility: "non_us"` → `clear_non_fit` + `non_us_ineligible`; no PDF
- Invalid format → friendly message; blocks submission
- Missing ZIP → required field error; blocks submission
- ZIP validation is a form-level gate — it never DQs the lead based on location alone; country eligibility is a separate downstream check
- Do not expose ZIP validation failures in the website validation badge

---

## L. Required Tests (before implementation)

### ZIP / Postal Code and Country Eligibility
- `78704` → valid U.S. ZIP, `countryEligibility: "likely_us"` minimum
- `78704-1234` → valid ZIP+4, `countryEligibility: "likely_us"` minimum
- `H2X 1Y4` → non-U.S. format, friendly message, `non_us_postal_code` flag, `countryEligibility: "non_us"`; form submit blocked in v1
- `abc` → malformed, friendly message, blocks submission
- empty → required field error, blocks submission
- Google Places returns U.S. address → `countryEligibility: "us_verified"`, `google_place_us_confirmed` flag
- Google Places returns non-U.S. address → `countryEligibility: "non_us"`, `google_place_non_us` flag, `finalDecision: "clear_non_fit"` + `internalFlag: non_us_ineligible`; no PDF
- Google Places unavailable → degrade gracefully; `countryEligibility` stays `"likely_us"` if ZIP is valid U.S. format
- `countryEligibility: "non_us"` → `clear_non_fit` + `non_us_ineligible`; no PDF (full or conservative)
- `countryEligibility: "unknown"` → `plausible_unverified` if restaurant signals present; conservative PDF allowed

### URL Normalization
- Raw input trimmed before any judgment
- Missing `https://` → adds it
- Trailing slash removed
- Uppercase domain → lowercased
- Known platform domain detected (toasttab, instagram, etc.)
- Spaces or minor formatting issues → fix first, then re-attempt
- Truly unrecoverable input (no domain structure after normalization) → `invalid_website`

### Reachability Classification
- HTTP 200 → `reachable`
- HTTP 404 → `invalid`
- HTTP 403/503 → `blocked`
- HTTP 500/502 → `blocked`
- DNS failure → `invalid`
- Timeout → `inaccessible`
- Redirect chain followed → final URL captured
- Redirect to social media → `redirected` + `redirects_to_social` flag
- Redirect to ordering platform → `redirected` + flag
- JS-rendered SPA (thin body) → headless fallback attempted; `thin` + `js_rendered_spa` if still insufficient
- Coming soon page → `thin` + `coming_soon` flag
- Headless fallback triggered → `headlessBrowserUsed: true` in response

### Restaurant Signal Scoring
- Strong schema.org Restaurant → high score
- Menu/hours/reservations keywords → high score
- SaaS/pricing/demo keywords → high negative score
- Mixed signals → moderate scores both directions
- No text at all → low scores, `plausible_unverified`

### National Chain Detection
- Exact chain name match → `national_chain`
- Partial match that is not a chain → no flag
- Known chain domain → `national_chain`
- Redirect to known chain domain → `national_chain`
- Franchisee with own domain → no chain flag

### Name/Domain Relationship
- Name matches domain → high relationship score
- Name matches restaurant group domain → moderate score, no block
- Name matches known vendor domain (sysco.com) → `clear_non_fit`
- Name matches third-party ordering platform path → `plausible_unverified`
- Name matches social media page path → `plausible_unverified`

### Decision Rules
- `verified_restaurant` conditions met → correct decision
- `plausible_unverified` fallback for all ambiguous cases
- `clear_non_fit` only with high negative score + low restaurant score
- `national_chain` overrides all other decisions
- `invalid_website` only for 404, DNS NXDOMAIN, malformed URL

### Google Places
- Restaurant name + U.S. ZIP + domain match found in Places with U.S. address → high `googlePlacesScore`, `countryEligibility: "us_verified"`, likely `verified_restaurant`
- Places returns match with non-U.S. address → `google_place_non_us` flag, `countryEligibility: "non_us"`, `finalDecision: "clear_non_fit"` + `internalFlag: non_us_ineligible`; no PDF
- Places returns no match → `googlePlacesScore: 0`; `countryEligibility` falls back to ZIP-based assessment
- Places returns restaurant type → contributes to positive score
- Places returns no match → `googlePlacesScore: 0`, fall through to rule-based result
- Places API error → `googlePlacesQueried: false`, do not fail validation; degrade gracefully

### Headless Browser
- Triggered for: blocked fetch, thin content, JS-heavy, bot-protected, ambiguous
- Not triggered for: clean 200 with sufficient content
- Headless extracts same signals as normal fetch
- If headless also fails → `headlessBrowserUsed: true`, `thin_content` flag, `plausible_unverified`

### Edge Case Tests
- Cloudflare-protected site (e.g. `spiritscenla.com`) → headless fallback; `plausible_unverified` or `verified_restaurant`
- Parked domain → `plausible_unverified`
- `order.toasttab.com/casaroberto` → `plausible_unverified`
- `instagram.com/casaroberto` → `plausible_unverified`
- `sysco.com` → `clear_non_fit`
- Ghost kitchen ordering page → `plausible_unverified`
- Hotel restaurant → `verified_restaurant` or `plausible_unverified`
- Food truck with thin site → headless fallback; `plausible_unverified` if still thin

---

## Additional Validation Methods — Final Decisions

---

### P1 — Claude AI Classification Pass — APPROVED for v1 (tiebreaker only)
**What:** Pass extracted page signals to `claude-sonnet-4-6` for restaurant classification.  
**Constraint:** Only invoked for ambiguous cases after rule-based scoring, headless fetch, and Google Places checks complete. Not the first or only classifier.  
**Cost/complexity:** ~$0.001–0.003 per ambiguous call. Adds ~1–2s when triggered. Must degrade gracefully if Claude is unavailable.  
**Implementation:** `src/lib/relevance/claude-classifier.ts`

---

### P2 — Google Places API — APPROVED for v1 (Text Search + Place Details only)
**What:** Google Places Text Search and Place Details to confirm restaurant existence and category.  
**Important:** Use **Google Places API**, not Google Business Profile / Google My Business. GBP is for managing listings we own. Places API is for querying public place data — the correct choice here.  
**Location handling:** `zip_code` is a required U.S.-only form field and the primary location signal. Use it alongside restaurant name, domain, and concept type in Text Search. Bias or restrict results to U.S. Verify the Place Details address country field — if not `"US"`, set `countryEligibility: "non_us"`, `finalDecision: "clear_non_fit"`, `internalFlag: non_us_ineligible`; no PDF. If Places returns no match, fall through to rule-based scoring; do not hard-fail.  
**Future enhancement:** If ZIP alone proves insufficient for match quality, consider adding city/state. Do not add those fields without explicit approval.  
**Cost/complexity:** ~$0.017 per Text Search call + ~$0.017 per Place Details call. API key required. Must degrade gracefully on error — do not fail validation if Places is unavailable.  
**Implementation:** `src/lib/relevance/google-places.ts`

---

### P3 — Yelp Fusion API — NOT approved for v1
Google Places is the primary external validation source. Yelp not included.

---

### P4 — Headless Browser Rendering — APPROVED for v1 (fallback only)
**What:** Playwright-based headless rendering for pages where normal fetch is insufficient.  
**Triggers:** Blocked fetch, thin content (<200 chars), JS-heavy SPA, bot protection shell, WAF block, ambiguous content that likely loads client-side.  
**Constraint:** Do not run for every request — only as a fallback when normal fetch fails to produce usable signals.  
**Cost/complexity:** Adds 3–8s latency when triggered. Requires a browser execution environment — not compatible with standard serverless edge functions. Plan for a dedicated worker or container. Significant infrastructure consideration for production.  
**Implementation:** `src/lib/website/headless-fetch.ts`

---

### P5 — Domain Age / WHOIS Lookup — NOT approved for v1
Weak signal with meaningful false-negative risk for new restaurants. Excluded.
