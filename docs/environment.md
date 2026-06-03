# Environment Variables

**Source of truth:** `.env.example`

Copy `.env.example` to `.env.local` for local development and fill in values. For Vercel, set variables via **Project → Settings → Environment Variables**.

---

## Reference Table

| Variable | Required? | Env | Description |
|---|---|---|---|
| `DATABASE_URL` | **Required** | Both | Supabase PostgreSQL connection string. Use the **pooler URL** (port 6543) — never the direct connection (port 5432) on Vercel. |
| `ANTHROPIC_API_KEY` | **Required** | Both | Claude API key. Missing → AI fallback narratives used; PDF personalization reduced. Non-fatal. |
| `PDFMONKEY_API_KEY` | **Required** | Both | PDFMonkey API key. Missing → `pdfStatus="skipped"` for all qualified leads. |
| `PDFMONKEY_TEMPLATE_ID` | **Required** | Both | PDFMonkey template ID. Missing → `pdfStatus="skipped"`. |
| `GHL_ACCESS_TOKEN` | **Required** | Both | GoHighLevel API token (preferred). Missing → `crmSyncStatus="error"` for all submissions. |
| `GHL_API_KEY` | Optional | Both | GHL API key fallback if `GHL_ACCESS_TOKEN` not set. |
| `GHL_LOCATION_ID` | **Required** | Both | GHL location ID for contact creation. |
| `GHL_PIPELINE_ID` | Optional | Both | GHL pipeline ID (unused in v1 — managed in GHL directly). |
| `GHL_API_BASE_URL` | Optional | Both | GHL API base URL. Defaults to `https://services.leadconnectorhq.com`. |
| `ADMIN_ACCESS_TOKEN` | **Required** | Both | Protects `/admin/*` routes. Use a strong random string (32+ chars). Generate with `openssl rand -hex 32`. |
| `NEXT_PUBLIC_META_PIXEL_ID` | **Required** | Both | Meta Pixel ID — embedded at build time, sent to browser. Pixel IDs are non-secret by design. |
| `META_PIXEL_ID` | **Required** | Both | Same value as `NEXT_PUBLIC_META_PIXEL_ID`. Used server-side for CAPI. |
| `META_CONVERSIONS_API_TOKEN` | **Required** | Both | Meta Conversions API token. Missing → CAPI skipped; `metaStatus="skipped"`. |
| `META_TEST_EVENT_CODE` | Staging only | Preview | Enables Meta test event mode. **Must be blank in production.** |
| `HEADLESS_ENABLED` | Optional | Local | `"true"` to enable local Playwright headless browser. Only works in environments with Chromium installed (not Vercel). Default: disabled. |
| `BROWSERLESS_API_KEY` | Future | Prod | Browserless.io API key for production headless browser. Not yet implemented. |
| `OUTLOOK_CLIENT_ID` | Unused | — | Reserved — email delivery is GHL-owned in v1. No function. |
| `OUTLOOK_CLIENT_SECRET` | Unused | — | Reserved — unused in v1. |
| `OUTLOOK_TENANT_ID` | Unused | — | Reserved — unused in v1. |
| `CALENDLY_URL` | Template-side | — | Injected into PDFMonkey template. Not read by app code — configure in PDFMonkey template variables. |
| `FSIQ_LOGO_DARK_URL` | Template-side | — | FSIQ dark logo for PDF. Configure in PDFMonkey template, not app env vars. |
| `FSIQ_LOGO_LIGHT_URL` | Template-side | — | FSIQ light logo for PDF. Configure in PDFMonkey template. |
| `FSIQ_IQ_LOGO_URL` | Template-side | — | FSIQ IQ logo for PDF. Configure in PDFMonkey template. |

---

## Database Connection

Use the **Supabase connection pooler** (PgBouncer), not the direct connection:

| Connection type | Port | Use for |
|---|---|---|
| Direct | 5432 | Local dev, migrations |
| Pooler (PgBouncer) | 6543 | Vercel serverless functions |

The Pooler URL format from Supabase dashboard:
```
postgresql://postgres.[project-ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

Running migrations requires the **direct** connection (not the pooler):
```bash
# Use direct connection for migrate deploy
DATABASE_URL="postgresql://...5432/postgres" pnpm prisma migrate deploy
```

---

## Local Setup

```bash
# 1. Copy the example file
cp .env.example .env.local

# 2. Fill in required values
#    At minimum: DATABASE_URL, ANTHROPIC_API_KEY, PDFMONKEY_API_KEY,
#                PDFMONKEY_TEMPLATE_ID, GHL_ACCESS_TOKEN, GHL_LOCATION_ID,
#                ADMIN_ACCESS_TOKEN, NEXT_PUBLIC_META_PIXEL_ID, META_PIXEL_ID,
#                META_CONVERSIONS_API_TOKEN

# 3. Run migrations
pnpm prisma migrate dev

# 4. Start dev server
pnpm dev
```

For a minimal local environment (skip CRM, Meta, PDF), only `DATABASE_URL` and `ANTHROPIC_API_KEY` are strictly needed. The app degrades gracefully for all other missing vars.

---

## Vercel Setup

1. Go to **Project → Settings → Environment Variables**
2. Add each variable, selecting the correct environments (Production / Preview / Development)
3. Use separate API keys for Preview environments where possible (test PDFMonkey template, sandbox GHL account)
4. Set `META_TEST_EVENT_CODE` on Preview only; leave blank on Production

---

## Getting API Keys

| Service | Where to get the key |
|---|---|
| Anthropic | [console.anthropic.com](https://console.anthropic.com) → API Keys |
| PDFMonkey | PDFMonkey dashboard → Settings → API Key |
| GoHighLevel | GHL Settings → Integrations → API Keys |
| Meta CAPI | Meta Events Manager → Settings → Conversions API |
| Supabase | Supabase dashboard → Project Settings → Database → Connection strings |
| Browserless.io | [browserless.io](https://browserless.io) → Dashboard (when implemented) |

---

## Security

- **Never commit** `.env.local` or any file with real values
- `.env.example` is the only env file that should be committed (values blank)
- `ADMIN_ACCESS_TOKEN` should be treated like a password — rotate it if exposed
- Vercel encrypts environment variables at rest
- Rotate compromised keys immediately in both the source service and Vercel dashboard

---

## See Also

- `docs/deployment.md` — Vercel setup, function timeout, headless browser
- `docs/pdf-generation.md` — PDFMonkey template-side variables (`CALENDLY_URL`, `FSIQ_LOGO_*`)
- `docs/ai-narrative.md` — `ANTHROPIC_API_KEY` usage and cost
- `.env.example` — canonical list of all variables with descriptions
