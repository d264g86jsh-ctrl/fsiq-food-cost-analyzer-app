# QA Checklist — FSIQ Food Cost Analyzer

SOP reference: `docs/FSIQ_SOP_v3.3.md` §23 (archive: `docs/FSIQ_SOP_v3.3.pdf`). Run after every build or phase update.

---

## Branding and UI Consistency

Brand source of truth: `docs/brand-guidelines.md`

- [ ] Header background is dark green (`#143225`), white wordmark logo displayed
- [ ] White logo (`/brand/fsiq-logo-white-transparent.png`) used on dark green header — not the black logo
- [ ] Logo files exist in `public/brand/` and serve correctly (no 404)
- [ ] No base64 logo strings embedded in components, CSS, or config files
- [ ] Primary buttons use dark green background with white text
- [ ] Accent green (`#52C275`) used for progress bar fill and verified status
- [ ] `invalid_website` state shows red text; all other validation states show gray/informational
- [ ] `national_chain` and `non_us` states show soft gray informational text — never red or hostile
- [ ] Step progress indicator visible at all steps
- [ ] Contact fields (`full_name`, `email`, `phone`) appear only on Step 4
- [ ] `top_skus` is a free-text textarea — no dropdown or multi-select
- [ ] All inputs have adequate tap target height (min 44px) for mobile
- [ ] Form renders correctly on mobile viewport (375px width)
- [ ] No harsh/rejecting language in validation messages
- [ ] Footer shows "FoodServiceIQ — Confidential"
- [ ] Success state shown after submission with soft confirmation message

---

## AI Pipeline (Phase 5)

- [ ] `ANTHROPIC_API_KEY` missing → `aiFallbackUsed = true`, fallback narratives used, app does not throw
- [ ] Claude call timeout/error → `aiFallbackUsed = true`, fallback narratives used, app does not throw
- [ ] Claude returns invalid JSON → `aiFallbackUsed = true`, fallback narratives used
- [ ] `logoUrl` is verbatim from `websiteLogoHints` or null — never a fabricated URL
- [ ] `businessSummary` max 500 chars, `narrativeDistributor/Procurement/Sku` each max 600 chars
- [ ] No em-dashes or en-dashes in any AI or fallback narrative output
- [ ] `finalPct`, `dollarEstimate`, `spendBucket`, `caseStudy` are unchanged by AI calls
- [ ] `qualified` status is unchanged by AI calls
- [ ] `topSkus` referenced naturally in `narrativeSku` when provided
- [ ] `narrativeSku` uses generic category copy when `topSkus` is empty
- [ ] AI functions are stateless — Phase 8 decides whether to call AI for DQ leads

---

## Qualified Path

- [ ] Complete quiz flow: Step 1 → Step 2 → Step 3 → Step 4 → submit
- [ ] Submit form: real restaurant website, valid ZIP, spend `$1M - $3M`, non-chain
- [ ] `websiteStatus` is 200 or 403 (not 404)
- [ ] `qualified = true`, `finalPct` in 4–8% range, `dqReason = null`
- [ ] `websiteLogoHints` has at least one entry
- [ ] AI Researcher: `parseOk = true`, `businessSummary` populated
- [ ] AI Narrative: `allNarrativesPresent = true`, each block 50–80 words, no em/en-dashes
- [ ] PDFMonkey returns a valid `download_url`
- [ ] **Visual PDF review (all 6 pages):**
  - P1 Cover: client logo (or IQ fallback), FSIQ wordmark, 4 metadata columns, name properly capitalized
  - P2: `finalPct` shows 1 decimal (e.g. `7.4%`), bar chart has visibly different heights, Year 5 tallest
  - P3: 3 narrative blocks with real content, no em/en-dashes
  - P4: 4 quadrants, "Book Your Full Analysis Call" button → Calendly
  - P5: Correct case study for spend bucket + locations combo
  - P6: "Book Your Free Analysis Call" → Calendly, disclaimer left-aligned, footer reads `FoodServiceIQ — CONFIDENTIAL`
  - All pages: Inter font rendered, headers/footers not overlapping content
- [ ] Email arrives with dark green PDF button + green Calendly button, both clickable

---

## Submission Behavior (All Paths)

- [ ] Form submission is **never blocked by business eligibility decisions** (`clear_non_fit`, `national_chain`, `invalid_website`, `below_threshold`, `non_us`)
- [ ] Form submission IS blocked for: missing required fields, invalid email format, malformed ZIP
- [ ] Every completed submission is saved to the DB regardless of outcome
- [ ] Every completed submission is synced to GHL regardless of outcome
- [ ] DQ routing, PDF generation, and email delivery all happen server-side after submission

---

## Disqualified Path Tests (run all 3)

| Input | Expected decision | Expected email subject | DB saved | GHL synced |
|---|---|---|---|---|
| Restaurant name: `McDonalds`, normal spend | `national_chain` | "About your FoodServiceIQ submission" | ✓ | ✓ |
| Website: nonexistent URL returning 404, normal spend | `invalid_website` | "Quick check on your FoodServiceIQ submission" | ✓ | ✓ |
| Annual spend: `200` (parses to $200K) | `below_threshold` | "Thanks for using FoodServiceIQ's Food Cost Analyzer" | ✓ | ✓ |

For each: confirm no Claude steps fire, no PDF generated, correct DQ email arrives, submission saved to DB, GHL tag applied.

---

## Cloudflare Test

- [ ] Submit with `https://spiritscenla.com` as website (Cloudflare-protected)
- [ ] `websiteStatus` = 200 or 403 — **not** 0 or 404
- [ ] Lead proceeds to Qualified path (if spend > $500K)

---

## ZIP / Postal Code and Country Eligibility

- [ ] `78704` → valid U.S. ZIP, accepted, no message
- [ ] `78704-1234` → valid ZIP+4, accepted, no message
- [ ] `H2X 1Y4` → non-U.S. format, friendly message shown, form submit blocked, `non_us_postal_code` flag set
- [ ] `abc` → malformed, "Please enter a valid U.S. ZIP code (e.g. 78704).", form submit blocked
- [ ] Empty → "ZIP code is required.", form submit blocked
- [ ] Invalid ZIP blocks submission but does not DQ the lead on its own
- [ ] Google Places returns U.S. address → `countryEligibility: "us_verified"`, `google_place_us_confirmed` flag
- [ ] Google Places returns non-U.S. address → `countryEligibility: "non_us"`, `google_place_non_us` flag, `finalDecision: "clear_non_fit"`, `internalFlag: non_us_ineligible`
- [ ] `countryEligibility: "non_us"` → no PDF generated (full or conservative); polite ineligible message sent
- [ ] `countryEligibility: "unknown"` + plausible restaurant signals → `plausible_unverified`; conservative PDF allowed
- [ ] `countryEligibility: "likely_us"` + `verified_restaurant` → full personalized PDF allowed
- [ ] Non-U.S. lead receives polite message — no harsh country language used

---

## Website Validation (Real-Time)

- [ ] Valid U.S. restaurant URL + valid U.S. ZIP → `verified_restaurant` or `plausible_unverified`, submit enabled
- [ ] National chain name + valid URL → `national_chain`, submit blocked
- [ ] URL returning 404 → `invalid_website`, submit blocked
- [ ] Cloudflare-protected URL (403) → `plausible_unverified` or `verified_restaurant`, submit enabled
- [ ] Timeout / unreachable → `plausible_unverified`, submit enabled, `manualReviewRequired = true`
- [ ] Google Places returns restaurant match → `googlePlacesScore` > 0, logged in response
- [ ] Google Places unavailable → validation degrades gracefully, does not block submission

---

## Savings Calculation Guardrail

Source of truth: `docs/savings-formula.md`. Run after Phase 3 and after any change to qualification logic.

### Spend Parser Edge Cases

| Input | Expected parse | Expected bucket |
|---|---|---|
| `1` | $1,000,000 | $1M–$3M |
| `500` | $500,000 | $500K–$800K |
| `500k` | $500,000 | $500K–$800K |
| `1-2M` | $1,500,000 (range midpoint) | $1M–$3M |
| `one million` | $1,000,000 | $1M–$3M |
| `depends` | $2,000,000 fallback, `parseFallback: true` | $1M–$3M |
| `on mllion` | $1,000,000 (typo tolerance) | $1M–$3M |
| `$3,500,000` | $3,500,000 | $3M–$7M |

### DQ Priority

- [ ] National chain name → `national_chain` regardless of spend or website
- [ ] 404 website + valid spend → `invalid_website` (only after chain check)
- [ ] 403/503/0/timeout website + valid spend → NOT `invalid_website`; proceed to spend check
- [ ] Spend $499,999 → `below_threshold`
- [ ] Spend $500,000 → `qualified = true`

### Spend Bucket Boundaries
- [ ] $499,999 → `below_threshold`
- [ ] $500,000 → `$500K–$800K` bucket
- [ ] $799,999 → `$500K–$800K` bucket
- [ ] $800,000 → `$800K–$1M` bucket
- [ ] $999,999 → `$800K–$1M` bucket
- [ ] $1,000,000 → `$1M–$3M` bucket
- [ ] $2,999,999 → `$1M–$3M` bucket
- [ ] $3,000,000 → `$3M–$7M` bucket
- [ ] $6,999,999 → `$3M–$7M` bucket
- [ ] $7,000,000 → `$7M+` bucket

### finalPct Clamp (approved range: 4.0%–8.0%)
- [ ] `rawTotal` = 3.5 → `finalPct` = 4.0 (floor applied)
- [ ] `rawTotal` = 4.0 → `finalPct` = 4.0 (at floor, no clamp)
- [ ] `rawTotal` = 6.5 → `finalPct` = 6.5 (no clamp)
- [ ] `rawTotal` = 8.0 → `finalPct` = 8.0 (at ceiling, no clamp)
- [ ] `rawTotal` = 9.1 → `finalPct` = 8.0 (ceiling applied)

### dollarEstimate Calculation
- [ ] $1M–$3M bucket, `finalPct` 5.5% → `round(0.055 × 2,000,000)` = `$110,000`
- [ ] $500K–$800K bucket, `finalPct` 4.0% → `round(0.04 × 650,000)` = `$26,000`
- [ ] $7M+ bucket, `finalPct` 8.0% → `round(0.08 × 8,500,000)` = `$680,000`

### Case Study Selection
- [ ] `$500K–$800K` + single → Black's BBQ
- [ ] `$500K–$800K` + 2–4 locations → MaryAnn's Diner
- [ ] `$1M–$3M` + single → Spirits
- [ ] `$3M–$7M` + single → The Oasis
- [ ] `$3M–$7M` + 2–4 locations → Dish Society
- [ ] `$7M+` + 5+ locations → Thunderdome

### 5-Year Projections
- [ ] Year 1 = `dollarEstimate`
- [ ] Year 2–5: cumulative 3.9% USDA inflation applied annually — verify formula matches `docs/savings-formula.md §12`
- [ ] Year 5 always has the tallest bar (`year5HeightPct` = 100)
- [ ] All bar heights are proportional to Year 5; minimum bar height = 8%

### AI Boundary Check
- [ ] `finalPct` in code output matches qualification engine, not Claude response
- [ ] `dollarEstimate` in PDF matches `finalPct × bucketMidpoint`, not any AI-generated figure
- [ ] Claude response contains narrative text only — no numbers feeding into PDF calculations

---

## PDF Routing

- [ ] `verified_restaurant` + `us_verified`/`likely_us` + qualified → **full personalized PDF** generated and emailed
- [ ] `plausible_unverified` + `likely_us`/`unknown` + qualified → **conservative profile-based PDF** generated (no website-specific claims)
- [ ] `clear_non_fit` (any reason including `non_us`) → no PDF generated
- [ ] `national_chain` → no PDF generated
- [ ] `invalid_website` → no PDF generated
- [ ] `below_threshold` → no PDF generated

---

## PDF Generation (PDFMonkey Direct API) — Phase 6

- [ ] PDFMonkey API called directly from app backend — no Zapier
- [ ] `PDFMONKEY_API_KEY` and `PDFMONKEY_TEMPLATE_ID` env vars present
- [ ] Missing credentials → `pdfStatus = "skipped"`, app does not throw
- [ ] Successful call: `pdfStatus = "complete"`, `pdfDownloadUrl` populated
- [ ] Failed call: `pdfStatus = "error"`, `pdfError` populated, `pdfRetryCount` incremented
- [ ] 27-variable payload assembled correctly (26 SOP vars + approved `reportDate`)
- [ ] `reportDate` format: "Month YYYY" (e.g., "May 2026")
- [ ] `conceptBenchmark` uses correct lookup value for concept type; defaults to "28%–32%"
- [ ] `conceptBenchmark` en-dashes are intentional — do not strip
- [ ] Conservative PDF: `logoUrl=""`, `hasLogo=false`, `businessSummary=""`, savings unchanged
- [ ] `determinePdfMode()` returns `full`, `conservative`, or `skip` correctly for all routing cases
- [ ] Client logo from validated URL; `onerror` fallback loads FSIQ IQ icon
- [ ] Visual PDF review (all 6 pages):
  - P1 Cover: client logo (or IQ fallback), FSIQ wordmark, 4 metadata columns, name properly capitalized
  - P2: `finalPct` shows 1 decimal (e.g. `7.4%`), bar chart Year 5 tallest
  - P3: 3 narrative blocks, no em/en-dashes
  - P4: 4 quadrants, "Book Your Full Analysis Call" → Calendly
  - P5: Correct case study for spend bucket + locations combo
  - P6: "Book Your Free Analysis Call" → Calendly, disclaimer left-aligned, footer reads `FoodServiceIQ — CONFIDENTIAL`
  - All pages: Inter font rendered, no overlapping content

---

## Manual Review Routing

- [ ] `manualReviewRequired = true` submissions do not receive automated email
- [ ] Manual review submissions visible in admin dashboard
- [ ] Admin can trigger PDF retry / approve / reject from dashboard

---

## Database / Schema

Run after Phase 1 and after any schema migration.

- [ ] `pnpm prisma validate` passes
- [ ] `pnpm prisma:generate` succeeds
- [ ] All enum types present: `FinalDecision`, `CountryEligibility`, `DqReason`, `PdfMode`, `PdfStatus`, `EmailStatus`, `CrmSyncStatus`, `WorkflowStatus`, `ManualReviewStatus`
- [ ] Submission record created on every form submission regardless of outcome
- [ ] UTM fields (`utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm`) populated from query params
- [ ] `ipAddress` captured at submission time
- [ ] `workflowStage` updates at each pipeline step
- [ ] All retry counters (`pdfRetryCount`, `emailRetryCount`, `crmSyncRetryCount`) default to 0
- [ ] `manualReviewStatus` defaults to `not_required`; updated to `pending` when `manualReviewRequired = true`
- [ ] `crmTags` JSON field populated before GHL sync

---

## Meta Tracking

- [ ] Meta Pixel fires page view on form load
- [ ] Meta Pixel fires form submit event on submission
- [ ] Meta Conversions API server-side event fires for qualified leads; `ipAddress` and UTM passed for matching
- [ ] `metaStatus` updated to `"fired"` on success; `metaError` populated on failure

---

## CRM Sync (GoHighLevel)

- [ ] **Every submission syncs to GHL** — verified, DQ, manual review, non-U.S., and all other outcomes
- [ ] `crmSyncStatus` persisted (`"pending"` / `"synced"` / `"error"`); `crmContactId` stored on success
- [ ] GHL contact created with correct `GHL_LOCATION_ID` and `GHL_PIPELINE_ID`
- [ ] Tag `FSIQ Analyzer Submitted` applied to every submission
- [ ] Outcome tags applied correctly: `Full PDF Sent`, `Conservative PDF Sent`, `DQ National Chain`, `DQ Invalid Website`, `DQ Below Threshold`, `DQ Clear Non Fit`, `Non US Ineligible`, `Manual Review Required`, `PDF Failed`, `Email Failed`
- [ ] Heuristic tags applied where appropriate: `Possible Test Submission`, `Possible Spam Submission`
- [ ] CRM sync failure does not block email delivery; error logged to `crmSyncError`
- [ ] Admin dashboard shows CRM sync status per submission; can trigger manual retry

---

## Known Failure Modes (from SOP §24)

- **Logo broken on cover:** Check `FSIQ_IQ_LOGO_URL` is valid; `onerror` fallback should swap in automatically
- **Em-dashes in PDF:** Verify `stripDashes` is receiving the correct Claude output field
- **PDFMonkey not rendering:** Check all 26 variable names match template, correct `PDFMONKEY_TEMPLATE_ID`
- **Cloudflare sites returning 0:** Update browser `User-Agent` string in `check-website.ts`
