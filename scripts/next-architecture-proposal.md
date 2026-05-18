# Next-Generation Website Validation Architecture

Generated: 2026-05-18

## Target

Targeting 99.99% hard true-positive coverage means real restaurants must continue as either `verified_restaurant` or `plausible_unverified`; they must not fall into `invalid_website` or `clear_non_fit` unless there is strong contrary evidence.

The current stack now reaches 100% hard true-positive coverage on the 510-row restaurant benchmark after the guarded stale-404 continuation fix. It verifies 45.88% of restaurant rows and accepts the rest as plausible. The remaining gap is no longer lead continuation on this benchmark; it is verified confidence for unreachable domains, bot-protected/JS-rendered pages, stale URLs, and low-signal pages that need rendered content or external corroboration.

## Is Playwright Worth It?

Yes, but only as a conditional fallback for improving verified confidence. Playwright should not run for every submission, and it is not required to hit 99.99% hard true-positive flow on the current benchmark.

Recommended trigger conditions:
- HTML body below 500 visible characters.
- Known JS shell signatures from Wix, Squarespace, Webflow, React, Vue, or Angular.
- HTTP 403/401/429/5xx with restaurant-like domain/path/title hints.
- Raw fetch finds no body signals but the URL/domain is not a known vendor or corporate root.

Expected benefit:
- Converts some `plausible_unverified` rows into `verified_restaurant` by fixing JS-rendered pages, thin shell pages, some bot-protected pages, and content loaded after hydration.
- Based on post-fix analysis, roughly 80 per 1,000 restaurant submissions would hit the headless bucket.

Cost/effort:
- 3-5 engineering days for a browser worker, concurrency limits, timeout controls, screenshots/HTML capture, and observability.
- Moderate infrastructure cost if used only as fallback. Browser pooling matters more than raw CPU cost.

## Would ML Outperform Rules?

A trained classifier would outperform rules for low-signal natural-language pages, but it will not solve unreachable domains or JS-rendered pages by itself.

Recommended use:
- Keep deterministic rules for high-confidence accepts/rejects.
- Add an ML or LLM classifier only after extraction has produced enough text, metadata, schema, and URL features.
- Use model output as a tie-breaker for `restaurantSignalScore` 35-59 with low negative score.

Do not replace the rule pipeline entirely. Rules are easier to audit for false positives, and this product needs explainable lead gating.

## External API ROI

1. Google Places API

Best ROI for converting unreachable/stale domains from plausible to verified. Query only when:
- Domain is inaccessible after fallback retries.
- URL is 404 but domain/name looks restaurant-like.
- Rule score is below verified but above clear non-fit.

Use returned business type, website, phone, address, operational status, and country. Cache by normalized domain and name/state.

2. Yelp API

Useful secondary fallback for restaurants missing from Places or with stale canonical websites. Lower priority because access/commercial terms and data consistency are less predictable.

3. Search API

Useful for canonical URL recovery, but higher false-positive risk. Only use after strict name/state matching and vendor exclusion checks.

## Ideal Signal Pipeline

1. Normalize URL and classify trusted platforms.
2. Reject known vendors/corporate platform roots early.
3. Fetch with timeout retry, scheme fallback, and www/non-www fallback.
4. Classify DNS failure as invalid; classify timeout/network failure as plausible unless external evidence confirms invalid.
5. Extract full scoring signals from raw HTML:
   - title/meta/OG fields
   - headings/buttons/nav links
   - full or targeted body text
   - JSON-LD including nested `@graph`
   - schema names/descriptions
   - image alt text
   - multilingual restaurant terms
6. Run deterministic rule scoring and bundle scoring.
7. If thin/blocked/JS shell, run Playwright fallback and rescore rendered HTML.
8. If still not verified and not clear non-fit, query Google Places.
9. If Places cannot resolve and the case remains valuable, query Yelp or search for canonical URL.
10. Use LLM/ML tie-breaker only on extracted feature summaries, not raw web pages.
11. Return:
   - `verified_restaurant` for high-confidence independent foodservice.
   - `plausible_unverified` for reachable ambiguity or unresolved network failures.
   - `invalid_website` only for malformed URL, DNS NXDOMAIN, or confirmed stale/nonexistent domain.
   - `clear_non_fit` only for strong vendor/SaaS/non-food evidence.

## What 99.99% Requires

For hard true-positive flow on the current benchmark, 99.99% is already achieved by the current stack:
- Fetch timeout retry and URL fallbacks.
- Broader deterministic extraction/scoring from Agent 1.
- Guarded stale restaurant 404 continuation to `plausible_unverified`.
- Strict vendor and non-restaurant exclusions around the fallback path.

For 99.99% verified confidence on real production traffic, additional architecture is still required:
- Conditional headless browser fallback.
- External business identity lookup with caching.
- Canonical URL recovery for stale or moved domains.
- More explicit non-restaurant exclusions for hotels, SaaS, real estate, legal, medical, and retail controls.
- Continuous benchmark tracking with separate metrics for verified, plausible, hard false negative, and false positive.
- Human review path for irreducibly ambiguous cases.

The rule-only pipeline can preserve lead flow, but it cannot make 99.99% verified claims on real submissions because network failures and stale domains require outside evidence.

## Estimated Effort

- Playwright fallback worker: 3-5 days.
- Google Places fallback: 2-4 days.
- Yelp/search canonical fallback: 2-4 days.
- ML/LLM tie-breaker feature layer: 3-6 days.
- Observability and benchmark dashboards: 2-4 days.
- Ongoing false-positive hardening: continuous, starting with 1-2 days of known-control fixtures.

## Recommended Roadmap

1. Keep hard true-positive monitoring separate from verified-rate monitoring.
2. Add Google Places fallback for inaccessible and stale restaurant-like domains.
3. Add Playwright fallback for thin/JS/bot-protected pages.
4. Add canonical URL recovery for 404s.
5. Add a small feature-based classifier for low-signal but reachable pages.
6. Track verified and plausible as separate product states so conversion can improve without inflating hard verification claims.
