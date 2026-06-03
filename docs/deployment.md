# Deployment Guide

**Covers:** Vercel setup, environment variables, function timeout budget, headless browser integration, secrets management.

---

## Overview

The app runs on Vercel (Next.js App Router). The core submission pipeline uses `waitUntil` (Vercel Functions) to run AI, PDF, and CRM steps in the background after the HTTP response is sent. This requires **Vercel Pro or higher** (Hobby plan limits background work to 10s; the full pipeline takes 90–150s).

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
| Browserless.io | Headless browser fallback (planned) | Free tier for dev |

---

## Environment Variables

See `docs/environment.md` for the full reference table. The minimal set to make the app functional:

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
Use the **connection pooler** URL from Supabase, not the direct connection:
- Pooler port: **6543** (PgBouncer in transaction mode)
- Direct port: 5432 (do not use on Vercel — serverless functions exhaust direct connections)

```
DATABASE_URL=postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

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

## See Also

- `docs/environment.md` — full env var reference table
- `docs/ai-narrative.md` — Claude API costs and rate limits
- `docs/pdf-generation.md` — PDFMonkey setup and template configuration
- `src/lib/website/headless-fetch.ts` — current headless implementation
- `docs/hard-rules.md` — browser compatibility constraints that affect deployment
