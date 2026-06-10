# FSIQ Food Cost Analyzer — Current Status

**Last updated:** 2026-06-10  
**HEAD commit:** `5989067` (fix: mobile PDF — server-side UA redirect instead of CTA page)  
**Production URL:** `https://app.foodserviceiq.com` (canonical) — underlying Vercel deployment: `https://fsiq-food-cost-analyzer-app.vercel.app`

---

## Savings Formula ✅

| Item | Value | Source |
|------|-------|--------|
| Minimum qualifying spend | $600K | `qualify-lead.ts:138` |
| Sub-minimum threshold | $50K | `qualify-lead.ts:137` |
| Global finalPct floor | 4.0% | `savings-formula.ts` |
| Global finalPct ceiling | 6.95% | `savings-formula.ts` |
| Bucket-level max applied before global clamp | Yes | `savings-formula.ts` |
| 5-year inflation rate | 3.9% USDA | `savings-formula.ts` |
| Spend cap | $99M (inputs above capped + DQ'd) | `spend-parser.ts` |
| Garbage input handling | parseFallback=true → DQ as below_threshold | `qualify-lead.ts:164` |

**Spend buckets:**

| Bucket | Midpoint | Base % | Max % |
|--------|----------|--------|-------|
| $600K–$800K | $700K | 2.00% | 4.00% |
| $800K–$1M | $900K | 3.60% | 5.60% |
| $1M–$3M | $2M | 4.95% | 6.95% |
| $3M–$7M | $5M | 3.15% | 5.15% |
| $7M+ | $8.5M | 3.66% | 5.66% |

See `docs/savings-formula.md` for full formula spec including modifiers.

---

## Website Validation ✅

**Google Places: removed.** U.S. eligibility is confirmed by the `us_business_confirmed` checkbox (user attestation). `googlePlacesQueried` is always `false`; `googlePlacesScore` is always 0. The `google-places.ts` file exists but is not called.

**Headless browser:** Enabled in production via Browserless.io when `BROWSERLESS_API_KEY` is set. Playwright-based local headless (`HEADLESS_ENABLED=true`) works only in environments with Chromium.

**Country eligibility:** `computeCountryEligibility()` returns `us_verified` + `locationConfidenceScore: 99` for all submissions (hardcoded since user attestation is the gate). The state/ZIP-based logic is dead code.

**Five decision outcomes:**

| Decision | Meaning |
|----------|---------|
| `verified_restaurant` | High-confidence independent U.S. restaurant |
| `plausible_unverified` | Unclear, blocked, thin, or unconfirmed — conservative PDF eligible |
| `clear_non_fit` | Not a restaurant, or non-U.S. (`internalFlag: non_us_ineligible`) |
| `national_chain` | Matched national chain list |
| `invalid_website` | Confirmed 404 / malformed URL — **NXDOMAIN misclassifies as `inaccessible` → `plausible_unverified` in Vercel's serverless environment (open bug)** |

**Known open validation gaps** (see `docs/test-results-report.md` for full detail):

| Gap | Severity | Notes |
|-----|----------|-------|
| NXDOMAIN → `plausible_unverified` instead of `invalid_website` | P0 | Vercel DNS error message doesn't match expected patterns in `classifyFetchError` |
| Known-domain blocklist checked after network fetch | P1 | `hilton.com`, `.gov` domains time out before the blocklist check fires |
| Headless redirect changes `finalUrl`, breaks blocklist | P1 | `wholefoodsmarket.com`, `seriouseats.com` escape blocklist after headless navigates away |
| BBB.org listing URL → `plausible_unverified` | P1 | Not in `KNOWN_NON_RESTAURANT_DOMAINS` |

See `docs/website-validation-spec.md` and `docs/scoring-algorithm.md` for full spec.

---

## Meta Tracking ✅

| Event | Browser | Server CAPI | Dedup |
|-------|---------|-------------|-------|
| `PageView` | Every page load | — | None needed |
| `Lead` | On form submit | All submissions (DQ + qualified) | Shared `event_id` → Meta deduplicates to 1 |
| `QualifiedLead` | On qualified result | After PDF confirmed ready | Shared `ql-{event_id}` → Meta deduplicates to 1 |

**Attribution chain:** URL params → `sessionStorage` (first-touch, never overwritten) → form payload → DB → GHL.

**Fields captured:** utm_source, utm_medium, utm_campaign, utm_content, utm_term, utm_id, fbclid, fbadid, referrer, landing_page_url, fbp, fbc. All stored in DB. All sent to GHL as `fsiq_utm_*` custom fields + native `attributionSource` for the GHL attribution panel.

**Meta Pixel ID:** `1679245649839076` (hardcoded in `layout.tsx`; also read from `NEXT_PUBLIC_META_PIXEL_ID`).

See `docs/meta-tracking.md` for the full design.

---

## AI Narrative System ✅

| Item | Value |
|------|-------|
| Model | `claude-sonnet-4-6` |
| Max tokens per call | 1000 |
| Calls per qualified submission | 2 (Researcher + Narrative) |
| Enforced 1s delay between calls | In orchestrator (`submitAnalysis.ts`), not in the functions |
| Cost per submission (est.) | ~$0.003–$0.005 |

**Active narrative angles:**

| Angle | Trigger |
|-------|---------|
| `captive_buyer` | Broadliner + market_price_single |
| `fragmented_buyer` | market_price_multiple |
| `optimized_buyer` | negotiated_cost_plus |
| `premium_independent` | local_specialty + fine dining |
| `multi_unit_operator` | 2+ locations (modifier) |

Selection is deterministic (`src/lib/ai/angle-selector.ts`). See `docs/ai-narrative.md`.

---

## Tests

| Suite | Count | Notes |
|-------|-------|-------|
| **Total passing** | **1023** | `pnpm test` |
| Pre-existing failures | 3 | `report-page.test.ts` — `headers()` outside request scope; Next.js 15 server component testing limitation; not a runtime bug |
| Skipped | 6 | Intentional (google-places, inactive) |
| Attribution encoding | 18 | New — fixture URL decode, sessionStorage round-trip, JSON transparency |
| Lead/QualifiedLead dedup | 8 | New — event_id scheme, value payload |

---

## Production

| Item | Value |
|------|-------|
| URL | `https://app.foodserviceiq.com` (custom domain) — `https://fsiq-food-cost-analyzer-app.vercel.app` (Vercel alias) |
| Framework | Next.js 15.5.18 |
| Node | 24.x |
| Vercel region | `sfo1` (San Francisco) — pinned in `vercel.json` for DB co-location with Supabase |
| Supabase region | `us-west-1` N. California (verified from Supabase project API) — same metro as `sfo1` |
| Headless | Browserless.io via `BROWSERLESS_API_KEY` — **fully implemented** (`browserless-client.ts`); when key is absent headless is disabled and `plausible_unverified` is the fallback for blocked/thin sites |
| Deploys | Automatic on push to `main` |
| DB | Supabase PostgreSQL (project `ektnxacqarlzbscaaxsz`) |
| PDF cache | Supabase Storage (`pdf-cache` bucket) — permanent fallback for PDFMonkey URL expiry |

---

## Pre-Launch Open Items

The following are **not yet confirmed done**. See `docs/launch-blockers.md` for the full checklist.

1. **DQ email not verified end-to-end** — GHL automation for `send_dq_below_threshold` has not been confirmed to fire in a live test
2. **NXDOMAIN bug** — `invalid_website` not returned for truly non-existent domains in Vercel serverless
3. ~~**GHL attribution custom fields**~~ — ✅ Script run 2026-06-10; all 11 fields created/verified. Two slug corrections applied (`fsiq_fb_ad_id`, `fsiq_fb_click_id`). Bare-key resolution confirmed in production.
4. ~~**DB migrations pending**~~ — ✅ All 6 local migrations applied and tracked in `_prisma_migrations` (applied 2026-06-10 via Supabase SQL + manual registration). `prisma migrate status` will show clean.
5. **3 pre-existing test failures** — `report-page.test.ts` (`headers()` outside request scope); not a runtime bug but makes CI red
6. **Two slug-mismatch fields** — `fsiq_fbadid` → GHL key `fsiq_fb_ad_id`, `fsiq_fbclid` → GHL key `fsiq_fb_click_id`. Code patched in `ghl.ts`; these values start flowing on next deploy.
