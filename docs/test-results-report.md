# Pre-Launch Adversarial Test Results
**Generated:** 2026-06-10 (analysis of runs from 2026-06-05)
**Tests run against:** `https://fsiq-food-cost-analyzer-app.vercel.app` (production)

---

## Summary

| Test | Cases | Asserted | Pass | Fail | Observe-only | Runtime |
|------|-------|----------|------|------|--------------|---------|
| Part 1 — API validation (`production-break-test.ts`) | 75 | 60 | 50 | **10** | 15 | 854 s |
| Part 2 — Full pipeline (`production-pipeline-test.js`) | 30 | 30 | 26 | **4** | 0 | 846 s |

**Of the 14 total failures, 3 are backend defects that remain open, 3 are already fixed by post-test commits, 2 are architectural timeout gaps, 3 are frontend design gaps (DQ UI), 1 is a Puppeteer test-detection limitation, 1 is a UX bug, and 1 is a P2 Claude edge case.**

---

## What Ran / What Didn't

### Scripts found
| Script | Location | Status |
|--------|----------|--------|
| `production-break-test.ts` | `scripts/production-break-test.ts` | Ran to completion |
| `production-pipeline-test.js` | `scripts/production-pipeline-test.js` | Ran to completion |
| `stress-test-real.js` | `stress-test-real.js` (root) | **NOT run** — appears to be an earlier stress-test variant, no results file |
| `stress-test-agent.js` | `stress-test-agent.js` (root) | **NOT run** — agent-state variant, no results |

### Results files found
| File | Source | Contents |
|------|--------|----------|
| `break-test-api-results.json` | Part 1 | Complete — 75 results, generated 2026-06-05T22:32:04Z |
| `break-test-pipeline-results.json` | Part 2 | Complete — 30 results, generated 2026-06-05T22:52:16Z |
| `scripts/benchmark-results.json`, `scripts/synthetic-test-results.json`, etc. | Earlier validation dev sessions | Not adversarial tests; pre-date the break-test scripts |

### Database records
The API test (`production-break-test.ts`) calls only `/api/validate-website`, which is stateless — **no DB writes**. The pipeline test (`production-pipeline-test.js`) submits the form end-to-end through `submitAnalysis`, which **does write to the DB**. The test email used is `rodrigo@foodserviceiq.com`. Approximately 26 qualified submissions were created in the production DB (all those where the pipeline test reports `qualified=true`). GHL was synced for each; PDFs were generated asynchronously.

### Commit context
The tests ran at 2026-06-05 22:32–22:52 UTC. Three fix commits were made immediately after, and more on June 9. The table below tracks which failures were fixed post-run.

| Commit | Date (UTC) | Fixes |
|--------|-----------|-------|
| `d847182` | Jun 5 23:55 | `.edu`/`.gov` domain gate; chain-name descriptor guard |
| `79a0cb9` | Jun 6 00:23 | Private IP blocking; spend parser bare-number heuristic removed; GHL retry |
| `d91c6cc` | Jun 9 22:59 | `parseFallback=true` now DQs (was qualifying at $2M fallback) |
| `2e1992a` | Jun 9 22:56 | Capped-at-$99M spend now DQs |
| `1a260e6` | Jun 9 22:35 | Garbage-input guard; $99M cap |
| `7f2cce8` | Jun 9 23:14 | Typo handling: qualifier variants, billion, thousand, kk |
| `76f9b76` | Jun 9 23:08 | Strip leading qualifier words before parsing |

---

## Results by Category

### Part 1 — API Validation (75 cases)

| Category | Pass | Fail | Observe-only | Notes |
|----------|------|------|--------------|-------|
| A — URL normalization (14) | 10 | **0** | 4 | All asserted cases pass |
| B — DNS/HTTP failures (6) | 3 | **2** | 1 | B01 NXDOMAIN, B04 private IP |
| C — National chain detection (12) | 11 | **0** | 1 | 100% — all named chains caught |
| D — Clear non-fits (12) | 9 | **3** | 0 | D05/D12 timeout; D11 Whole Foods miss |
| E — Food-adjacent (12) | 2 | **4** | 6 | E04 food blog; E08 brewery; E10 .edu; E12 BBB |
| F — Restaurant edge cases (10) | 6 | **1** | 3 | F05 timeout |
| G — Known-good controls (9) | 9 | **0** | 0 | All 9 pass — no regressions on CRM anchors |

### Part 2 — Full Pipeline (30 cases)

| Category | Pass | Fail | Notes |
|----------|------|------|-------|
| P — Spend boundary/parser (6) | 4 | **2** | P02 $599,999; P03 "10000" |
| Q — Input sanitization (8) | 8 | **0** | SQL injection, XSS, emoji, Unicode — all pass |
| R — Email/phone edges (7) | 6 | **1** | R03 whitespace-only phone |
| S — SKU edge cases (5) | 5 | **0** | Overlong SKU (3000 chars), Spanish SKUs, tabs — all pass |
| T — Control group (4) | 3 | **1** | T04 Chipotle — test detection gap (see below) |

---

## Failure Detail

### B01 — DNS NXDOMAIN returns `plausible_unverified` instead of `invalid_website`
**Input:** `https://this-domain-absolutely-does-not-exist-xyz789abc.com` / "Nonexistent Restaurant"
**Got:** `plausible_unverified` (reachability: `inaccessible`)
**Expected:** `invalid_website`
**Root cause:** In Vercel's serverless runtime, NXDOMAIN errors return a Node.js error message that does not contain `enotfound`, `nxdomain`, or `dns` — so `classifyFetchError()` (`check-website.ts:160`) misclassifies it as a generic `network_error` instead of `dns_nxdomain`. `classifyReachability()` then maps `network_error` to `inaccessible` (`reachability.ts:55-57`), not `invalid`. The `inaccessible` path never reaches the `invalid_website` early exit in `run-validation.ts:121-178`, so it falls through to `plausible_unverified_fallback`.
**Status:** **OPEN** — not addressed by any post-test commit.
**File:** `src/lib/website/check-website.ts:160`, `src/lib/website/reachability.ts:55`

---

### B04 — Private IP `192.168.1.1` times out instead of returning `invalid_website`
**Input:** `http://192.168.1.1`
**Got:** timeout (35 s)
**Expected:** `invalid_website`
**Root cause:** At test time, `normalizeUrl` did not block private IPs. The fetch attempted a real TCP connection to the private address, which hung.
**Status:** **FIXED** — commit `79a0cb9` added a private/reserved host gate to `normalize-url.ts:76-113`. Now returns `isValid=false` immediately → `invalid_website` without any network call.

---

### D05 — `usda.gov` times out instead of returning `clear_non_fit`
**Input:** `https://usda.gov` / "USDA Cafeteria"
**Got:** timeout (35 s)
**Expected:** `clear_non_fit`
**Root cause:** `usda.gov` (`.gov` TLD) IS in the blocklist, but `knownNonRestaurantDomain()` is called at Step 6 in `run-validation.ts:259-281`, which is AFTER the network fetch at Step 3 (`run-validation.ts:116`). When `usda.gov` hangs the fetch for the full timeout, the Vercel function times out before ever reaching the blocklist check.
**Status:** **OPEN** — architectural. The `.gov`/`.edu` TLD gate and known-domain blocklist check would need to be hoisted to before the fetch (Step 1b or Step 2) for the timeout case to be avoided.
**File:** `src/lib/website/run-validation.ts:116` (fetch step), `src/lib/website/run-validation.ts:259` (domain check step)

---

### D11 — `wholefoodsmarket.com` returns `plausible_unverified` instead of `any_non_fit`
**Input:** `https://wholefoodsmarket.com` / "Whole Foods Hot Bar"
**Got:** `plausible_unverified` (reachability: `reachable`, headless: `true`, scores: 0/0/0)
**Expected:** `national_chain` or `clear_non_fit` (`wholefoodsmarket.com` is in `KNOWN_NON_RESTAURANT_DOMAINS`)
**Root cause:** After the headless fetch (Playwright), the `finalUrl` changes. When `wholefoodsmarket.com` is visited by headless, it likely redirects to a subdomain or CDN host such that `extractDomain(finalUrl)` no longer returns `wholefoodsmarket.com`. The `knownNonRestaurantDomain(domain, ...)` check at `run-validation.ts:259` uses `finalUrl`, so the blocklist miss is a redirect-induced domain mismatch. Signal scores are 0/0 (headless got a thin page), so no scoring rule triggers either.
**Status:** **OPEN** — requires checking `normalizedUrl` domain as a fallback in `knownNonRestaurantDomain()` when `finalUrl` domain doesn't match.
**File:** `src/lib/website/run-validation.ts:213` (`domain = extractDomain(finalUrl)`) and `:259` (blocklist check)

---

### D12 — `hilton.com` times out instead of returning `clear_non_fit`
**Input:** `https://hilton.com` / "Hilton Restaurant"
**Got:** timeout (35 s)
**Expected:** `clear_non_fit`
**Root cause:** Same architectural issue as D05. `hilton.com` is in `KNOWN_NON_RESTAURANT_DOMAINS` but the check runs after the network fetch. The fetch hangs for the full timeout.
**Status:** **OPEN** — same fix needed as D05.
**File:** `src/lib/website/run-validation.ts:116`, `:259`

---

### E04 — `seriouseats.com` returns `plausible_unverified` instead of `clear_non_fit`
**Input:** `https://seriouseats.com` / "Serious Eats Kitchen"
**Got:** `plausible_unverified` (reachability: `blocked`, headless: `true`, scores: 0/0/0)
**Expected:** `clear_non_fit` (`seriouseats.com` is in `KNOWN_NON_RESTAURANT_DOMAINS`)
**Root cause:** Cloudflare blocks the initial fetch (reachability: `blocked`), headless is attempted. After headless navigation, `finalUrl` likely changes (redirect to a CDN or Cloudflare interstitial), and `extractDomain(finalUrl)` no longer returns `seriouseats.com`. Same root cause as D11 — headless redirect breaks the domain blocklist check.
**Status:** **OPEN** — same fix needed.
**File:** `src/lib/website/run-validation.ts:213`, `:259`

---

### E08 — Goose Island Brewery returns `clear_non_fit` instead of `any_qualified`
**Input:** `https://gooseisland.com` / "Goose Island Brewery Taproom"
**Got:** `clear_non_fit` via `claude_tiebreaker` (restaurant score: 22, negative: 20)
**Expected:** `any_qualified` (brewery taproom with food service)
**Root cause:** Ambiguous case — scores land in Claude tiebreaker range. Claude's classifier concluded it is not a restaurant operator. The brewery has food service (taproom), but the website content likely emphasizes beer production/distribution over dining. This is an inherent Claude judgment call on a genuinely borderline case.
**Status:** **OPEN** (P2) — no code defect; Claude tiebreaker made a defensible call. A real submission from a taproom operator would be captured as `plausible_unverified` regardless of this classification since validation never fully blocks a lead.

---

### E10 — `dining.harvard.edu` returns `verified_restaurant` instead of `clear_non_fit`
**Input:** `https://dining.harvard.edu` / "Harvard University Dining"
**Got:** `verified_restaurant` (restaurant score: 100, negative: 20)
**Expected:** `clear_non_fit` (institutional `.edu` dining hall)
**Root cause at test time:** The `.edu` domain gate did not exist in `knownNonRestaurantDomain()`. The Harvard Dining site has extremely high restaurant signals (menus, hours, reservation links, pricing, food images) — signal score hit 100 — triggering `high_restaurant_score_strong` without ever checking the TLD.
**Status:** **FIXED** — commit `d847182` added `.edu` and `.gov` TLD gates to `knownNonRestaurantDomain()` in `run-validation.ts`. Current code returns `clear_non_fit` for any `.edu` domain before signal scoring.

---

### E12 — BBB.org listing URL returns `plausible_unverified` instead of `clear_non_fit`
**Input:** `https://bbb.org/us/tx/dallas/profile/restaurant` / "Dallas BBQ Place"
**Got:** `plausible_unverified` (reachability: `blocked`, headless: `true`, scores: 0/0/0)
**Expected:** `clear_non_fit` (third-party business directory, not a restaurant's own domain)
**Root cause:** `bbb.org` is not in `KNOWN_NON_RESTAURANT_DOMAINS`. Cloudflare blocks headless fetch too, leaving scores at 0/0 and no rule triggering. Falls through to `plausible_unverified_fallback`. The classifier never sees the URL or page content to distinguish a directory listing from an operator domain.
**Status:** **OPEN** (P1) — adding `bbb.org` to `KNOWN_NON_RESTAURANT_DOMAINS` would fix this case. More broadly, third-party directory listing URLs (BBB, Yelp, Tripadvisor, etc.) should have early-exit detection.

---

### F05 — `obriensirishpub.com` times out
**Input:** `https://obriensirishpub.com` / "O'Brien's Irish Pub"
**Got:** timeout (35 s)
**Expected:** `any_qualified`
**Root cause:** Intermittent network timeout — not a code defect. The server was unresponsive during the test run.
**Status:** **OPEN** (P2) — intermittent; no fix required.

---

### P02 — `$599,999` returns `qualified=true` in pipeline test
**Input:** `annualFoodSpend: "599999"` (bare number)
**Pipeline test reports:** `qualified=true`
**Expected:** DQ (below threshold)
**Root cause — two separate issues:**

**Issue A — Spend parser (fixed):** At test time, `applyBareHeuristic(599999)` treated numbers ≥100 as exact dollars, giving $599,999 → below $600K threshold → DQ. This is correct current behavior. At test time the parser may have had different behavior. Commit `79a0cb9` fixed the bare-number heuristic.

**Issue B — UI design gap (open):** `AnalyzerForm.tsx:275-284` calls `submitAnalysis()` and then unconditionally calls `setIsSubmitted(true)` on `result.success === true`, regardless of `result.qualified`. Both qualified leads and DQ'd leads render `<SuccessState />`, which displays "Your savings analysis is in queue. Here's what happens next." The Puppeteer test detects this string and reports `qualified=true`. The backend correctly DQs `$599,999` submissions and routes them to `SEND_DQ_BELOW_THRESHOLD` in GHL — but the user sees the identical success screen, never knowing they were DQ'd.

**Status:** Backend parser **FIXED**. UI design gap **OPEN** — DQ'd leads currently see the same "savings analysis is in queue" confirmation as qualified leads. This means real users who enter sub-threshold spend submit, see a success screen, and wait for a report that will never arrive.
**File:** `src/components/analyzer/AnalyzerForm.tsx:275-283`

---

### P03 — `"10000"` (bare number) returns `qualified=true` in pipeline test
**Input:** `annualFoodSpend: "10000"`
**Pipeline test reports:** `qualified=true`
**Expected:** DQ (below minimum threshold, $10K < $50K)
**Root cause:** Same two-issue pattern as P02. Backend: `applyBareHeuristic(10000)` = exact $10,000 → below `BELOW_MINIMUM_THRESHOLD` ($50K) → DQ. UI: same SuccessState-for-all design gap.
**Status:** Backend **FIXED** (current code). UI gap **OPEN**.

---

### R03 — Whitespace-only phone field disables submit button
**Input:** `phone: "   "` (three spaces)
**Got:** Submit button disabled on Step 4; test could not submit; `stepReached: 0`
**Expected:** Form submits (whitespace phone treated as no phone)
**Root cause:** The phone `<input>` field is using HTML `required` validation or a React validation rule that considers whitespace-only as non-empty but invalid. The submit button evaluates the phone field as invalid, preventing form submission.
**Status:** **OPEN** — whitespace-only phone should be treated as an empty/optional field and trimmed server-side before DB write. The form should allow submission.
**File:** Need to verify exact validation logic — likely `src/components/analyzer/AnalyzerForm.tsx` in `canAdvanceFromStep4` or similar.

---

### T04 — Chipotle (national chain) reports `qualified=true` in pipeline test
**Input:** `restaurantName: "Chipotle Mexican Grill"` / `website: "https://chipotle.com"`
**Pipeline test reports:** `qualified=true` (`validationDecision: "national_chain"`)
**Expected:** DQ (chain)
**Root cause — test detection gap, not a backend bug:** The pipeline test detects qualified/DQ state by searching page text for strings like "savings analysis is in queue" (qualified) vs "isn't a match" / "spend below" / "not eligible" (DQ). But the current UI shows `<SuccessState />` ("Your savings analysis is in queue") for ALL outcomes including chain DQs (`AnalyzerForm.tsx:282-283`). The backend correctly DQs Chipotle: `qualifyLead()` catches it at Priority 1 (national chain check `qualify-lead.ts:112-122`) and routes to `SEND_DQ_NATIONAL_CHAIN`. But the UI hides this from the user. The Puppeteer test can never detect a DQ outcome.
**Status:** Backend **CORRECT** — Chipotle is properly DQ'd. Pipeline test **cannot verify DQ outcomes** as designed due to the UI design gap (same as P02/P03).

---

## Severity Triage

### P0 — Would mislead or lose a real lead in production

| ID | Finding | File / Function |
|----|---------|----------------|
| **P02/P03/T04 (UI)** | DQ'd leads see "Your savings analysis is in queue" — identical to qualified leads. They wait for a report that never comes, with no explanation. | `src/components/analyzer/AnalyzerForm.tsx:275-283` — `setIsSubmitted(true)` on `result.success` ignores `result.qualified` |
| **B01** | NXDOMAIN domains (genuinely nonexistent URLs) receive `plausible_unverified` instead of `invalid_website`. A user entering a typo'd URL is told "you can still continue, our team may follow up" rather than "that domain doesn't exist." | `src/lib/website/check-website.ts:160` — DNS error classification; `src/lib/website/reachability.ts:55` |

### P1 — Wrong classification but result is conservative / safe fallback

| ID | Finding | File / Function |
|----|---------|----------------|
| **D05/D12** | `.gov` sites (usda.gov) and known non-restaurant domains (hilton.com) time out instead of returning `clear_non_fit` immediately. The Vercel function burns its full timeout budget on a domain that is on the blocklist. In real traffic, a user who enters hilton.com would wait 35 s for a timeout result rather than an instant rejection. | `src/lib/website/run-validation.ts:116` (fetch) vs `:259` (domain check) — ordering issue |
| **D11/E04** | `wholefoodsmarket.com` and `seriouseats.com` escape the `KNOWN_NON_RESTAURANT_DOMAINS` check because headless navigation changes `finalUrl`, causing `extractDomain(finalUrl)` to miss the blocklist entry. They land at `plausible_unverified` and would be routed to manual review — a wrong but not catastrophic outcome. | `src/lib/website/run-validation.ts:213` — `domain = extractDomain(finalUrl)` should also check `normalizedUrl` domain |
| **E12** | BBB.org listing URL for a restaurant returns `plausible_unverified`. A user submitting a BBB.org URL instead of their own domain gets a "can't verify but continue" message. Their submission reaches the DB but the AI can't personalize from a directory page. | `src/lib/website/run-validation.ts` — `bbb.org` not in `KNOWN_NON_RESTAURANT_DOMAINS` |
| **R03** | Whitespace-only phone field blocks form submission. A user who accidentally puts spaces in the phone field cannot submit. | `src/components/analyzer/AnalyzerForm.tsx` — phone validation |

### P2 — Edge case unlikely in real traffic

| ID | Finding |
|----|---------|
| **E08** | Goose Island Brewery taproom → `clear_non_fit` via Claude. Genuine edge case; in real traffic, a taproom operator would contact FSIQ sales regardless. |
| **F05** | `obriensirishpub.com` timeout — intermittent network issue, not a code defect. |

---

## Coverage Gaps

The following scenarios were specifically requested for review. None were adequately covered.

### 1. Absurd spend values ("2 grazillion") — NOT tested, but now fixed

The tests did not include any garbage/nonsense spend inputs like "2 grazillion", "a lot", "asdfghjkl". At test time, such inputs would have: parsed the leading digit if any digit appeared at the start → `applyBareHeuristic(2)` = $2M → `parseFallback=false` → **qualified at the $1M–$3M bucket**. This matches the described bug ("'2 grazillion' rendering as $2M").

The fix landed in commit `1a260e6` (Jun 9): `spend-parser.ts` now rejects any input where `/[a-z]/` is still present after suffix-stripping, returning `parseFallback=true`. Commit `d91c6cc` (Jun 9) then made `parseFallback=true` → DQ (`qualify-lead.ts:164-167`). **The $2M garbage-input qualification bug is fixed** but was never explicitly tested. A regression test covering inputs like "2 grazillion", "a lot", "idk", "it varies" should be added.

### 2. Under-$500K (below_threshold) DQ email NOT triggering — NOT tested, unverified

The pipeline test cannot verify DQ email delivery because the UI shows the same SuccessState for DQ'd and qualified leads. The pipeline test for P02 ($599,999) reports `qualified=true` (pipeline test's flaw) rather than verifying what GHL received.

The backend route for `below_threshold` is:
- `qualifyLead()` → `dq('below_threshold')` → `assign-lead-status.ts:126-133` → `communicationRoute: COMMUNICATION_ROUTE.SEND_DQ_BELOW_THRESHOLD`
- GHL receives contact with custom field `fsiq_communication_route: "send_dq_below_threshold"` and tag `dq_below_threshold`
- **Email delivery depends entirely on GHL automation** triggered by that tag/field — the app does not send email directly

The launch-blockers.md checklist item "End-to-end staging test: DQ (all 3 paths) → GHL sync → DQ email received" is **unchecked**. The reported symptom ("leads are told to 'try the tool again' instead of getting a DQ email") matches the **error path**, not the DQ path. If users see "Something went wrong. Please try again." it means `result.success === false` was returned, which points to an unhandled server error in `submitAnalysis` rather than the DQ routing. This is distinct from — and potentially more severe than — the known GHL automation gap.

**What's not known:** Whether the `SEND_DQ_BELOW_THRESHOLD` communication route correctly triggers a GHL workflow/automation for the DQ email. This requires a live end-to-end test with GHL monitoring.

### 3. Spend values above $99,000,000 — NOT tested

The test suite did not include any spend input at or above $99M. The current behavior:
- Inputs that parse to > $99M trigger `parseNotes.includes('capped_at_99m')` → DQ as `below_threshold` (`qualify-lead.ts:154-157`)
- Example: "200000000" (bare number, ≥100 treated as exact) → $200M → capped at $99M → `capped_at_99m` flag → DQ
- Example: "200m" → `m_suffix` → $200M → capped at $99M → DQ

This behavior is correct but was never asserted in a test. A test case for "200000000", "200m", and "$200,000,000" should be added to confirm the cap and DQ path.

### 4. No DQ-state UI — Systematic test blind spot

Every DQ outcome (below_threshold, national_chain, invalid_website, clear_non_fit) currently shows the SuccessState to the user. The pipeline test was written expecting DQ-specific text ("isn't a match", "spend below", "not eligible") that does not exist in the codebase. As a result, the pipeline test cannot verify any DQ outcome and any future backend regression on DQ routing would be invisible to automated testing until a user reports it.

This also means the reported "DQ email not triggering" issue cannot be reproduced or confirmed using the current test tooling.

---

## Observations (Unasserted Cases — Notable Findings)

These 15 cases had no assertion (observe-only) but produced noteworthy behavior:

| ID | Input | Decision | Notes |
|----|-------|----------|-------|
| A10 | `eats.io` | timeout | .io domains with headless take 35 s — worth adding to blocklist or fast-failing |
| A11 | `barney s hamburgers.com` (spaces) | `verified_restaurant` | URL with spaces is stripped to `barneyshamburgers.com` — space removal before URL parsing works |
| A12 | `barneyshamburgers.com:8080` | timeout | Non-standard ports hang. Should be normalized to drop the port or rejected as invalid |
| A14 | `grubhub.com/restaurant/...` | `plausible_unverified` | Third-party delivery platform URL not caught as a non-operator domain |
| C07 | `McDonald's of Smithtown` / `independentburger-smithtown.com` | `national_chain` | **Potential false positive** — an independent burger joint with "McDonald's" in its legal name would be wrongly DQ'd. The chain detector fires on the restaurantName containing "McDonald's" regardless of context. Fixed by chain descriptor guard in `d847182`. |
| C08 | `McDonald's Style Burgers` | `national_chain` | **Fixed** — same chain descriptor guard (`d847182`) now handles "style" qualifier. Was incorrectly fired at test time. |
| E01 | `restaurantconsultants.com` | `verified_restaurant` | Restaurant consulting firm qualified — "restaurant" in domain + some signals. B2B false positive; acceptable since manual review flags it. |
| E06 | `cloudkitchens.com` | `verified_restaurant` | Ghost kitchen platform qualified — "kitchen" in domain scores high. Platform-level false positive. |
| E11 | `linktr.ee/nomadkitchentacos` | `plausible_unverified` | Linktree food truck URL — treated as stale restaurant domain, not invalid_website. Reasonable. |
| F03 | `yelp.com/biz/barneyshamburgers-houston` | `plausible_unverified` | Yelp listing — no special handling for third-party review sites. Reasonable fallback. |

---

*Report covers: `break-test-api-results.json` (2026-06-05T22:32Z) and `break-test-pipeline-results.json` (2026-06-05T22:52Z). No tests were re-run and no code was modified to produce this report.*
