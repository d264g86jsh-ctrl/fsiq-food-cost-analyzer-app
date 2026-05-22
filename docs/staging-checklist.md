# Staging Deployment Checklist & Live Integration QA Plan
## FSIQ Food Cost Analyzer — Pre-Launch

---

## 1. Required Environment Variables

Set all of these in your hosting provider (Vercel → Project Settings → Environment Variables) before deploying to staging. **None of these should be in any committed file.**

| Variable | Where to get it | Notes |
|---|---|---|
| `DATABASE_URL` | Supabase → Project Settings → Database → Connection string | **Use the connection pooler URL (port 6543), not the direct URL (port 5432).** Append `?pgbouncer=true&connection_limit=1` if using Prisma with PgBouncer. |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | Without this, AI pipeline degrades to fallback narratives — PDFs work but lose personalization. |
| `PDFMONKEY_API_KEY` | PDFMonkey dashboard → Settings → API | Without this, all qualified leads get `pdfStatus = "skipped"` — no PDFs generated. |
| `PDFMONKEY_TEMPLATE_ID` | PDFMonkey → your template → URL or dashboard | Must be the **published production template ID**, not a draft. |
| `GHL_ACCESS_TOKEN` | GHL → Settings → Integrations → API Keys (or OAuth token) | Preferred over `GHL_API_KEY`. Verify it's for the correct sub-account. |
| `GHL_LOCATION_ID` | GHL → Settings → Business Profile → Location ID | Without this, all GHL syncs fail silently. |
| `NEXT_PUBLIC_META_PIXEL_ID` | Meta Events Manager → your pixel → Pixel ID | Embedded at build time. Pixel IDs are non-secret by design. Must match `META_PIXEL_ID`. |
| `META_PIXEL_ID` | Same pixel ID as above | Used server-side for CAPI. Set to the same value as `NEXT_PUBLIC_META_PIXEL_ID`. |
| `META_CONVERSIONS_API_TOKEN` | Meta Events Manager → your pixel → Settings → Conversions API → Generate access token | Without this, CAPI skipped; `metaStatus = "skipped"`. |
| `ADMIN_ACCESS_TOKEN` | Generate locally: `openssl rand -hex 32` | Must be 32+ chars. Store only in hosting env vars — never commit. |

---

## 2. Optional Environment Variables

These degrade gracefully when absent. Set based on your environment.

| Variable | When to set | Default behavior when absent |
|---|---|---|
| `META_TEST_EVENT_CODE` | **Staging only. Must be blank in production.** | When set, CAPI events go to Meta's test pixel view. When blank, events hit the live pixel. |
| `GHL_API_BASE_URL` | Only if using a non-standard GHL endpoint | Defaults to `https://services.leadconnectorhq.com` |
| `HEADLESS_ENABLED` | Only if Chromium is available in your deployment (not Vercel default) | Playwright fallback disabled. JS-rendered sites get `plausible_unverified` rather than full validation. |

**Not read by app code — configure in PDFMonkey template dashboard instead:**
- `CALENDLY_URL` → Calendly buttons in PDF pages 4 and 6
- `FSIQ_LOGO_DARK_URL` → FSIQ wordmark in PDF headers (pages 2–6)
- `FSIQ_LOGO_LIGHT_URL` → FSIQ wordmark on PDF cover (page 1)
- `FSIQ_IQ_LOGO_URL` → Fallback logo when no client logo is found

**Not used in v1 — leave blank:**
- `OUTLOOK_CLIENT_ID/SECRET/TENANT_ID` — reserved, email is GHL/Zapier-owned
- `GHL_PIPELINE_ID` — pipeline assignment is managed in GHL, not via API

---

## 3. Supabase Setup

**Before first deploy:**

1. **Confirm your `DATABASE_URL` format.** For Vercel serverless, the URL must be the Supabase connection pooler (Transaction mode, port 6543):
   ```
   postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
   ```
   Not the direct connection (port 5432) — that will exhaust connections under concurrent serverless invocations.

2. **Run the migration** against the production database before deploying:
   ```bash
   DATABASE_URL="<your-production-url>" pnpm prisma migrate deploy
   ```
   The migration `20260516082213_init_submission_schema` must be applied.

3. **Verify the migration applied:**
   ```bash
   DATABASE_URL="<your-production-url>" pnpm prisma migrate status
   ```
   Expected: `1 migration applied`.

4. **RLS note:** The app accesses Supabase exclusively through Prisma server-side actions. No client SDK is used. Row-level security is low-priority but confirm no public access is enabled on the `Submission` table via Supabase dashboard → Table Editor → RLS.

5. **Connection test:** After deploy, submit the form once and confirm a `Submission` row appears in Supabase → Table Editor.

---

## 4. PDFMonkey Setup

**Before running any test submissions:**

1. **Confirm the template is published** (not a draft). PDFMonkey draft templates return errors on API calls.

2. **Configure template variables in the PDFMonkey template or dashboard** — these are not set by the app:
   | Variable | Value |
   |---|---|
   | `CALENDLY_URL` | Your Calendly booking URL |
   | `FSIQ_LOGO_DARK_URL` | CDN URL or base64 data URI of the dark FSIQ wordmark |
   | `FSIQ_LOGO_LIGHT_URL` | CDN URL or base64 data URI of the light FSIQ wordmark |
   | `FSIQ_IQ_LOGO_URL` | CDN URL or base64 data URI of the IQ mark (fallback logo) |

3. **Test the 27 payload variables** match the template exactly. The app sends these fields — any name mismatch silently renders as blank in the PDF:
   `restaurantName`, `fullName`, `conceptTypeRaw`, `locationsRaw`, `spendBucket`, `annualSpendDisplay`, `finalPctDisplay`, `dollarEstimateDisplay`, `conceptBenchmark`, `caseStudy`, `year1Display`–`year5Display`, `year1HeightPct`–`year5HeightPct`, `logoUrl`, `hasLogo`, `businessSummary`, `narrativeDistributor`, `narrativeProcurement`, `narrativeSku`, `reportDate`

4. **Verify PDF download URL accessibility.** PDFMonkey URLs are time-limited. Open the URL in a private browser window immediately after generation to confirm it resolves.

5. **Visual review checklist (all 6 pages):**
   - P1 Cover: client logo (or IQ fallback), FSIQ light wordmark, 4 metadata columns, name title-cased
   - P2: `finalPct` shows 1 decimal (e.g. `7.4%`), Year 5 bar tallest, all bars proportional
   - P3: 3 narrative blocks present, no em-dashes or en-dashes
   - P4: 4 quadrants, "Book Your Full Analysis Call" → Calendly URL resolves
   - P5: Correct case study for the spend bucket + locations combo used in the test
   - P6: "Book Your Free Analysis Call" → Calendly URL, disclaimer left-aligned, footer: `FoodServiceIQ — CONFIDENTIAL`
   - All pages: Inter font rendered, no overlapping headers/footers

---

## 5. GHL Custom Fields & Tags Setup

**Before first submission, create all 28 custom fields in GHL** under the target sub-account. The app writes these field names verbatim — they must exist in GHL first or the sync fails silently.

**Custom fields to create (all type: Text unless noted):**

| GHL Field Key | Type | Notes |
|---|---|---|
| `fsiq_submission_id` | Text | App DB cuid |
| `fsiq_full_name` | Text | |
| `fsiq_email` | Text | |
| `fsiq_phone` | Text | Optional |
| `fsiq_restaurant_name` | Text | |
| `fsiq_website` | Text | |
| `fsiq_zip_code` | Text | |
| `fsiq_concept_type` | Text | |
| `fsiq_locations` | Text | |
| `fsiq_annual_food_spend` | Text | Raw dropdown value |
| `fsiq_distributor_type` | Text | |
| `fsiq_procurement_strategy` | Text | |
| `fsiq_top_skus` | Text (large) | Free text, can be long |
| `fsiq_lead_status` | Text | See lead status values |
| `fsiq_communication_route` | Text | **Primary Zapier trigger** |
| `fsiq_qualified` | Text or Checkbox | `true` / `false` |
| `fsiq_final_decision` | Text | |
| `fsiq_country_eligibility` | Text | |
| `fsiq_dq_reason` | Text | |
| `fsiq_estimated_savings` | Text | e.g. `$147,000` |
| `fsiq_final_pct` | Text | e.g. `7.4%` |
| `fsiq_spend_bucket` | Text | e.g. `$1M–$3M` |
| `fsiq_pdf_mode` | Text | `full` / `conservative` |
| `fsiq_pdf_status` | Text | `complete` / `error` / `skipped` |
| `fsiq_pdf_url` | Text (URL) | Time-limited PDFMonkey URL |
| `fsiq_pdf_ready_at` | Text or Date | ISO timestamp |
| `fsiq_manual_review_required` | Text or Checkbox | |
| `fsiq_workflow_status` | Text | |
| `fsiq_workflow_stage` | Text | |

**Tags to pre-create in GHL** (so Zapier can trigger on them):
- `FSIQ Analyzer Submitted`
- `FSIQ Full PDF Ready`
- `FSIQ Conservative PDF Ready`
- `FSIQ Qualified`
- `FSIQ DQ Invalid Website`
- `FSIQ DQ Below Threshold`
- `FSIQ DQ National Chain`
- `FSIQ DQ Clear Non Fit`
- `FSIQ Non US`
- `FSIQ Manual Review`
- `FSIQ PDF Failed`
- `FSIQ Workflow Failed`
- `FSIQ Possible Test Submission`
- `FSIQ Possible Spam Submission`

**Zapier automations to map before launch:**

| `fsiq_communication_route` value | Zapier zap action |
|---|---|
| `send_full_report` | Send full report email with `fsiq_pdf_url` + Calendly CTA |
| `send_conservative_report` | Send conservative report email with `fsiq_pdf_url` + Calendly CTA |
| `send_dq_invalid_website` | Send "quick check" DQ email |
| `send_dq_below_threshold` | Send "below threshold" DQ email |
| `send_dq_national_chain` | Send "national chain" DQ email |
| `send_dq_clear_non_fit` | Polite ineligible message |
| `send_dq_non_us` | Polite non-US message (distinct from `clear_non_fit`) |
| `manual_review_hold` | No automation — human reviews first |
| `pdf_failure_hold` | No automation — hold for PDF retry |
| `no_email_hold` | No automation |

---

## 6. Meta Pixel / CAPI Test Steps

**In staging, set `META_TEST_EVENT_CODE`** to your test event code from Meta Events Manager → your pixel → Test Events tab. This lets CAPI events appear in Test Events without polluting live data.

**Step-by-step verification:**

1. Open Meta Events Manager → your pixel → Test Events tab → copy the test event code → set as `META_TEST_EVENT_CODE` in staging env vars.

2. Open the form in a browser with Meta Pixel Helper extension installed (Chrome).

3. **Page load:** Pixel Helper should show a `PageView` event.

4. **First field interaction** (type in the Restaurant Name field): Pixel Helper should show `AnalyzerStarted`.

5. **Submit a qualified lead** (see Scenario A below).

6. **Browser events to verify in Pixel Helper at submission:**
   - `Lead` event fires with an `eventID` field set to a UUID string.

7. **Server CAPI events to verify in Meta Events Manager → Test Events:**
   - `Lead` event with the same `event_id` as the browser Lead event → confirms deduplication is working.
   - `QualifiedLead` event with a `ql-` prefixed event ID (different from Lead — intentionally not deduplicated).

8. **For a DQ submission** (Scenarios C, D, E): browser `Lead` fires, CAPI `Lead` also fires (after GHL sync completes — CAPI fires for all final routes where `shouldSyncGhl === true`). `QualifiedLead` must NOT appear for any DQ scenario.

9. **Before production deploy:** Remove `META_TEST_EVENT_CODE` from env vars (set it to blank). Confirm Test Events tab shows no new events after removing it.

---

## 7. Admin Dashboard Access Setup

1. **Generate a strong token:**
   ```bash
   openssl rand -hex 32
   ```

2. **Set `ADMIN_ACCESS_TOKEN`** in your hosting env vars to that value.

3. **Access the dashboard:** Navigate to `/admin/login`, enter the token, click Login.

4. **Verify:**
   - Login redirects to `/admin/submissions`
   - Submissions list loads with correct counts in the QA summary bar
   - Clicking a submission row opens the detail view
   - Manual review panel shows correct status
   - Logout clears the session and redirects to login
   - Navigating directly to `/admin/submissions` without a cookie redirects to `/admin/login`

5. **Verify error sanitization:** If any submissions have workflow errors (e.g., GHL sync failed with a token in the error message), confirm the admin detail view shows the redacted version — no raw Bearer tokens or `sk-` keys visible.

---

## 8. Test Submission Scenarios

Run all 8 scenarios against your staging environment. Use a real email address you control so you can verify GHL contact creation. Use a throwaway name like "Staging Test" to distinguish from real leads.

---

### Scenario A — Qualified, Full PDF

**Input:**
- Restaurant name: a real independent restaurant name (not a chain)
- Website: `https://lamberts-daves.com` or any real independent restaurant with a live website
- ZIP: `78704` (Austin, TX)
- Concept type: Casual dining
- Locations: 1 location
- Annual food spend: `$1M - $3M`
- Distributor: Sysco, US Foods, or other national broadliner
- Procurement: Market price — single source
- Top SKUs: Beef, chicken, seafood
- Full name, email, phone: use your own

**Expected outcomes:**
- DB: `qualified = true`, `finalPct` between 5.0%–8.0%, `pdfStatus = complete`, `pdfDownloadUrl` non-null
- PDF: Full personalized PDF (6 pages), real restaurant logo on cover, real business summary in P3 narratives
- GHL: Contact created with `fsiq_lead_status = qualified_full_pdf_ready`, `fsiq_communication_route = send_full_report`, tags: `FSIQ Analyzer Submitted`, `FSIQ Qualified`, `FSIQ Full PDF Ready`
- Email: Full report email received with working PDF link and Calendly button
- Meta: Browser `Lead` + server CAPI `Lead` (same event_id, deduplication confirmed) + server CAPI `QualifiedLead` (ql- prefix)
- Admin: Submission visible, `workflowStatus = complete`, `crmSyncStatus = synced`, `metaStatus = fired`

---

### Scenario B — Qualified, Conservative PDF

**Input:** Same as A, except use a website that returns 403 or is Cloudflare-protected (e.g. `https://spiritscenla.com`), or a URL with `plausible_unverified` status.

**Expected outcomes:**
- DB: `finalDecision = plausible_unverified`, `pdfMode = conservative`, `pdfStatus = complete`
- PDF: Conservative PDF — no client logo, no business summary on P3, savings math unchanged
- GHL: `fsiq_lead_status = qualified_conservative_pdf_ready`, `fsiq_communication_route = send_conservative_report`, tag `FSIQ Conservative PDF Ready`
- Email: Conservative report email with PDF link
- Meta: Browser `Lead` + server CAPI `Lead` (dedup) + server CAPI `QualifiedLead`

---

### Scenario C — DQ: National Chain

**Input:** Restaurant name: `McDonald's` (or `Chick-fil-A`, `Chipotle`). Any website, valid spend.

**Expected outcomes:**
- DB: `qualified = false`, `dqReason = national_chain`, `pdfStatus` null/skipped, no `pdfDownloadUrl`
- GHL: `fsiq_lead_status = disqualified_national_chain`, `fsiq_communication_route = send_dq_national_chain`, tag `FSIQ DQ National Chain`
- Email: National chain DQ email (no PDF link)
- Meta: Browser `PageView`, `AnalyzerStarted`, `Lead`; server CAPI `Lead` fires (CAPI fires for all final routes where `shouldSyncGhl === true`, which includes all DQ routes). Server CAPI `QualifiedLead` must NOT fire.
- AI: No Claude calls should have fired (verify by checking `businessSummary` is null in DB)

---

### Scenario D — DQ: Invalid Website

**Input:** Website: `https://thiswebsite404defnotexist12345.com` (must return 404, not timeout). Valid spend ($1M+).

**Expected outcomes:**
- DB: `finalDecision = invalid_website`, `qualified = false`, `dqReason = invalid_website`
- GHL: `fsiq_lead_status = disqualified_invalid_website`, `fsiq_communication_route = send_dq_invalid_website`, tag `FSIQ DQ Invalid Website`
- Email: Invalid website DQ email
- Meta: Browser `PageView`, `AnalyzerStarted`, `Lead`; server CAPI `Lead` fires. Server CAPI `QualifiedLead` must NOT fire.

---

### Scenario E — DQ: Below Threshold

**Input:** Annual food spend: `$200,000` (below $500K floor).

**Expected outcomes:**
- DB: `qualified = false`, `dqReason = below_threshold`
- GHL: `fsiq_lead_status = disqualified_below_threshold`, `fsiq_communication_route = send_dq_below_threshold`, tag `FSIQ DQ Below Threshold`
- Email: Below threshold DQ email
- Meta: Browser `PageView`, `AnalyzerStarted`, `Lead`; server CAPI `Lead` fires. Server CAPI `QualifiedLead` must NOT fire.

---

### Scenario F — Non-US

**Input:** ZIP: `H2X 1Y4` (Canadian postal code format). Valid spend.

**Expected outcomes:**
- Form: Non-US ZIP message shown; form submission blocked at the client-side validation level before the server action is called.
- No server-side CAPI events fire (submission never reaches the server).
- If somehow submitted (e.g., direct API call bypassing the form): `countryEligibility = non_us`, `finalDecision = clear_non_fit`, `internalFlag: non_us_postal_code`, no PDF. GHL: `fsiq_lead_status = disqualified_non_us`, `fsiq_communication_route = send_dq_non_us`, tag `FSIQ Non US`. Server CAPI `Lead` would fire at that point; `QualifiedLead` must NOT.

---

### Scenario G — Manual Review Hold

**Input:** Website that returns a timeout or very low confidence score (e.g., a domain that hangs). The validator sets `manualReviewRequired = true` for timeout/unreachable sites.

**Expected outcomes:**
- DB: `manualReviewRequired = true`, `manualReviewStatus = pending`
- GHL: `fsiq_lead_status = manual_review_required`, `fsiq_communication_route = manual_review_hold`, tag `FSIQ Manual Review`; no PDF-ready tag
- Email: No email fires
- Meta: Browser `Lead` fires; server CAPI `Lead` fires (manual review is a final route with `shouldSyncGhl === true`). Server CAPI `QualifiedLead` must NOT fire.
- Admin: Submission appears in the manual review filter; manual review panel is actionable

---

### Scenario H — Cloudflare Test

**Input:** Website: `https://spiritscenla.com`. Valid spend ($1M+).

**Expected outcomes:**
- Validation: `websiteStatus` is 200 or 403 — NOT 0 or 404
- DB: `finalDecision` is `plausible_unverified` or `verified_restaurant` (not `invalid_website`)
- Lead proceeds to qualified path → conservative or full PDF depending on validation result

---

## 9. Expected GHL Outcomes per Scenario

| Scenario | `fsiq_lead_status` | `fsiq_communication_route` | Tags |
|---|---|---|---|
| A — Qualified full PDF | `qualified_full_pdf_ready` | `send_full_report` | Submitted, Qualified, Full PDF Ready |
| B — Qualified conservative PDF | `qualified_conservative_pdf_ready` | `send_conservative_report` | Submitted, Qualified, Conservative PDF Ready |
| C — National chain DQ | `disqualified_national_chain` | `send_dq_national_chain` | Submitted, DQ National Chain |
| D — Invalid website DQ | `disqualified_invalid_website` | `send_dq_invalid_website` | Submitted, DQ Invalid Website |
| E — Below threshold DQ | `disqualified_below_threshold` | `send_dq_below_threshold` | Submitted, DQ Below Threshold |
| F — Non-US (form blocked) | N/A — submission blocked client-side | N/A | N/A |
| G — Manual review | `manual_review_required` | `manual_review_hold` | Submitted, Manual Review |
| H — Cloudflare | `qualified_full_pdf_ready` or `qualified_conservative_pdf_ready` | `send_full_report` or `send_conservative_report` | Submitted, Qualified, PDF Ready (whichever mode) |

---

## 10. Expected Meta Events per Scenario

CAPI `Lead` fires for all final routes where `shouldSyncGhl === true` — this includes qualified leads, all DQ routes, and manual review. `QualifiedLead` fires only for `qualified_full_pdf_ready` and `qualified_conservative_pdf_ready`. There is no `DisqualifiedLead` event.

| Scenario | Browser Pixel | CAPI Lead | CAPI QualifiedLead |
|---|---|---|---|
| A — Qualified full PDF | `PageView`, `AnalyzerStarted`, `Lead` | ✅ (same event_id as browser Lead) | ✅ (ql- prefix) |
| B — Qualified conservative | `PageView`, `AnalyzerStarted`, `Lead` | ✅ (dedup confirmed) | ✅ (ql- prefix) |
| C — National chain DQ | `PageView`, `AnalyzerStarted`, `Lead` | ✅ | ❌ must NOT fire |
| D — Invalid website DQ | `PageView`, `AnalyzerStarted`, `Lead` | ✅ | ❌ must NOT fire |
| E — Below threshold DQ | `PageView`, `AnalyzerStarted`, `Lead` | ✅ | ❌ must NOT fire |
| F — Non-US (form blocked) | `PageView`, `AnalyzerStarted` | ❌ (form blocked before server) | ❌ |
| G — Manual review | `PageView`, `AnalyzerStarted`, `Lead` | ✅ | ❌ must NOT fire |
| H — Cloudflare | `PageView`, `AnalyzerStarted`, `Lead` | ✅ | ✅ (ql- prefix) |

**Deduplication check for Scenarios A/B/H:** In Meta Events Manager, the `Lead` event should show as 1 unique event despite 2 signals (browser + CAPI). If it shows 2 unmatched events, the `event_id` is not matching — confirm the UUID generated at submit time in `AnalyzerForm.tsx` is present in the `event_id` field of the payload sent to `submitAnalysis`.

---

## 11. Known Launch Blockers

These must be resolved before flipping production traffic:

| # | Blocker | Owner | Resolution |
|---|---|---|---|
| LB-1 | `DATABASE_URL` must use Supabase pooler URL (port 6543), not direct URL (port 5432) | You | Update env var in hosting provider |
| LB-2 | `pnpm prisma migrate deploy` has not been run against the production database | You | Run before first deploy |
| LB-3 | PDFMonkey template must be published (not draft) and template variables must be configured in the PDFMonkey dashboard | You | Publish template; add `CALENDLY_URL`, logo URLs in PDFMonkey |
| LB-4 | All 28 `fsiq_*` GHL custom fields must exist in the target sub-account before first submission | You | Create fields in GHL |
| LB-5 | GHL Zapier automations must be mapped to `fsiq_communication_route` values before launch | You | Wire Zapier zaps for all 10 route values |
| LB-6 | `GHL_ACCESS_TOKEN` expires — confirm it is non-expiring or has a refresh mechanism | You | Use a long-lived token or plan for rotation |
| LB-7 | No retry worker for failed PDFs or GHL syncs | Known gap | Document manual retry process for ops; build worker post-launch |
| LB-8 | `HEADLESS_ENABLED` cannot be used on Vercel without Chromium | Known gap | Leave disabled; accept `plausible_unverified` for JS-heavy sites |
| LB-9 | Prisma schema datasource has no `pgbouncer=true` parameter | May be needed | Test connection stability under load; add if connections are exhausted |

---

## 12. Go / No-Go Checklist

Confirm every item before routing production traffic.

### Infrastructure
- [ ] Staging deploy succeeds with zero build errors
- [ ] `DATABASE_URL` uses Supabase connection pooler (port 6543)
- [ ] `pnpm prisma migrate deploy` run against production DB; migration status shows 1 applied
- [ ] Test DB write: submit once, confirm row appears in Supabase

### PDFMonkey
- [ ] Template is published (not draft)
- [ ] Template variables configured: `CALENDLY_URL`, `FSIQ_LOGO_DARK_URL`, `FSIQ_LOGO_LIGHT_URL`, `FSIQ_IQ_LOGO_URL`
- [ ] Scenario A produces a complete 6-page PDF; all pages pass visual review
- [ ] PDF download URL opens in private browser window

### GHL
- [ ] All 28 `fsiq_*` custom fields exist in the sub-account
- [ ] `GHL_LOCATION_ID` matches the target sub-account
- [ ] `GHL_ACCESS_TOKEN` is valid and non-expired
- [ ] Scenario A: contact created in GHL with `fsiq_lead_status = qualified_full_pdf_ready`
- [ ] Scenario A: `fsiq_pdf_url` is populated in GHL contact
- [ ] Scenario A: Zapier fires full report email with working PDF link
- [ ] Scenario C: DQ contact created with correct route and no PDF link
- [ ] All Zapier zaps mapped for all 10 `fsiq_communication_route` values

### Meta Tracking
- [ ] `NEXT_PUBLIC_META_PIXEL_ID` and `META_PIXEL_ID` set to the same production pixel ID
- [ ] `META_TEST_EVENT_CODE` confirmed blank in production env vars
- [ ] Scenario A: browser `Lead` event visible in Pixel Helper
- [ ] Scenario A: CAPI `Lead` event visible in Meta Events Manager with matching `event_id` (deduplication confirmed)
- [ ] Scenario A: `QualifiedLead` CAPI event appears in Events Manager with `ql-` prefix
- [ ] Scenario C: CAPI `Lead` fires; `QualifiedLead` does NOT appear

### Admin
- [ ] `ADMIN_ACCESS_TOKEN` set to a 32+ char random string
- [ ] Admin login works at `/admin/login`
- [ ] Submission list shows all staging test submissions
- [ ] Manual review panel is actionable on Scenario G submission

### Security
- [ ] No real API keys or tokens in any committed file
- [ ] `.env.local` is not tracked by git (`git status` shows it absent)
- [ ] Admin cookie is HttpOnly (inspect browser dev tools → Application → Cookies)
- [ ] Error fields in admin detail view do not show raw Bearer tokens

### Tests
- [ ] `pnpm tsc --noEmit` → 0 errors
- [ ] `pnpm lint` → 0 warnings
- [ ] `pnpm test` → 589/589 passing
- [ ] `pnpm build` → build succeeds

### End-to-End Sign-Off
- [ ] Scenario A: qualified full PDF — DB ✅, PDF ✅, GHL ✅, email ✅, Meta ✅
- [ ] Scenario B: qualified conservative PDF — DB ✅, PDF ✅, GHL ✅, email ✅, Meta ✅
- [ ] Scenario C: national chain DQ — DB ✅, GHL ✅, DQ email ✅, CAPI Lead ✅, QualifiedLead absent ✅
- [ ] Scenario D: invalid website DQ — DB ✅, GHL ✅, DQ email ✅, CAPI Lead ✅, QualifiedLead absent ✅
- [ ] Scenario E: below threshold DQ — DB ✅, GHL ✅, DQ email ✅
- [ ] Scenario H: Cloudflare site (`spiritscenla.com`) — `finalDecision` is not `invalid_website` ✅
