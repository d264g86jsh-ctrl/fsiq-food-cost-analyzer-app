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
- Traffic attribution: `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm`, `ipAddress`
- Meta: `metaStatus`, `metaEventIds` (JSON), `metaError`
- GHL: `crmSyncStatus`, `ghlContactId`, `crmTags` (JSON), `crmSyncError`, `crmSyncRetryCount`
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
Brand spec: `docs/brand-guidelines.md` (colors, logo assets, component styling)

- `src/components/analyzer/AnalyzerForm.tsx` — 4-step quiz wrapper
- **Step 1 — Restaurant basics/validation:** `restaurant_name`, `website`, `zip_code` — real-time validation triggers on blur
- **Step 2 — Restaurant profile:** `concept_type`, `locations`, `annual_food_spend` — dropdowns
- **Step 3 — Purchasing profile:** `distributor_type`, `procurement_strategy` — dropdowns; `top_skus` — free text (label: "What are your biggest food spend categories or key items?"; qualification engine parses for protein/commodity keywords per `docs/savings-formula.md`)
- **Step 4 — Contact fields last:** `full_name`, `email`, `phone`
- Wire real-time website+ZIP validation on field blur (Phase 2 endpoint)
- **Never block submission based on business eligibility** — only block on missing/malformed required fields, active `checking` state, or `invalid_website`
- Show inline validation state for all 9 UI states including `non_us` — inform the user but allow submission unless `invalid_website`
- Capture hidden tracking fields (UTM, fbclid, gclid, referrer, landing_page_url, fbp, fbc) into the typed payload — do not display, do not block on missing
- `src/lib/analyzer/form-types.ts` — `AnalyzerFormPayload` type and dropdown option constants
- `src/lib/analyzer/form-validation.ts` — ZIP/email validators, step advancement gates
- Server actions: `src/actions/validateWebsite.ts`, `src/actions/submitAnalysis.ts` (stub in Phase 4)
- Logo assets decoded into `public/brand/` — see `docs/brand-guidelines.md`

---

## Phase 5 — AI Research + Narrative
SOP reference: `docs/FSIQ_SOP_v3.3.md` §14, §17

The AI pipeline generates research and narrative content only. It does **not** compute savings math or make DQ decisions.

- `src/lib/ai/ai-types.ts` — shared types: `FormContext`, `AiResearchInput`, `AiResearchResult`, `AiNarrativeResult`
- `src/lib/ai/ai-client.ts` — server-only Anthropic SDK singleton; graceful null return when key is missing
- `src/lib/ai/research-input.ts` — `buildResearchInput()` — shapes form + Phase 2 + Phase 3 outputs into safe AI context (no raw HTML)
- `src/lib/ai/prompts.ts` — prompt builders for researcher and narrative (JSON output only, savings fields labeled read-only)
- `src/lib/ai/ai-researcher.ts` — `runAiResearch()` — outputs `logoUrl` (verbatim from `websiteLogoHints` or null), `businessSummary` (max 500 chars), `conceptSignals` (max 10 items), `scrapeStatus`
- `src/lib/ai/ai-narrative.ts` — `generateAiNarrative()` — outputs `narrativeDistributor`, `narrativeProcurement`, `narrativeSku` (max 600 chars each, em/en-dashes stripped post-processing)
- `src/lib/ai/fallback-narrative.ts` — `buildFallbackResearch()` + `buildFallbackNarrative()` — deterministic fallback when AI is unavailable, times out, or returns invalid JSON
- Model: `claude-sonnet-4-6`, max 1000 tokens per call
- 1-second delay between Claude calls is the **Phase 8 orchestrator's** responsibility
- Phase 5 functions are stateless — Phase 8 decides whether to invoke AI for qualified, DQ, or conservative cases
- Strip em/en-dashes from narrative output as a safety net (enforced in `ai-narrative.ts`, not Phase 8)

---

## Phase 6 — PDF Generation
SOP reference: `docs/FSIQ_SOP_v3.3.md` §19, §22

PDF generation is its own phase — separate from the AI pipeline. The app backend calls PDFMonkey directly.

- `src/lib/pdf/pdf-types.ts` — `PdfPayload`, `PdfModeDecision`, `GeneratePdfInput`, `GeneratePdfResult`
- `src/lib/pdf/pdf-mode.ts` — `determinePdfMode()` — `full` / `conservative` / `skip` routing
- `src/lib/pdf/build-pdf-payload.ts` — assemble 27-variable payload (26 from SOP §19 + approved `reportDate`)
- `src/lib/pdf/pdfmonkey.ts` — direct PDFMonkey API call using `PDFMONKEY_API_KEY` and `PDFMONKEY_TEMPLATE_ID`
- **No Zapier.** The app backend owns this call.
- **Full personalized PDF:** `verified_restaurant` + `countryEligibility` `us_verified`/`likely_us` + qualified
- **Conservative profile-based PDF:** `plausible_unverified` + `countryEligibility` `likely_us`/`unknown` + qualified; no website-specific claims (`logoUrl=""`, `hasLogo=false`, `businessSummary=""`)
- **No PDF:** `clear_non_fit` (any reason, including `non_us`), `national_chain`, `invalid_website`, `below_threshold`
- `reportDate` is the approved 27th variable (e.g., "May 2026") — PDF/report presentation only, not business logic
- Persist: `pdfStatus`, `pdfMonkeyDocumentId`, `pdfDownloadUrl`, `pdfError`, `pdfRetryCount`
- Retry-safe: PDFMonkey call can fail and retry independently from AI pipeline
- Missing credentials → `pdfStatus: "skipped"` (safe dev/staging behavior, no throw)

---

## Phase 7 — Lead Status + GHL/Zapier Email Handoff Contract
Contract doc: `docs/ghl-email-handoff.md`

The app does not send customer-facing email in v1. The app outputs a final lead record
to GHL after all processing is complete. GHL/Zapier sends emails based on
`fsiq_communication_route` and the applied tags.

**v1 handoff rule: single final GHL sync after processing.**

- `src/lib/crm/lead-status.ts` — `LeadStatus` + `CommunicationRoute` constants/types
- `src/lib/crm/ghl-tags.ts` — GHL tag string constants
- `src/lib/crm/ghl-types.ts` — `GhlHandoffPayload` type (all custom fields + tags)

Lead status and communication route mapping:

| Condition | `fsiq_lead_status` | `fsiq_communication_route` |
|---|---|---|
| Qualified full PDF, `pdfDownloadUrl` confirmed | `qualified_full_pdf_ready` | `send_full_report` |
| Qualified conservative PDF, `pdfDownloadUrl` confirmed | `qualified_conservative_pdf_ready` | `send_conservative_report` |
| Qualified, PDF started but URL not yet confirmed | `qualified_pdf_pending` | *(GHL sync deferred)* |
| `invalid_website` | `disqualified_invalid_website` | `send_dq_invalid_website` |
| `below_threshold` / `below_minimum` | `disqualified_below_threshold` | `send_dq_below_threshold` |
| `national_chain` | `disqualified_national_chain` | `send_dq_national_chain` |
| `clear_non_fit` (non-US) | `disqualified_non_us` | `send_dq_non_us` |
| `clear_non_fit` (other) | `disqualified_clear_non_fit` | `send_dq_clear_non_fit` |
| `manualReviewRequired = true` | `manual_review_required` | `manual_review_hold` |
| Qualified, `pdfStatus = error` | `pdf_failed` | `pdf_failure_hold` |
| Pipeline error | `workflow_failed` | `no_email_hold` |

**PDF-ready tags (`FSIQ Full PDF Ready`, `FSIQ Conservative PDF Ready`) are never sent
until `pdfDownloadUrl` is non-null and confirmed usable.**

---

## Phase 8 — App Workflow Orchestration + GHL Sync
- `src/lib/db.ts` — Prisma client singleton (`globalForPrisma` pattern)
- `src/lib/crm/assign-lead-status.ts` — `assignLeadStatus()` pure function; returns `leadStatus`, `communicationRoute`, `tags`, `shouldSyncGhl`
- `src/lib/crm/build-ghl-payload.ts` — `buildGhlPayload()` maps Prisma `Submission` + status/route/tags → `GhlHandoffPayload`
- `src/lib/crm/ghl.ts` — `syncToGhl()` upsert-by-email via LeadConnector API; missing credentials → error result, no throw
- `src/actions/submitAnalysis.ts` — full pipeline replacing Phase 4 stub
- Persist submission to DB at each stage (validated → qualified → ai_research → ai_narrative → pdf_generation → complete)
- Route to correct PDF mode (full vs conservative) based on `finalDecision` and `countryEligibility`
- **Single final GHL handoff after all processing is complete:**
  - DQ leads: sync immediately after DQ route is known — no PDF required
  - Qualified PDF leads: defer GHL sync until `pdfDownloadUrl` is non-null and confirmed
  - Manual review leads: sync with `manual_review_hold` — no PDF-ready tag, no email fires
  - PDF failure: sync with `pdf_failure_hold` — no report email until PDF is retried and URL confirmed
  - `qualified_pdf_pending` status defers GHL sync — do not sync with PDF-ready tag prematurely
- `clear_non_fit` leads are always DQ regardless of spend (orchestrator overrides qualified=true from the engine)
- Handle errors gracefully: log, persist `workflowErrors` JSON, do not throw to user
- Env vars: `GHL_ACCESS_TOKEN` (preferred) or `GHL_API_KEY` fallback; `GHL_LOCATION_ID`; `GHL_API_BASE_URL` (default: `https://services.leadconnectorhq.com`)

---

## Phase 9 — Meta Tracking
- Meta Pixel — client-side page view, form start, form submit events
- Meta Conversions API — server-side qualified lead event (matched to form submit)
- Env vars: `META_PIXEL_ID`, `META_CONVERSIONS_API_TOKEN`
- Persist `metaEventFired` on submission record

---

## Phase 10 — Admin / QA / Manual Review Dashboard
- Admin-only route: view all submissions
- Filter by status, date, `manualReviewRequired`, `crmSyncStatus`
- Manually approve / reject / retry PDF for flagged submissions
- Trigger GHL re-sync for failed or manual-review submissions
- Trigger retry for failed PDFMonkey jobs

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
