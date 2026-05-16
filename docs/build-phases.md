# Build Phases — FSIQ Food Cost Analyzer

SOP reference: `docs/FSIQ_SOP_v3.3.md` (primary) / `docs/FSIQ_SOP_v3.3.pdf` (archive)  
Validation spec: `docs/website-validation-spec.md`  
Savings formula: `docs/savings-formula.md`

Each phase is self-contained. Propose → get approval → implement → check → `/commit-push-pr`.

---

## Pre-Phase — Docs / Spec Cleanup
- [x] Create `docs/FSIQ_SOP_v3.3.md` (Markdown SOP, primary reference going forward)
- [x] Create `docs/savings-formula.md` (savings formula source of truth)
- [x] Create `docs/website-validation-spec.md`
- [x] Create `docs/architecture.md`, `docs/build-phases.md`, `docs/qa-checklist.md`
- [x] Confirm documentation hierarchy in `CLAUDE.md`

---

## Phase 0 — Project Scaffold
- Init Next.js (App Router, TypeScript, Tailwind)
- Add Prisma, configure PostgreSQL connection
- Create `.env.local` (not committed) and `.env.example` (committed, all values blank) — see `.env.example` for full var list including `META_PIXEL_ID`, `GHL_API_KEY`, etc.
- Set up `.claude/settings.json` with hooks (run `pnpm tsc --noEmit` on PostToolUse)
- Confirm deployment target / hosting provider
- Confirm `pnpm dev`, `pnpm tsc`, `pnpm lint` all pass

---

## Phase 1 — Database Schema
SOP reference: `docs/FSIQ_SOP_v3.3.md` §5

Define `Submission` model in `prisma/schema.prisma`. Run initial migration.

Required fields:
- All 12 form inputs including `zipCode`
- `websiteValidationResult` (JSON), `finalDecision`, `countryEligibility`, `internalFlags`
- `qualified`, `dqReason`, `spendBucket`, `finalPct`, `dollarEstimate`, `caseStudy`
- Projections: `year1`–`year5`, `projectionHeights` (JSON)
- `logoUrl`, `businessSummary`, `conceptSignals`
- `narrativeDistributor`, `narrativeProcurement`, `narrativeSku`
- `pdfStatus`, `pdfMonkeyDocumentId`, `pdfDownloadUrl`, `pdfError`, `pdfRetryCount`
- `emailSentAt`, `emailVariant`, `emailError`
- `manualReviewRequired`, `manualReviewNotes`, `manualReviewedAt`
- `metaEventFired`, `crmSyncStatus`, `crmSyncError`, `crmContactId`
- `createdAt`, `updatedAt`

---

## Phase 2 — Website Validator
Full spec: `docs/website-validation-spec.md`  
U.S.-only eligibility enforced here — ZIP format gate + Google Places country check.

- `src/lib/website/normalize-url.ts` — normalization, platform detection
- `src/lib/website/check-website.ts` — fetch with browser UA, redirect tracking, reachability classification
- `src/lib/website/extract-signals.ts` — restaurant/negative signal extraction
- `src/lib/website/reachability.ts` — HTTP/network status → reachability status mapping
- `src/lib/website/headless-fetch.ts` — Playwright fallback (blocked/thin/JS-heavy only)
- `src/lib/relevance/classify-restaurant.ts` — rule-based scoring
- `src/lib/relevance/website-relationship.ts` — name-to-domain fuzzy matching
- `src/lib/relevance/google-places.ts` — Google Places Text Search + Place Details; verifies U.S. country via address field
- `src/lib/relevance/location-eligibility.ts` — ZIP format validation, `countryEligibility`, `locationConfidenceScore`
- `src/lib/relevance/claude-classifier.ts` — Claude AI tiebreaker (ambiguous cases only)
- `src/lib/qualification/national-chains.ts` — `NATIONAL_CHAINS` list + chain detection
- `POST /api/validate-website` — real-time endpoint (on field blur)
- `src/components/analyzer/WebsiteValidationStatus.tsx` — 8-state UX badge
- Validation flow: normalize → fetch → reachability → headless fallback → signal extraction → Google Places → chain detection → rule-based scoring → Claude tiebreaker → decision
- Runs three times: live, on submit, pre-PDF gate
- Unit tests: all cases in spec §L

---

## Phase 3 — Savings + Qualification Engine
Source of truth: `docs/savings-formula.md`

- `src/lib/qualification/savings-formula.ts` — `finalPct` clamp, `dollarEstimate`, projections, case study selection
- `src/lib/qualification/spend-parser.ts` — spend text → dollar value with typo tolerance and fallback
- `src/lib/qualification/qualify-lead.ts` — DQ priority logic, bucket assignment, full scoring pipeline

**Non-negotiable rules:**
- `finalPct` clamped to **4.0%–8.0%** (approved product decision — overrides SOP's prior 5.0% floor)
- `dollarEstimate` = `round(finalPct / 100 × bucketMidpoint)` — no other formula
- AI must not influence `finalPct`, `spendBucket`, `dollarEstimate`, `caseStudy`, or DQ decisions

Required unit tests (`src/lib/__tests__/savings-formula.test.ts`):
- Spend parser: all edge cases from `docs/savings-formula.md §14`
- DQ priority: `national_chain` → `invalid_website` (404 only) → `below_threshold`
- Bucket boundaries: all 6 breakpoints including $500K floor
- `finalPct` clamp: floor at 4.0, ceiling at 8.0, mid-range passthrough
- `dollarEstimate`: verify `round(finalPct / 100 × bucketMidpoint)` for each bucket
- Case study: all bucket × locations combinations
- 5-year projections: 3.9% USDA inflation, cumulative; Year 5 always largest

---

## Phase 4 — Analyzer Quiz / Calculator Flow
UX spec: `docs/analyzer-ux-flow.md` (overrides SOP field order)

- `src/components/AnalyzerForm.tsx` — multi-step quiz wrapper
- **Step 1 (qualification fields first):** `restaurant_name`, `website`, `zip_code`, `concept_type`, `locations`, `annual_food_spend`, `distributor_type`, `procurement_strategy` — dropdowns; `top_skus` — free text (label: "What are your biggest food spend categories or key items?"; qualification engine parses for protein/commodity keywords per `docs/savings-formula.md`)
- **Step 2 (contact fields last):** `full_name`, `email`, `phone`
- Wire real-time website+ZIP validation on field blur (Phase 2 endpoint)
- **Never block submission based on business eligibility** — only block on missing/malformed required fields
- Show inline validation state for `clear_non_fit`, `national_chain`, `invalid_website` — inform the user but allow submission
- Show conservative-mode notice for `plausible_unverified` — informational only, not a block
- Every submission is saved to DB and synced to GHL; PDF/DQ routing happens server-side in `submitAnalysis.ts`
- Server actions: `src/actions/validateWebsite.ts`, `src/actions/submitAnalysis.ts`

---

## Phase 5 — AI Research + Narrative
SOP reference: `docs/FSIQ_SOP_v3.3.md` §14, §17

The AI pipeline generates research and narrative content only. It does **not** compute savings math or make DQ decisions.

- `src/lib/ai/aiResearcher.ts` — Claude researcher prompt; outputs `logo_url` (verbatim from `websiteLogoHints`), `business_summary`, `concept_signals`, `scrape_status`
- `src/lib/ai/aiNarrative.ts` — Claude narrative prompt; outputs `narrative_distributor`, `narrative_procurement`, `narrative_sku` (50–80 words each, no em/en-dashes)
- 1-second delay between Claude calls
- Model: `claude-sonnet-4-6`, max 1000 tokens per call
- Strip em/en-dashes from narrative output as a safety net

---

## Phase 6 — PDF Generation
SOP reference: `docs/FSIQ_SOP_v3.3.md` §19, §22

PDF generation is its own phase — separate from the AI pipeline. The app backend calls PDFMonkey directly.

- `src/lib/pdf/build-pdf-payload.ts` — assemble 26-variable payload from qualification + AI outputs
- `src/lib/pdf/pdfmonkey.ts` — direct PDFMonkey API call using `PDFMONKEY_API_KEY` and `PDFMONKEY_TEMPLATE_ID`
- **No Zapier.** The app backend owns this call.
- **Full personalized PDF:** `verified_restaurant` + `countryEligibility` `us_verified`/`likely_us` + qualified
- **Conservative profile-based PDF:** `plausible_unverified` + `countryEligibility` `likely_us`/`unknown` + qualified; no website-specific claims
- **No PDF:** `clear_non_fit` (any reason, including `non_us`), `national_chain`, `invalid_website`, `below_threshold`
- Persist: `pdfStatus`, `pdfMonkeyDocumentId`, `pdfDownloadUrl`, `pdfError`, `pdfRetryCount`
- Retry-safe: PDFMonkey call can fail and retry independently from AI pipeline

---

## Phase 7 — Email Delivery
SOP reference: `docs/FSIQ_SOP_v3.3.md` §12, §21

- `src/lib/email/send-email.ts` — email dispatch
- `src/lib/email/templates/` — one file per variant: `qualified.ts`, `qualified-conservative.ts`, `dq-invalid-website.ts`, `dq-below-threshold.ts`, `dq-national-chain.ts`, `dq-clear-non-fit.ts`

| Condition | Email |
|---|---|
| Qualified (full or conservative PDF) | PDF link + Calendly CTA |
| `invalid_website` | "Quick check on your submission" |
| `below_threshold` | "Thanks for using…" |
| `national_chain` | "About your submission" |
| `manual_review` | No email (manual follow-up only) |
| `clear_non_fit` (`non_us`) | Polite ineligible message — no harsh country language |

No PDF link in DQ emails.

---

## Phase 8 — Pipeline Orchestration
- `src/actions/submitAnalysis.ts` — orchestrate Phases 2–7 in sequence
- Persist submission to DB at each stage (validation → qualification → AI → PDF → email)
- Route to correct PDF mode (full vs conservative) based on `finalDecision` and `countryEligibility`
- Route `manualReviewRequired` submissions without sending email; flag in DB
- Handle errors gracefully: log, persist error state, do not throw to user

---

## Phase 9 — Meta Tracking
- Meta Pixel — client-side page view, form start, form submit events
- Meta Conversions API — server-side qualified lead event (matched to form submit)
- Env vars: `META_PIXEL_ID`, `META_CONVERSIONS_API_TOKEN`
- Persist `metaEventFired` on submission record

---

## Phase 10 — CRM Sync (GoHighLevel)
- `src/lib/crm/ghl.ts` — sync **every form submission** to GoHighLevel (GHL), regardless of outcome
- Env vars: `GHL_API_KEY`, `GHL_LOCATION_ID`, `GHL_PIPELINE_ID`
- **No submissions excluded** — DQ leads, non-U.S. leads, manual review, and all other outcomes all sync
- App database is source of truth; GHL is the sync destination
- Use GHL tags to segment quality and outcome:
  - `FSIQ Analyzer Submitted` — all submissions
  - `Verified Restaurant` / `Plausible Unverified` — by `finalDecision`
  - `Full PDF Sent` / `Conservative PDF Sent` — by PDF mode delivered
  - `Manual Review Required` — `manualReviewRequired === true`
  - `DQ National Chain` / `DQ Invalid Website` / `DQ Below Threshold` / `DQ Clear Non Fit` — by `dqReason`
  - `Non US Ineligible` — `internalFlags` includes `non_us_ineligible`
  - `PDF Failed` / `Email Failed` — by error state
  - `Possible Test Submission` / `Possible Spam Submission` — heuristic flags
- Persist `crmSyncStatus`, `crmSyncError`, `crmContactId` on submission record
- CRM sync failure does not block email delivery; log error and retry separately
- Admin dashboard (Phase 11) can trigger manual CRM retry for failed syncs

---

## Phase 11 — Admin + Manual Review Dashboard
- Admin-only route: view all submissions
- Filter by status, date, `manualReviewRequired`
- Manually approve / reject / retry PDF for flagged submissions
- Trigger retry for failed PDFMonkey or email jobs

---

## Phase 12 — QA & Hardening
- Run full QA checklist from `docs/qa-checklist.md`
- Cloudflare test with `spiritscenla.com`
- Spend parser edge cases
- All DQ path tests
- Full vs conservative PDF routing
- Visual PDF review (all 6 pages)
- ZIP/postal code and country eligibility edge cases
- Meta event and CRM sync verification
- Admin dashboard manual review flow
- `/security-review` before deploy
