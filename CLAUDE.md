# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with this repository.

## Project
FoodServiceIQ Food Cost Analyzer — Next.js App Router, TypeScript, Tailwind, Prisma + PostgreSQL.
CRM and email delivery via GHL/Zapier. PDFMonkey for PDF generation (direct API). Vercel (sfo1 region).

## Documentation Hierarchy
Each entry takes precedence over the one above it when there is a conflict:

1. `docs/FSIQ_SOP_v3.3.md` — editable Markdown SOP, primary development reference
2. Focused project specs override the SOP for approved product changes:
   - `docs/savings-formula.md` — savings math source of truth
   - `docs/website-validation-spec.md` — validation source of truth
   - `docs/analyzer-ux-flow.md` — analyzer field order and UX source of truth
   - `docs/architecture.md` — app architecture source of truth
   - `docs/brand-guidelines.md` — branding, colors, typography, component styling source of truth
   - `docs/hard-rules.md` — non-negotiable constraints derived from production incidents

## Directory Layout
```
src/app/          # Routes and pages
src/actions/      # Server actions (submitAnalysis.ts is the main pipeline)
src/components/   # UI
src/lib/
  qualification/  # savings-formula.ts, spend-parser.ts, qualify-lead.ts
  website/        # normalize-url.ts, check-website.ts, extract-signals.ts, logo-extractor.ts
  relevance/      # classify-restaurant.ts, location-eligibility.ts, claude-classifier.ts
  pdf/            # pdfmonkey.ts, build-pdf-payload.ts, logo-processor.ts
  ai/             # ai-researcher.ts, ai-narrative.ts, prompts.ts
  meta/           # meta-events.ts, meta-capi.ts, tracking-params.ts, browser-events.ts
  crm/            # ghl.ts, build-ghl-payload.ts, lead-status.ts
  email/          # send-email.ts (delivery owned by GHL; this lib is reserved)
  db.ts           # Prisma singleton with normaliseDatabaseUrl()
prisma/           # schema + migrations
docs/             # SOP and project docs
e2e/              # Playwright regression tests (select-persistence.spec.ts)
.claude/          # Hooks and settings
```

## Commands
```bash
pnpm dev                    # dev server
pnpm build                  # production build — run before any native-binary dep changes
pnpm tsc --noEmit           # type-check
pnpm lint                   # ESLint
pnpm test                   # Vitest unit suite
pnpm test <path>            # single test file
pnpm test:e2e               # Playwright e2e suite (select-persistence, 5 tests, ~5 min)
pnpm prisma migrate dev     # run migrations (needs DIRECT_URL env var)
pnpm prisma generate        # regenerate Prisma client after schema changes
```

## ── STANDING OPERATING RULES ────────────────────────────────────────────────

### Production Safety (non-negotiable)
- **Never mutate a production resource without explicit approval in the conversation.**
  Covered resources: prod DB (schema or data — no `db execute`, `migrate deploy`, or raw SQL against prod), the live PDFMonkey template (no PUT/PATCH), Vercel env vars, GHL templates/workflows.
- **Migrations: generate and report the diff; do not apply to any DB until approved.**
  "Preview/verification" tasks do not authorize touching prod.
- **Never run `vercel env pull`** — it overwrites `.env.local` Sensitive vars. Use `vercel env ls` to inspect.
- **Incidents authorize reverts only, not new changes.**
- **The PDFMonkey template is a shared singleton** — it serves both preview and production deployments. Any PUT/PATCH to the template takes effect immediately in production. Treat all template edits as production changes.

### Push / Merge Gate
**Never push or merge to main without explicit approval in the conversation.**
- Deploy previews with `vercel deploy` (no `--prod`) for human visual review first.
- Production push is approved per-commit-range only — not a blanket standing approval.
- Use feature branches; fast-forward merge to main only after approval.

### Database Connection
- `DATABASE_URL` → **pooler URL (port 6543)** — used at runtime by the app and Prisma ORM.
- `DIRECT_URL` → **direct URL (port 5432)** — used by `prisma migrate` only; unreachable from Vercel Lambda.
- `normaliseDatabaseUrl()` in `src/lib/db.ts` unconditionally appends `pgbouncer=true&connection_limit=1` to `DATABASE_URL`. Never strip these params. Credential rotations must preserve them.

### Migrations
- Always use `prisma migrate dev` (not raw `db execute`) for schema changes in dev so migration files are generated and tracked.
- For SQL applied outside Prisma: create the migration file manually, then `prisma migrate resolve --applied <name>`. `applied_steps_count=0` in `_prisma_migrations` is correct for manually-resolved migrations.
- Known state: `20260521_add_idempotency_and_observability_fields` was applied to prod before its local file existed — now reconciled.

### Native Binary Dependencies
When adding a package that ships `.node` native binaries (e.g. sharp, canvas):
1. Add to `dependencies` (not `devDependencies`) if needed at runtime.
2. Add the package name to `serverExternalPackages` in `next.config.ts`.
3. Add `/* webpackIgnore: true */` to any dynamic `import()` of that package in server code.
4. Run `pnpm build` and confirm the dev server returns HTTP 200 before writing logic.

`playwright` and `playwright-core` are already handled. `pngjs` (used in `logo-processor.ts`) is pure JS — no special treatment needed.

### PDFMonkey Template
The PDF template lives **remotely** in PDFMonkey. The app patches it at runtime via `ensureTemplateSafe()` in `src/lib/pdf/pdfmonkey.ts`:
- Bump `PATCH_VERSION` (e.g. `v9-...`) whenever `patchPdfMonkeyTemplateHtml` changes so warm instances re-fetch and re-apply. Current version: `v8-conditional-logo-box`.
- Template patches are idempotent — each has a marker constant checked for presence before re-applying.
- See the Production Safety rule above: template edits affect production immediately.

### Logo Pipeline (Phase 1 — transparent logos only)
- `src/lib/pdf/logo-processor.ts`: detects transparency from PNG header bytes; white-recolors via pngjs; applies blob-guard (coverage > 55% OR coverage > 40% + bboxFill > 75% → reject → white-box fallback).
- Processing runs once in **step 7.5** of the `waitUntil` background chain (after AI research, before PDF gen). Result cached in `DB.logoProcessedDataUri` (TEXT). PDF gen reads the column — no reprocessing on retries.
- `logoProcessed: true` in PDF payload → template uses `.cover-operator-logo--processed` (logo direct on gradient, no white box). `false`/absent → white-box fallback.
- Phase 2 (remove.bg for opaque logos) is **not yet built**. Opaque logos get white-box fallback.
- Step 7.5 uses `determinePdfMode()` to decide mode — same function as step 9. Conservative and skip modes skip logo processing.

### Test Baseline
- **Vitest:** run `pnpm test` before any PR; do not let the passing count drop. Run `pnpm test <path>` to target a single file.
- **Playwright e2e:** `pnpm test:e2e` — select-persistence regression suite. Run before merging UI form changes.
- Vitest excludes `e2e/` via `vitest.config.ts`; Playwright targets `e2e/` via `playwright.config.ts`. They don't interfere.

## Core Rules (spec: `docs/website-validation-spec.md`)
- **U.S. restaurants only in v1.** `us_business_confirmed` checkbox required.
- Only HTTP 404 or DNS NXDOMAIN = `invalid_website`. 403/503/timeout/Cloudflare = `plausible_unverified`, never auto-DQ.
- DQ priority: `national_chain` → `invalid_website` → `below_threshold`
- `countryEligibility === "non_us"` → `finalDecision: "clear_non_fit"`. No PDF.
- Full PDF: `verified_restaurant` + `us_verified`/`likely_us` + spend qualifies.
- Conservative PDF: `plausible_unverified` + `likely_us`/`unknown` + spend qualifies.
- No PDF: `clear_non_fit`, `national_chain`, `invalid_website`, `below_threshold`.

## Savings Calculation Guardrail
Source of truth: `docs/savings-formula.md`. Approved `finalPct` range: **4.0%–6.95%**. Do not change without explicit approval and updated tests.
- `dollarEstimate` = `round(finalPct / 100 × bucketMidpoint)`. No other formula.
- 5-year projections: **3.9% USDA** food-away-from-home inflation annually. Do not change without approval.

## AI Pipeline
- **AI Researcher** (`src/lib/ai/ai-researcher.ts`): produces `logoUrl`, `businessSummary`, `conceptSignals`. Applies `sanitizeEmDashes()` to `businessSummary` before storing. `logoUrl` must be verbatim from `websiteLogoHints` — never fabricated.
- **AI Narrative Builder** (`src/lib/ai/ai-narrative.ts`): produces `narrativeDistributor`, `narrativeProcurement`, `narrativeSku`. Applies `stripDashes()` to all three fields on every code path (live AI response and fallback).
- AI does **not** determine: `finalPct`, `spendBucket`, `dollarEstimate`, `caseStudy`, DQ decisions.

## Hard Rules (full detail in `docs/hard-rules.md`)
- **PDF delivery is web-view only** — never `Content-Disposition: attachment`. Always proxy through `/api/report/[id]`.
- **No `sandbox` on the report iframe** — triggers Chrome's "This page has been blocked" error.
- **No `Content-Security-Policy: sandbox`** on the proxy route.
- **Calendly CTAs** in PDFs: `target="_blank"` set at the PDFMonkey template level via `ensureCtaTargetBlank()`.

## Integration Rules
- **No Zapier** — app backend calls PDFMonkey directly via `PDFMONKEY_API_KEY` / `PDFMONKEY_TEMPLATE_ID`.
- **GHL/Zapier owns customer-facing emails** — app pushes `fsiq_communication_route` + `fsiq_pdf_url` to GHL; email HTML lives in GHL's template editor, not in this repo.
- **Meta CAPI** — `buildLeadEvent` + `buildQualifiedLeadEvent` in `src/lib/meta/meta-events.ts`. QualifiedLead `event_id` is prefixed `ql-` to prevent deduplication against the Lead event.

## Env Vars
See `docs/environment.md` for full reference. Key vars:
```
DATABASE_URL          # pooler (port 6543) — runtime
DIRECT_URL            # direct (port 5432) — migrations only; never used at runtime
ANTHROPIC_API_KEY
PDFMONKEY_API_KEY, PDFMONKEY_TEMPLATE_ID
BROWSERLESS_API_KEY   # production headless fetch (website validation)
REMOVEBG_API_KEY      # remove.bg (Phase 2 logo processing — not yet wired in prod)
SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY   # PDF cache storage
META_PIXEL_ID, META_CONVERSIONS_API_TOKEN
GHL_API_KEY, GHL_LOCATION_ID, GHL_PIPELINE_ID
CALENDLY_URL
FSIQ_LOGO_DARK_URL, FSIQ_LOGO_LIGHT_URL, FSIQ_IQ_LOGO_URL
```
