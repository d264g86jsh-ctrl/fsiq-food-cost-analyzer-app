# Architecture — FSIQ Food Cost Analyzer

SOP reference: `docs/FSIQ_SOP_v3.3.md` (primary) / `docs/FSIQ_SOP_v3.3.pdf` (archive)

---

## Request Flow

```
Form submit
  → Website validation (real-time on blur + server-side on submit)
  → Qualification engine (DQ priority: national_chain → invalid_website → below_threshold)
      → Disqualified: one of 3–4 DQ emails (no PDF); manual_review: no email
      → Qualified ($500K+):
          → Determine PDF mode:
              verified_restaurant + us_verified/likely_us → full personalized PDF
              plausible_unverified + likely_us/unknown    → conservative profile-based PDF
              clear_non_fit (any reason, incl. non_us)    → no PDF
          → [If PDF eligible]:
              → Website crawl (logo hints + text)
              → Claude: AI Researcher (logo URL + business summary)  ← AI pipeline start
              → 1s delay
              → Claude: AI Narrative Builder (3 blocks, no em/en-dashes)
              → Strip dashes (safety net)                             ← AI pipeline end
              → PDFMonkey: generate 6-page PDF (app backend, direct API — no Zapier)
              → Persist pdfStatus, pdfDownloadUrl, pdfRetryCount
          → Outlook: email with PDF link (if PDF) + Calendly CTA
          → Meta Conversions API: server-side event (qualified leads)
      → GHL CRM sync (async, non-blocking) — ALL submissions, tagged by outcome
```

**AI pipeline = Claude Researcher + Claude Narrative Builder only.**  
Savings math, PDF generation, email, Meta, and CRM are separate pipeline steps.

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
      google-places.ts               # Google Places Text Search + Place Details
      location-eligibility.ts        # ZIP validation, countryEligibility
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
      build-pdf-payload.ts           # Assemble 26-variable payload
      pdfmonkey.ts                   # Direct PDFMonkey API call (no Zapier)
    email/
      send-email.ts                  # dispatch
      templates/                     # qualified, qualified-conservative, dq-* variants
prisma/
  schema.prisma
docs/
.claude/
  settings.json
```

---

## U.S.-Only Eligibility

The analyzer is for U.S.-based restaurants only in v1. `zip_code` accepts U.S. 5-digit ZIP and ZIP+4. Non-U.S. postal formats are rejected at the form level with a friendly message. `countryEligibility` must be `us_verified` or `likely_us` for a full personalized PDF. See `docs/website-validation-spec.md` for full decision rules.

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

| Bucket | Midpoint | Base % |
|---|---|---|
| $500K–$800K | $650K | 5.00% |
| $800K–$1M | $900K | 5.25% |
| $1M–$3M | $2M | 5.50% |
| $3M–$7M | $5M | 5.75% |
| $7M+ | $8.5M | 6.00% |

### Modifiers (additive)
- Distributor: national broadliner +0.70%, combo/regional +0.35%
- Procurement: market price single +0.70%, market price multi +0.35%, GPO +0.20%
- SKU mix: protein + commodity +0.30%, either alone +0.15%
- Locations: 5+ +0.30%, 2–4 +0.15%

### Guardrail Rules (non-negotiable)
- `finalPct` = `max(4.0, min(8.0, basePct + modifiers))` — **clamped to 4.0%–8.0%** (approved product decision; overrides SOP's prior 5.0% floor).
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

## Emails (SOP §12, §21)

| Condition | Email |
|---|---|
| Qualified | PDF link + Calendly CTA |
| `invalid_website` | "Quick check on your submission" |
| `below_threshold` | "Thanks for using…" |
| `national_chain` | "About your submission" |
| `manual_review` | No email (manual follow-up) |

---

## Form Fields

UX flow spec: `docs/analyzer-ux-flow.md` (overrides SOP field order — contact fields collected last).  
Field definitions and dropdown values: `docs/FSIQ_SOP_v3.3.md` §5.

**Step 1 — Qualification fields (shown first):**

| Field name | Required | Input type |
|---|---|---|
| `restaurant_name` | Yes | Text |
| `website` | Yes | Text + real-time validation |
| `zip_code` | Yes | Text (U.S. ZIP/ZIP+4 only) |
| `concept_type` | Yes | Dropdown |
| `locations` | Yes | Dropdown |
| `annual_food_spend` | Yes | Dropdown |
| `distributor_type` | Yes | Dropdown |
| `procurement_strategy` | Yes | Dropdown |
| `top_skus` | Yes | Free text — label: "What are your biggest food spend categories or key items?" Parsed for protein/commodity keywords by qualification engine. |

**Step 2 — Contact fields (shown last):**

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
- **Traffic attribution** — `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm`, `ipAddress` (Meta CAPI matching + campaign ROAS)
- **Validation** — `finalDecision`, `countryEligibility`, `locationConfidenceScore`, `internalFlags` (JSON), `websiteValidationResult` (JSON)
- **Qualification** — `qualified`, `dqReason`, `spendBucket`, `bucketMidpoint`, `finalPct`, `dollarEstimate`, `caseStudy`, `year1`–`year5`, `projectionHeights`
- **AI** — `logoUrl`, `businessSummary`, `conceptSignals`, `narrativeDistributor`, `narrativeProcurement`, `narrativeSku`
- **PDF** — `pdfMode`, `pdfStatus`, `pdfMonkeyDocumentId`, `pdfDownloadUrl`, `pdfError`, `pdfRetryCount`
- **Email** — `emailStatus`, `emailVariant`, `emailSentAt`, `emailError`, `emailRetryCount`
- **Meta** — `metaStatus`, `metaEventIds`, `metaError`
- **GHL** — `crmSyncStatus`, `ghlContactId`, `crmTags` (JSON), `crmSyncError`, `crmSyncRetryCount`
- **Manual review** — `manualReviewRequired`, `manualReviewStatus`, `manualReviewNotes`, `manualReviewedAt`
- **Workflow** — `workflowStage`, `workflowStatus`, `workflowErrors` (JSON)
- **Timestamps** — `createdAt`, `updatedAt`

Enums: `FinalDecision`, `CountryEligibility`, `DqReason`, `PdfMode`, `PdfStatus`, `EmailStatus`, `CrmSyncStatus`, `WorkflowStatus`, `ManualReviewStatus`

## CRM

GoHighLevel (GHL). **Every form submission syncs to GHL** — no exclusions. Tags are used to segment quality and outcome (e.g. `FSIQ Analyzer Submitted`, `DQ Below Threshold`, `Full PDF Sent`, `Non US Ineligible`, `Possible Spam Submission`). See `docs/build-phases.md` §Phase 10 for the full tag list.

App database is the source of truth. GHL is the sync destination.

Implementation: `src/lib/crm/ghl.ts`  
Env vars: `GHL_API_KEY`, `GHL_LOCATION_ID`, `GHL_PIPELINE_ID`  
Persists: `crmSyncStatus`, `crmSyncError`, `crmContactId`
