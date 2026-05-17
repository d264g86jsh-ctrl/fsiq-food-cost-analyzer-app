# Launch Blockers & Post-Launch Tasks — FSIQ Food Cost Analyzer

Last updated: Phase 11 (QA & Hardening)

---

## Environment Variables

### Required before launch (app will error or silently skip core features if missing)

| Variable | Used by | What breaks if missing |
|---|---|---|
| `DATABASE_URL` | Prisma | Every submission fails — no DB writes |
| `ANTHROPIC_API_KEY` | AI Researcher, AI Narrative, Claude tiebreaker | AI pipeline degrades to fallback narratives; Claude tiebreaker disabled. Non-fatal but PDFs lose personalization. |
| `PDFMONKEY_API_KEY` | PDF generation | `pdfStatus = "skipped"` for all qualified leads; no report PDF generated |
| `PDFMONKEY_TEMPLATE_ID` | PDF generation | Same as above |
| `GHL_ACCESS_TOKEN` or `GHL_API_KEY` | GHL CRM sync | `crmSyncStatus = "error"` for all submissions; no contacts created in GHL; no email automation fires |
| `GHL_LOCATION_ID` | GHL CRM sync | Same as above |
| `NEXT_PUBLIC_META_PIXEL_ID` | Meta Pixel (browser) | Client-side pixel does not fire; no browser-side Lead events |
| `META_PIXEL_ID` | Meta CAPI (server) | Server-side CAPI skipped; `metaStatus = "skipped"` |
| `META_CONVERSIONS_API_TOKEN` | Meta CAPI (server) | Same as above |
| `GOOGLE_PLACES_API_KEY` | Website validation — Google Places | Country eligibility degrades to `unknown`; no `us_verified` signals; conservative PDF used more often |
| `ADMIN_ACCESS_TOKEN` | Admin dashboard auth | Admin login always fails; dashboard inaccessible |
| `CALENDLY_URL` | PDFMonkey template (not app code) | Calendly buttons in PDF have no URL |
| `FSIQ_LOGO_DARK_URL` | PDFMonkey template (not app code) | FSIQ header logo missing on PDF pages 2–6 |
| `FSIQ_LOGO_LIGHT_URL` | PDFMonkey template (not app code) | FSIQ wordmark missing on PDF cover |
| `FSIQ_IQ_LOGO_URL` | PDFMonkey template (not app code) | Fallback logo broken when client logo is absent |

> **Note:** `CALENDLY_URL`, `FSIQ_LOGO_*`, `FSIQ_IQ_LOGO_URL` are **not read by app server code**. They are variables configured in the PDFMonkey template itself (or injected via the PDFMonkey dashboard). Set them in the PDFMonkey template variables, not just in `.env.local`.

### Optional / degrade gracefully (non-blocking)

| Variable | Default behavior when missing |
|---|---|
| `HEADLESS_ENABLED` | Playwright headless fallback disabled. Cloudflare-protected sites that return thin HTML may get lower confidence scores. Set `HEADLESS_ENABLED=true` only in environments with Chromium available. |
| `META_TEST_EVENT_CODE` | CAPI events fire against live Meta pixel (not test mode). Only set this in staging/dev. |
| `GHL_API_BASE_URL` | Defaults to `https://services.leadconnectorhq.com`. Override only if using a non-standard GHL endpoint. |

### In `.env.example` but not read by app code (reserved / external use)

| Variable | Reason in `.env.example` | Status |
|---|---|---|
| `OUTLOOK_CLIENT_ID` | Reserved from SOP planning | **Unused in v1.** Email delivery is GHL/Zapier-owned. These vars serve no function. |
| `OUTLOOK_CLIENT_SECRET` | Same | Same |
| `OUTLOOK_TENANT_ID` | Same | Same |
| `GHL_PIPELINE_ID` | GHL pipeline placement | **Not read by `ghl.ts`.** GHL pipeline assignment is managed in GHL itself, not via API in v1. |

---

## Supabase / Database Readiness

- [x] Prisma schema matches production DB (migration `20260516082213_init_submission_schema` applied)
- [ ] Confirm `DATABASE_URL` points to production Supabase instance (not local dev DB)
- [ ] Run `pnpm prisma migrate deploy` against production DB before first deploy
- [ ] Verify Supabase connection pooler URL is used (port 6543) — not the direct connection (port 5432) — for serverless Next.js

---

## PDFMonkey Readiness

- [ ] `PDFMONKEY_TEMPLATE_ID` is the production template ID (not a test/draft)
- [ ] Template variables `CALENDLY_URL`, `FSIQ_LOGO_DARK_URL`, `FSIQ_LOGO_LIGHT_URL`, `FSIQ_IQ_LOGO_URL` are configured in the PDFMonkey template or dashboard
- [ ] Test a full PDF generation end-to-end in staging before launch
- [ ] Verify PDFMonkey download URLs are accessible from the browser (test on mobile)
- [ ] Confirm PDFMonkey URL expiry window — URLs are time-limited; GHL email must fire before expiry

---

## GHL Readiness

- [ ] `GHL_LOCATION_ID` matches the target sub-account
- [ ] `GHL_ACCESS_TOKEN` is a valid, non-expired token for the sub-account
- [ ] All 28 `fsiq_*` custom fields exist in GHL before first submission (field IDs must match `build-ghl-payload.ts`)
- [ ] Zapier automations are mapped to `fsiq_communication_route` values before launch
- [ ] Test each communication route end-to-end in staging: `send_full_report`, `send_conservative_report`, all `send_dq_*` routes
- [ ] Confirm `FSIQ Full PDF Ready` and `FSIQ Conservative PDF Ready` tags trigger the correct Zapier zap

---

## Meta Tracking Readiness

- [ ] `META_PIXEL_ID` and `NEXT_PUBLIC_META_PIXEL_ID` both set to the same production pixel ID
- [ ] `META_CONVERSIONS_API_TOKEN` is a valid Conversions API token for that pixel
- [ ] `META_TEST_EVENT_CODE` is **not set** in production (leave blank — removes test mode)
- [ ] Verify browser Lead event fires in Meta Events Manager on a staging submission
- [ ] Verify server CAPI Lead event appears with matching `event_id` (deduplication working)
- [ ] Verify `QualifiedLead` CAPI event appears only for qualified leads

---

## Admin Dashboard Readiness

- [ ] `ADMIN_ACCESS_TOKEN` is a strong, unique random string (at least 32 chars)
- [ ] Token is stored only in `.env.local` / hosting env vars — not committed, not logged
- [ ] Test admin login → submission list → submission detail → manual review approval flow
- [ ] Confirm `sanitizeErrorString` is redacting tokens in workflow error display (no raw Bearer tokens shown)

---

## Security Checks

- [x] No real API keys or secrets in committed source code
- [x] `.env.local` is gitignored and has never been committed
- [x] All secret env vars are server-only (`process.env.*` — not `NEXT_PUBLIC_*`)
- [x] `NEXT_PUBLIC_META_PIXEL_ID` is the only public var — pixel IDs are non-secret by design
- [x] Admin cookie is HttpOnly; token is never rendered to the browser
- [x] `sanitizeErrorString` redacts tokens/keys in admin error display
- [x] AI prompts and raw provider responses are not exposed in admin UI
- [x] All PII (email, phone, zip) is SHA-256 hashed before sending to Meta CAPI
- [ ] Confirm no `console.log` of real user PII in production logs (Next.js server logs)
- [ ] Confirm Supabase RLS policies are set (if direct client access is used anywhere — v1 uses Prisma server-side only, so this is low priority but worth confirming)

---

## Known Gaps (Not Implemented in Phase 11 — Post-Launch Tasks)

### PDF Retry Worker
The admin dashboard shows failed PDF jobs (`pdfStatus = "error"`) and has placeholder "Retry PDF" buttons, but the retry worker is **not implemented**. Until a retry worker is built:
- An admin can identify failed PDFs in the dashboard
- Manual retry: locate the submission ID, re-trigger the PDFMonkey API call manually via the PDFMonkey dashboard or a one-off script
- The `pdfRetryCount` field is incremented by the submission pipeline on failure but the admin button does not trigger a new attempt

### GHL Re-sync Worker
Similarly, the "Re-sync GHL" button in the admin dashboard is a Phase 11 placeholder. Until built:
- Admin can identify `crmSyncStatus = "error"` submissions
- Manual retry: use GHL UI or a one-off script to create/update the contact

### Playwright Headless Fallback
`HEADLESS_ENABLED=true` requires Chromium to be available in the deployment environment. Vercel does not include Chromium by default. Options:
- Use a Browserless.io / Playwright-as-a-service endpoint
- Run a self-hosted worker with Chromium for headless validation
- Leave disabled (default) — sites that require JavaScript will get `plausible_unverified` instead of `verified_restaurant`

### Email Retry / Status Tracking
`emailStatus`, `emailSentAt`, `emailError`, `emailRetryCount` fields exist in the schema but are unused — GHL/Zapier owns email delivery in v1. These fields are reserved for a future phase where the app may track email delivery confirmation.

### Supabase Connection Pooler
For serverless deployments (Vercel), use the **Supabase connection pooler URL** (PgBouncer, port 6543), not the direct connection (port 5432). Prisma's `pgbouncer=true` datasource parameter may also be needed.

---

## Launch Checklist Summary

Before flipping production traffic:

1. [ ] All "Required before launch" env vars set in hosting provider
2. [ ] `DATABASE_URL` points to production Supabase + connection pooler
3. [ ] `pnpm prisma migrate deploy` run against production DB
4. [ ] PDFMonkey template vars configured in PDFMonkey dashboard
5. [ ] GHL custom fields all exist; Zapier automations mapped
6. [ ] Meta pixel ID matches in both `NEXT_PUBLIC_META_PIXEL_ID` and `META_PIXEL_ID`; `META_TEST_EVENT_CODE` blank
7. [ ] Admin token is strong; admin login tested
8. [ ] End-to-end staging test: qualified → full PDF → GHL sync → email received
9. [ ] End-to-end staging test: DQ (all 3 paths) → GHL sync → DQ email received
10. [ ] End-to-end staging test: Meta Lead event visible in Events Manager with deduplication
