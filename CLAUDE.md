# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project
FoodServiceIQ Food Cost Analyzer.

## Documentation Hierarchy
Each entry takes precedence over the one above it when there is a conflict:

1. `docs/FSIQ_SOP_v3.3.md` — editable Markdown SOP, primary development reference
2. `docs/FSIQ_SOP_v3.3.pdf` — archive/internal reference only
3. Focused project specs override the SOP for approved product changes:
   - `docs/savings-formula.md` — savings math source of truth
   - `docs/website-validation-spec.md` — validation source of truth
   - `docs/analyzer-ux-flow.md` — analyzer field order and UX source of truth (overrides SOP field order)
   - `docs/build-phases.md` — implementation order source of truth
   - `docs/architecture.md` — app architecture source of truth

**Override examples:**
- SOP says `finalPct` 5.0%–8.0% → `docs/savings-formula.md` says 4.0%–8.0% → **savings-formula.md wins**
- SOP references Zapier → `docs/architecture.md` says app backend owns the workflow → **architecture.md wins**

## Stack
- Next.js App Router, TypeScript, Tailwind, Prisma + PostgreSQL
- Anthropic SDK (`claude-sonnet-4-6`), PDFMonkey (direct API), Microsoft Outlook

## Directory Layout
```
src/app/          # Routes and pages
src/actions/      # Server actions
src/components/   # UI
src/lib/
  qualification/  # savings-formula.ts, spend-parser.ts, qualify-lead.ts
  website/        # normalize-url.ts, check-website.ts, extract-signals.ts
  relevance/      # classify-restaurant.ts, google-places.ts, location-eligibility.ts, claude-classifier.ts
  pdf/            # pdfmonkey.ts, build-pdf-payload.ts
  ai/             # aiResearcher.ts, aiNarrative.ts
  email/
    send-email.ts
    templates/         # qualified, qualified-conservative, dq-* variants
prisma/           # schema + migrations
docs/             # SOP and project docs
.claude/          # Hooks and settings
```

## Commands
> Add once scaffolded in Phase 0.
```bash
pnpm dev
pnpm tsc --noEmit
pnpm lint
pnpm test
pnpm test <path>          # single file
pnpm prisma migrate dev
```

## Core Rules (spec: `docs/website-validation-spec.md`)
- **U.S. restaurants only in v1.** ZIP accepts U.S. 5-digit and ZIP+4 only. Non-U.S. postal codes rejected with a friendly message.
- Only HTTP 404 or DNS NXDOMAIN = `invalid_website`. 403/503/0/timeout/Cloudflare = `plausible_unverified`, never auto-DQ.
- DQ priority: `national_chain` → `invalid_website` → `below_threshold`
- Validation decisions: `verified_restaurant` | `plausible_unverified` | `clear_non_fit` | `national_chain` | `invalid_website`
- `countryEligibility === "non_us"` → `finalDecision: "clear_non_fit"` + `internalFlag: non_us_ineligible`. No PDF. Polite ineligible message only.
- Validator runs 3× — on field blur, on form submit, and as pre-PDF gate.
- **Full personalized PDF:** `verified_restaurant` + `countryEligibility` is `us_verified` or `likely_us` + not chain + spend qualifies.
- **Conservative PDF:** `plausible_unverified` + `countryEligibility` is `likely_us` or `unknown` + spend qualifies.
- **No PDF:** `clear_non_fit` (any reason), `national_chain`, `invalid_website`, `below_threshold`.
- Claude logo URLs must be verbatim from `websiteLogoHints` — never fabricated.
- No em-dashes or en-dashes in AI narrative output.

## Savings Calculation Guardrail
Source of truth: `docs/savings-formula.md`. Approved `finalPct` range: **4.0%–8.0%**. Do not change formula logic without explicit approval and updated tests.

- `dollarEstimate` = `round(finalPct / 100 × bucketMidpoint)`. No other formula.
- 5-year projections: 3.9% USDA cumulative inflation annually. Do not change without approval.

## AI Pipeline
The AI pipeline is Claude-generated content only:
- **AI Researcher** (`src/lib/ai/aiResearcher.ts`): logo URL from `websiteLogoHints`, `businessSummary`, `conceptSignals`
- **AI Narrative Builder** (`src/lib/ai/aiNarrative.ts`): `narrative_distributor`, `narrative_procurement`, `narrative_sku`

AI does **not** include: savings math, spend bucket selection, DQ decisions, case study selection, PDF generation, or email delivery.

**AI must never determine** `finalPct`, `spendBucket`, `dollarEstimate`, `caseStudy`, or DQ status.

## Integration Rules
- **No Zapier.** The app backend calls PDFMonkey directly via `PDFMONKEY_API_KEY` and `PDFMONKEY_TEMPLATE_ID`.
- PDF generation is its own phase — calls PDFMonkey, persists `pdfStatus`, `pdfMonkeyDocumentId`, `downloadUrl`, and retry state independently from the AI pipeline.

## Claude Code Workflow
1. **Inspect** — read relevant spec and existing code first
2. **Propose** — write a plan, wait for approval before any code
3. **Implement** — build one phase at a time
4. **Check** — `pnpm tsc --noEmit && pnpm lint && pnpm test`
5. **Ship** — `/commit-push-pr` after each approved phase

## Customization
**Subagents** — use `Explore` for broad search, `Plan` before any multi-file phase.

**Skills** — `/review` before merge, `/security-review` before any phase that handles user input or external HTTP, `/simplify` after a phase ships.

**Hooks** — configure in `.claude/settings.json` → `hooks`. Recommended: run `pnpm tsc --noEmit` on `PostToolUse` after Edit/Write.

## Env Vars
See `.env.example` for all placeholders. Key vars:
```
DATABASE_URL
ANTHROPIC_API_KEY
PDFMONKEY_API_KEY, PDFMONKEY_TEMPLATE_ID
OUTLOOK_CLIENT_ID, OUTLOOK_CLIENT_SECRET, OUTLOOK_TENANT_ID
GOOGLE_PLACES_API_KEY
CALENDLY_URL
FSIQ_LOGO_DARK_URL, FSIQ_LOGO_LIGHT_URL, FSIQ_IQ_LOGO_URL
META_PIXEL_ID, META_CONVERSIONS_API_TOKEN
GHL_API_KEY, GHL_LOCATION_ID, GHL_PIPELINE_ID
```
