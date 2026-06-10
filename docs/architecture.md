# Architecture — FSIQ Food Cost Analyzer

**Related:** `docs/database-schema.md` · `docs/ghl-email-handoff.md` · `docs/meta-tracking.md` · `docs/savings-formula.md`  
SOP reference: `docs/FSIQ_SOP_v3.3.md` (archive baseline) / focused specs below override it

---

## Request Flow

```
Form submit
  → DB save
  → Website validation (real-time on blur + server-side on submit)
  → Qualification engine (DQ priority: national_chain → invalid_website → below_threshold)
      → DQ path:
          → Assign fsiq_lead_status (disqualified_*) + fsiq_communication_route (send_dq_*)
          → Final GHL handoff — DQ tags applied, no PDF URL required
      → Manual review path:
          → Assign fsiq_communication_route = manual_review_hold
          → Final GHL handoff — FSIQ Manual Review tag, no PDF-ready tag, no email fires
      → Qualified ($600K+):
          → Determine PDF mode:
              verified_restaurant + us_verified/likely_us → full personalized PDF
              plausible_unverified + likely_us/unknown    → conservative profile-based PDF
              clear_non_fit (any reason, incl. non_us)    → no PDF (DQ path above)
          → [If PDF eligible]:
              → Website crawl (logo hints + text)
              → Claude: AI Researcher (logo URL + business summary)  ← AI pipeline start
              → 1s delay
              → Claude: AI Narrative Builder (3 blocks, no em/en-dashes)
              → Strip dashes (safety net)                             ← AI pipeline end
              → PDFMonkey: generate 6-page PDF (app backend, direct API — no Zapier)
              → Confirm pdfDownloadUrl is non-null and usable
              → Assign fsiq_lead_status (qualified_*_pdf_ready) + PDF-ready tags
              → Final GHL handoff — PDF URL included
          → Meta Conversions API: server-side Lead event (ALL routes — DQ + qualified) + QualifiedLead event (qualified only)
```

**The app is the workflow brain. GHL/Zapier owns customer-facing emails.**
The app never sends email directly. It outputs a complete lead record (PDF URL + lead
status + communication route + CRM fields/tags) to GHL after all processing is done.
GHL/Zapier sends emails based on `fsiq_communication_route` and the applied tags.

**PDF-ready tags are sent only after `pdfDownloadUrl` is confirmed. Never before.**

See `docs/ghl-email-handoff.md` for the full handoff contract.

**AI pipeline = Claude Researcher + Claude Narrative Builder only.**  
Savings math, PDF generation, Meta, and GHL sync are separate pipeline steps.

---

## Directory Layout

```
src/
  app/
    page.tsx                           # Form page
    api/validate-website/route.ts      # Real-time validation endpoint
    admin/                             # Admin / manual review dashboard
  actions/
    submitAnalysis.ts                  # Full pipeline orchestration
    validateWebsite.ts                 # Server action wrapper
  components/
    AnalyzerForm.tsx
    analyzer/WebsiteValidationStatus.tsx
  lib/
    website/
      normalize-url.ts
      check-website.ts
      extract-signals.ts
      reachability.ts
      headless-fetch.ts              # Playwright fallback
    relevance/
      classify-restaurant.ts
      website-relationship.ts
      google-places.ts               # Google Places — FILE EXISTS but not called; hardcoded to score=0 since Places removed
      location-eligibility.ts        # countryEligibility (always us_verified via checkbox; ZIP/Places logic inactive)
      claude-classifier.ts           # AI tiebreaker (ambiguous only)
    qualification/
      national-chains.ts
      savings-formula.ts
      spend-parser.ts
      qualify-lead.ts
    ai/
      ai-types.ts                    # Shared Phase 5 types (AiResearchInput, AiResearchResult, AiNarrativeResult)
      ai-client.ts                   # Anthropic SDK singleton wrapper (server-only)
      research-input.ts              # buildResearchInput() — shapes form+validation+qualification for AI
      prompts.ts                     # Prompt builders for researcher and narrative
      ai-researcher.ts               # runAiResearch() — logo URL + business summary
      ai-narrative.ts                # generateAiNarrative() — 3 narrative blocks
      fallback-narrative.ts          # Deterministic fallback when AI is unavailable
    pdf/
      pdf-types.ts                   # PdfPayload, GeneratePdfInput, GeneratePdfResult
      pdf-mode.ts                    # determinePdfMode() — full / conservative / skip
      build-pdf-payload.ts           # Assemble 27-variable payload (26 SOP vars + reportDate)
      pdfmonkey.ts                   # Direct PDFMonkey API call (no Zapier)
    crm/
      lead-status.ts                 # LeadStatus + CommunicationRoute constants/types
      ghl-tags.ts                    # GHL tag constants
      ghl-types.ts                   # GhlHandoffPayload type
      ghl.ts                         # GHL API sync (Phase 8)
prisma/
  schema.prisma
docs/
.claude/
  settings.json
```

---

## U.S.-Only Eligibility

The analyzer is for U.S.-based restaurants only in v1. A `us_business_confirmed` checkbox on Step 1 is the country gate — the user must explicitly confirm their restaurant is U.S.-based. No ZIP or postal code is collected. `countryEligibility` always returns `us_verified` (hardcoded since the checkbox guarantees attestation). `countryEligibility` must be `us_verified` or `likely_us` for a full personalized PDF. See `docs/website-validation-spec.md` for full decision rules.

## Website Validation (Main Guardrail)

Runs three times: real-time (on field blur), on form submit, and as pre-PDF gate. Full spec: `docs/website-validation-spec.md`.

Key response fields:

```ts
finalDecision: "verified_restaurant" | "plausible_unverified" | "clear_non_fit" | "national_chain" | "invalid_website"
countryEligibility: "us_verified" | "likely_us" | "non_us" | "unknown"
locationConfidenceScore: number   // 0–100
locationReasons: string[]
internalFlags: string[]           // e.g. "us_zip_valid", "google_place_non_us", "non_us_postal_code"
```

**Status rules:** Only 404 or DNS NXDOMAIN = `invalid_website`. 403/503/0/timeout/Cloudflare = `plausible_unverified`. `countryEligibility: "non_us"` → `finalDecision: "clear_non_fit"` + `internalFlag: non_us_ineligible`; no PDF.

---

## Qualification & Scoring

Source of truth: `docs/savings-formula.md`. Implemented in `src/lib/qualification/savings-formula.ts`, `src/lib/qualification/spend-parser.ts`, `src/lib/qualification/qualify-lead.ts`.

### Spend Buckets & Midpoints

| Bucket | Midpoint | Base % | Max % |
|---|---|---|---|
| $600K–$800K | $700K | 2.00% | 4.00% |
| $800K–$1M | $900K | 3.60% | 5.60% |
| $1M–$3M | $2M | 4.95% | 6.95% |
| $3M–$7M | $5M | 3.15% | 5.15% |
| $7M+ | $8.5M | 3.66% | 5.66% |

### Modifiers (additive)
- Distributor: national broadliner +0.70%, combo/regional +0.35%
- Procurement: market price single +0.70%, market price multi +0.35%, negotiated_cost_plus +0.00% (GPO +0.20% for legacy DB records — no longer a form option)
- SKU mix: protein + commodity +0.30%, either alone +0.15%
- Locations: 5+ +0.30%, 2–4 +0.15%

### Guardrail Rules (non-negotiable)
- `finalPct` = `max(4.0, min(6.95, min(bucketMax, basePct + modifiers)))` — bucket-level ceiling first, then global 4.0%–6.95% clamp (approved product decision).
- `dollarEstimate` = `round(finalPct / 100 × bucketMidpoint)`. No other formula.
- 5-year projections: cumulative, 3.9% USDA inflation annually.
- **AI (Claude) generates narrative text only.** AI must never determine `finalPct`, `spendBucket`, `dollarEstimate`, `caseStudy`, DQ status, or any qualifying decision.

---

## AI Calls (SOP §14, §17)

The AI pipeline is Claude-generated research and narrative content **only**. It does not compute savings math, make DQ decisions, or call PDFMonkey.

| Step | Model | Max tokens | Output |
|---|---|---|---|
| AI Researcher | `claude-sonnet-4-6` | 1000 | `logo_url`, `business_summary`, `concept_signals`, `scrape_status` |
| AI Narrative Builder | `claude-sonnet-4-6` | 1000 | `narrative_distributor`, `narrative_procurement`, `narrative_sku` |

Logo URL must be verbatim from `websiteLogoHints` — never fabricated. 1s delay between calls.

**Narrative Angle System:** Before the AI Narrative Builder is called, a deterministic angle is
selected from the submission's form inputs (`procurementStrategy`, `distributorType`, `conceptType`,
`locations`). The angle shapes tone, emphasis, and avoidances for each narrative section.
Active angles: `captive_buyer`, `fragmented_buyer`, `optimized_buyer`, `premium_independent`,
`multi_unit_operator` (modifier). Selection is in `src/lib/ai/angle-selector.ts`.
See `docs/ai-narrative.md` for full angle definitions.

---

## PDF (SOP §19, §22)

- 6 pages via PDFMonkey HTML/CSS + Liquid template
- 26 dynamic variables injected at generation time
- **App backend calls PDFMonkey directly — no Zapier**
- Full personalized PDF: `verified_restaurant` + `us_verified`/`likely_us` + qualified
- Conservative profile-based PDF: `plausible_unverified` + `likely_us`/`unknown` + qualified (no website-specific claims)
- No PDF: `clear_non_fit` (any reason, including `non_us`), `national_chain`, `invalid_website`, `below_threshold`
- Client logo from validated URL; falls back to IQ icon via `onerror`
- Case study assigned by spend bucket × locations (4 studies: Black's BBQ, MaryAnn's Diner, Spirits/The Oasis/Dish Society/Thunderdome)
- Persists: `pdfStatus`, `pdfMonkeyDocumentId`, `pdfDownloadUrl`, `pdfError`, `pdfRetryCount`

---

## GHL / Zapier Email Routing

The app does not send customer-facing email in v1. The app outputs a final lead record
to GHL after processing. GHL/Zapier sends emails based on `fsiq_communication_route` and
the applied tags. Email copy, subject lines, and funnel automation are owned by GHL/Zapier
and can be updated without code changes.

Full contract: `docs/ghl-email-handoff.md`

| `fsiq_communication_route` | GHL/Zapier action | PDF URL required |
|---|---|---|
| `send_full_report` | Full report email + Calendly CTA | Yes |
| `send_conservative_report` | Conservative report email + Calendly CTA | Yes |
| `send_dq_invalid_website` | "Quick check" DQ email | No |
| `send_dq_below_threshold` | "Below threshold" DQ email | No |
| `send_dq_national_chain` | "National chain" DQ email | No |
| `send_dq_clear_non_fit` | Polite ineligible message | No |
| `send_dq_non_us` | Polite non-US message | No |
| `manual_review_hold` | No email — human reviews first | No |
| `pdf_failure_hold` | No email — PDF retry required | No |
| `no_email_hold` | No email — test/internal/spam | No |

---

## Form Fields

UX flow spec: `docs/analyzer-ux-flow.md` (overrides SOP field order — contact fields collected last).  
Field definitions and dropdown values: `docs/FSIQ_SOP_v3.3.md` §5.

**Step 1 — Business qualification (shown first):**

| Field name | Required | Input type |
|---|---|---|
| `restaurant_name` | Yes | Text |
| `website` | Yes | Text + real-time validation |
| `us_business_confirmed` | Yes | Checkbox — U.S. attestation; required before submit |

**Step 2 — Profile:**

| Field name | Required | Input type |
|---|---|---|
| `concept_type` | Yes | Dropdown |
| `locations` | Yes | Dropdown |
| `annual_food_spend` | Yes | Dropdown |

**Step 3 — Purchasing profile:**

| Field name | Required | Input type |
|---|---|---|
| `distributor_type` | Yes | Dropdown |
| `procurement_strategy` | Yes | Dropdown |
| `top_skus` | Yes | Free text — parsed for protein/commodity keywords by qualification engine |

**Step 4 — Contact info ("Where do we send your report?"):**

| Field name | Required | Input type |
|---|---|---|
| `full_name` | Yes | Text |
| `email` | Yes | Email |
| `phone` | No | Tel |

---

## Database (Prisma)

Single `Submission` model in `prisma/schema.prisma`. Source of truth for all submission data.

Key field groups:
- **Form inputs** — all 12 fields including `zipCode`, `topSkus` (free text)
- **Traffic attribution** — `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm`, `utmId`, `fbclid`, `fbadid`, `leadSource` (derived), `fbp`, `fbc`, `landingPageUrl`, `referrer`, `ipAddress` — see `docs/meta-tracking.md` for the full attribution flow
- **Validation** — `finalDecision`, `countryEligibility`, `locationConfidenceScore`, `internalFlags` (JSON), `websiteValidationResult` (JSON)
- **Qualification** — `qualified`, `dqReason`, `spendBucket`, `bucketMidpoint`, `finalPct`, `dollarEstimate`, `caseStudy`, `year1`–`year5`, `projectionHeights`
- **AI** — `logoUrl`, `businessSummary`, `conceptSignals`, `narrativeDistributor`, `narrativeProcurement`, `narrativeSku`
- **PDF** — `pdfMode`, `pdfStatus`, `pdfMonkeyDocumentId`, `pdfDownloadUrl`, `pdfError`, `pdfRetryCount`
- **Email** — `emailStatus`, `emailVariant`, `emailSentAt`, `emailError`, `emailRetryCount` *(reserved — email delivery is GHL/Zapier-owned in v1; these fields may be repurposed or deprecated in a future phase)*
- **Meta** — `metaStatus`, `metaEventIds`, `metaError`
- **GHL** — `crmSyncStatus`, `ghlContactId`, `crmTags` (JSON), `crmSyncError`, `crmSyncRetryCount`
- **Manual review** — `manualReviewRequired`, `manualReviewStatus`, `manualReviewNotes`, `manualReviewedAt`
- **Workflow** — `workflowStage`, `workflowStatus`, `workflowErrors` (JSON)
- **Timestamps** — `createdAt`, `updatedAt`

Enums: `FinalDecision`, `CountryEligibility`, `DqReason`, `PdfMode`, `PdfStatus`, `EmailStatus`, `CrmSyncStatus`, `WorkflowStatus`, `ManualReviewStatus`

## CRM (GoHighLevel)

App database is the source of truth. GHL is the sync destination.

**v1 handoff model:** single final sync after all processing is complete.
- Qualified leads sync only after `pdfDownloadUrl` is confirmed.
- DQ leads sync immediately once DQ route is known.
- Manual review and PDF failure leads sync with hold routes — no email automation fires.

The app assembles `fsiq_lead_status`, `fsiq_communication_route`, all custom fields,
and the tag list before calling the GHL API. GHL/Zapier then sends emails based on
those values. See `docs/ghl-email-handoff.md` for the full contract.

Implementation: `src/lib/crm/ghl.ts` (Phase 8)  
Types/constants: `src/lib/crm/lead-status.ts`, `src/lib/crm/ghl-tags.ts`, `src/lib/crm/ghl-types.ts`  
Env vars: `GHL_ACCESS_TOKEN` (preferred) or `GHL_API_KEY`, `GHL_LOCATION_ID`  
Persists: `crmSyncStatus`, `crmSyncError`, `ghlContactId`, `crmTags`
