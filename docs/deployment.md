# Deployment Guide

**Related:** `docs/environment.md` (full env var reference) · `docs/launch-blockers.md` (pre-launch checklist)  
**Covers:** Vercel setup, environment variables, function timeout budget, headless browser integration, secrets management.

---

## Overview

The app runs on Vercel (Next.js App Router). The core submission pipeline uses `waitUntil` (Vercel Functions) to run AI, PDF, and CRM steps in the background after the HTTP response is sent. This requires **Vercel Pro or higher** (Hobby plan limits background work to 10s; the full pipeline takes 90–150s).

---

## Function Region

**Pinned to `sfo1` (San Francisco)** via `vercel.json` at the repo root.

**Why:** The Supabase database is in AWS `us-west-1` (N. California). A qualified submission makes ~10 sequential Prisma round trips, and Browserless.io's production endpoint (`production-sfo.browserless.io`) is also in San Francisco. Before pinning, functions ran in Vercel's default `iad1` (Washington D.C.) — every DB query crossed the country.

| Hop | Before (`iad1`) | After (`sfo1`) | Saving |
|-----|-----------------|-----------------|--------|
| Vercel → Supabase | ~65–70 ms/query | ~3–8 ms/query | ~60–65 ms/query |
| Vercel → Browserless | ~65 ms | ~2–5 ms | ~60 ms |

**Estimated latency improvement:** 10 DB round trips × ~62 ms = **~620 ms** shaved off a qualified submission's total pipeline. The 4 synchronous calls (before response is sent) save ~250 ms from user-visible latency; the remaining 6 background calls speed up PDF delivery.

**Impact on other services:**

| Service | Endpoint | Impact of move |
|---------|----------|----------------|
| Supabase | AWS us-west-1 (N. California) | ✅ Same region — major improvement |
| Browserless.io | `production-sfo.browserless.io` | ✅ Co-located in SFO — major improvement |
| Anthropic API | Cloudflare CDN (region-agnostic) | Neutral to slightly better for west-coast users |
| PDFMonkey | European-hosted | Negligible — both US regions are equal distance |
| GoHighLevel | US-based, region unknown | Negligible — likely marginal improvement or neutral |
| Meta CAPI | `graph.facebook.com` (Cloudflare CDN) | Negligible — CDN handles routing |

**Reasons this is safe to do:**
- No IP allowlists on Supabase (auth-based access only; PgBouncer pooler is region-agnostic)
- No hardcoded region-sensitive URLs in the codebase
- No GHL or Meta CAPI IP restrictions
- Vercel Pro plan has access to all regions

---

## Prerequisites

| Service | Used for | Plan needed |
|---|---|---|
| Vercel | Hosting, serverless functions | Pro |
| Supabase | PostgreSQL database | Free tier works |
| Anthropic | Claude API (AI Researcher + Narrative) | Pay-as-you-go |
| PDFMonkey | PDF generation | Starter or above |
| GoHighLevel | CRM sync | Any active account |
| Meta | Conversions API (CAPI) | Business account |
| Browserless.io | Headless browser fallback | Free tier for dev; key required for production |

---

## Environment Variables

See `docs/environment.md` for the full reference table. The minimal set to make the app functional:

> **⚠️ Env vars are injected at build time.** Changing a variable in the Vercel dashboard does NOT affect the currently running deployment. The new value is only available after the next deploy (either a push to `main` or a manual Redeploy from the dashboard). **If you rotate a credential, trigger a Redeploy immediately** — production will continue using the old value until then.

**Required for core flow:**
```
DATABASE_URL          Supabase PostgreSQL (use pooler port 6543)
ANTHROPIC_API_KEY     Claude API
PDFMONKEY_API_KEY     PDF generation
PDFMONKEY_TEMPLATE_ID PDF template
GHL_ACCESS_TOKEN      GoHighLevel CRM (preferred over GHL_API_KEY)
GHL_LOCATION_ID       GoHighLevel location
ADMIN_ACCESS_TOKEN    /admin/* route protection (32+ random chars)
```

**Required for tracking:**
```
NEXT_PUBLIC_META_PIXEL_ID   Browser pixel
META_PIXEL_ID               Server-side CAPI (same value)
META_CONVERSIONS_API_TOKEN  CAPI token
```

**Optional (app degrades gracefully without these):**
```
HEADLESS_ENABLED      "true" only with local Chromium (not on Vercel)
BROWSERLESS_API_KEY   Production headless browser (not yet implemented)
META_TEST_EVENT_CODE  Staging only — blank in production
```

---

## Vercel Setup

### 1. Link the project
```bash
vercel link
```

### 2. Set environment variables
Use the Vercel dashboard: **Project → Settings → Environment Variables**.

Set each variable for the correct environments:
- `DATABASE_URL` — Production + Preview (different DBs recommended)
- `ANTHROPIC_API_KEY` — Production + Preview
- `PDFMONKEY_API_KEY`, `PDFMONKEY_TEMPLATE_ID` — Production (use a test template for Preview)
- `GHL_ACCESS_TOKEN`, `GHL_LOCATION_ID` — Production only (or a sandbox account for Preview)
- `META_*` — Production only; set `META_TEST_EVENT_CODE` on Preview
- `ADMIN_ACCESS_TOKEN` — Production + Preview (can use same value)

### 3. Database connection (critical)

Use the **connection pooler** URL from Supabase, not the direct connection.

| Setting | Value | Why |
|---------|-------|-----|
| Port | **6543** (PgBouncer session mode) | Serverless-safe; direct port 5432 is unreachable from Vercel |
| Query params | **`?pgbouncer=true&connection_limit=1`** | See below |

```
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
```

**`?pgbouncer=true` is non-negotiable.** Without it, Prisma uses named prepared statements (`PREPARE s0`). In PgBouncer session mode, prepared statements survive the client disconnect and are registered on the backend connection. When the same backend connection is reassigned to the next serverless invocation, Prisma tries to `PREPARE s0` again → PostgreSQL error `42P05: prepared statement "s0" already exists` → `PrismaClientUnknownRequestError` → every request to that route returns 500 until the session expires.

**`&connection_limit=1`** prevents a single function instance from opening multiple pooler connections and competing with itself.

**Credential rotations MUST preserve these query params.** The 2026-06-11 production incident was caused by a credential rotation that supplied a bare pooler URL without `?pgbouncer=true`. The app's `src/lib/db.ts` normalises the URL at runtime as a safeguard, but the env var itself should always carry both params so the source of truth is unambiguous.

**`DIRECT_URL` is for migrations only, not runtime.** `DIRECT_URL` (port 5432) is used by `prisma migrate` locally but **cannot be reached from Vercel's serverless functions** (Supabase blocks direct connections from external IPs). Never use `DIRECT_URL` as a fallback in application code.

### 4. Run database migrations
```bash
pnpm prisma migrate deploy
```

---

## Function Timeout Budget

The `submitAnalysis` server action runs in two phases:

**Phase 1 — synchronous (before response):**
- DB save: ~50ms
- Website validation (HTTP fetch + signal extraction): 2–40s
- Qualification math: ~5ms
- **Total before client response:** ~5–45s

**Phase 2 — background via `waitUntil` (after response):**
- AI Researcher (Claude API): ~3–8s
- 1-second delay (enforced by orchestrator)
- AI Narrative (Claude API): ~3–8s
- PDF generation (PDFMonkey API): ~10–30s
- GHL sync: ~2–5s
- Meta CAPI: ~1–2s
- DB updates: ~100ms
- **Total background:** ~20–55s

**Vercel plan limits:**
| Plan | Sync max | Background (`waitUntil`) max |
|---|---|---|
| Hobby | 10s | ~10s (not suitable) |
| Pro | 300s | 300s |
| Enterprise | 900s | 900s |

**Headless browser impact:** Each headless render adds ~15–20s to Phase 1 (validation). With Browserless.io, this runs server-side before the response, so it extends the synchronous window. Plan for ~30–60s on timeout-heavy sites.

---

## Headless Browser

### Current state (as of 2026-06-03)
Local Playwright is implemented in `src/lib/website/headless-fetch.ts` and gated on `HEADLESS_ENABLED=true`. This works in dev but **not on Vercel** (no Chromium binary, 50MB function size limit).

Production headless uses **Browserless.io** (not yet implemented — see `scripts/next-architecture-proposal.md`).

### Local dev (Playwright)
```bash
# Install Playwright
pnpm add -D playwright
npx playwright install chromium

# .env.local
HEADLESS_ENABLED=true
```

Playwright fallback fires when:
- `html.length < 500` (thin/empty response)
- `reachabilityStatus === 'blocked'` or `'thin'`
- `hasBotProtection` detected in HTML
- JS framework shell detected

### Production (Browserless.io — pending)
When implemented, `headless-fetch.ts` will use the Browserless WebSocket API instead of local Playwright when `BROWSERLESS_API_KEY` is set:

```
BROWSERLESS_API_KEY=your_key_here
```

Cost: ~$0.001–$0.005 per render on standard plans. Budget for ~200 renders/month initially (~55% of submissions are inaccessible in the current benchmark).

Timeout: 15s per render (matching the current local Playwright `goto` timeout).

---

## Deployment Workflow

```bash
# Preview deploy (runs on every push to main by default)
vercel

# Production deploy
vercel --prod

# Or via GitHub integration (recommended):
# Push to main → Vercel auto-deploys to preview
# Promote via: vercel promote [deployment-url]
```

---

## Secrets Management

- **Never commit** `.env.local` or any file with real API keys
- Use `.env.example` (committed) to document all variables without values
- Rotate keys in Vercel dashboard; old instances drain within their request window
- `ADMIN_ACCESS_TOKEN` should be 32+ random characters — generate with `openssl rand -hex 32`
- For staging: use separate API keys (test PDFMonkey template, sandbox GHL account, `META_TEST_EVENT_CODE`)

---

## Website Validation & Confidence Scoring

As of commit `1a749e7`, the validator includes:

- **Domain keyword detection** — `centurionrestaurantgroup.com` detects "restaurant" in the domain label, boosting confidence without bypassing 404 checks.
- **Confidence scoring (0–100)** — determines whether `plausible_unverified` results show an encouraging or cautious message.
- **Dynamic user messages** — `plausible_unverified` results with confidence ≥ 50 show "We're still working on verifying your website, you can continue." Results < 50 show "We weren't able to fully verify this website, but you can still continue. Our team may follow up."

See `docs/website-validation-spec.md` section G2 for full scoring rules.

---

## See Also

- `docs/environment.md` — full env var reference table
- `docs/ai-narrative.md` — Claude API costs and rate limits
- `docs/pdf-generation.md` — PDFMonkey setup and template configuration
- `src/lib/website/headless-fetch.ts` — current headless implementation
- `docs/hard-rules.md` — browser compatibility constraints that affect deployment
