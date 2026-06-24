# Email Migration — App → GHL Data Contract (Read-Only Audit)

**Purpose:** Map the exact data the FSIQ Food Cost Analyzer app emits to GoHighLevel so the
outbound transactional email send can be re-wired through Zapier → Microsoft 365/Outlook.
GHL remains the CRM and tagging/qualification brain; only the email *send* moves.

**Scope:** This is a read-only audit of the codebase as it exists today. No code was changed.

**Audit date:** 2026-06-23
**Repo:** `food-cost-analyzer` (Next.js App Router, TypeScript, Prisma/PostgreSQL)

---

## 0. TL;DR — How the app talks to GHL

The app performs a **single final GHL sync per submission** after the lead route is fully
determined. The sync is a two-call sequence to the GHL REST API
(`https://services.leadconnectorhq.com`, API version `2021-07-28`):

1. `POST /contacts` — creates the contact with **custom fields** (no tags).
2. `POST /contacts/{id}/tags` — applies **tags** (this is what fires GHL workflow triggers).

Both calls live in `syncToGhl()` in `src/lib/crm/ghl.ts`. Every code path that reaches GHL
builds a single typed object — `GhlHandoffPayload` (`src/lib/crm/ghl-types.ts`) — and passes
it to `syncToGhl()`. **That payload object is the complete data contract** for Zapier.

> **The app never sends email.** `src/lib/email/` and `src/lib/email/templates/` contain only
> empty `.gitkeep` files. All customer-facing email currently lives in the GHL/Zapier
> workflow (documented copy is in `docs/FSIQ_SOP_v3.3.md` — see §5).

---

## 1. Tag Inventory

**Definitions:** `src/lib/crm/ghl-tags.ts` (the `GHL_TAG` const, lines 10–39).
**Application:** `src/lib/crm/assign-lead-status.ts` (assembles the `tags` array per outcome)
and `src/actions/submitAnalysis.ts` (appends `FSIQ Meta Lead`).

Tags are applied via `POST /contacts/{id}/tags` in `ghl.ts:108`. The exact tag *strings* below
are what GHL receives — match Zapier triggers against these verbatim.

### 1a. Qualified outcome

| Exact tag string | Set at (file:line) | Trigger condition |
|---|---|---|
| `FSIQ Analyzer Submitted` | `assign-lead-status.ts:173,181` (and on every non-workflow-failed path) | Applied to every completed submission that reaches GHL sync |
| `FSIQ Qualified` | `assign-lead-status.ts:173,181,192` | `qualified = true` (engine qualified AND not clear_non_fit) |
| `FSIQ Full PDF Ready` | `assign-lead-status.ts:173` | `pdfStatus === 'complete'` AND `pdfDownloadUrl !== null` AND `pdfMode === 'full'` |
| `FSIQ Conservative PDF Ready` | `assign-lead-status.ts:181` | `pdfStatus === 'complete'` AND `pdfDownloadUrl !== null` AND `pdfMode === 'conservative'` |

**Qualified tag sets actually emitted (from `assignQualifiedStatus`, lines 162–206):**
- Full PDF ready → `['FSIQ Analyzer Submitted', 'FSIQ Qualified', 'FSIQ Full PDF Ready']`
- Conservative PDF ready → `['FSIQ Analyzer Submitted', 'FSIQ Qualified', 'FSIQ Conservative PDF Ready']`
- Qualified but PDF errored/skipped → `['FSIQ Analyzer Submitted', 'FSIQ Qualified', 'FSIQ PDF Failed']` (line 192)
- Qualified, PDF still pending (preliminary/never-confirmed) → `['FSIQ Analyzer Submitted', 'FSIQ PDF Failed']` (line 203) — **note: this fallback path omits `FSIQ Qualified` and applies `FSIQ PDF Failed`; see §1f.**

### 1b. Disqualified outcomes (each DQ reason/tag separate)

Assembled in `assignDqStatus()` (`assign-lead-status.ts:108–160`) and the `clear_non_fit`
priority block (`:82–97`). Every DQ set is prefixed with `FSIQ Analyzer Submitted`.

| DQ reason | Exact DQ tag string | Set at (file:line) | Trigger condition |
|---|---|---|---|
| National chain | `FSIQ DQ National Chain` | `assign-lead-status.ts:114` | `dqReason === 'national_chain'` |
| Invalid website | `FSIQ DQ Invalid Website` | `assign-lead-status.ts:122` | `dqReason === 'invalid_website'` (confirmed 404 / DNS NXDOMAIN only) |
| Below threshold | `FSIQ DQ Below Threshold` | `assign-lead-status.ts:131` | `dqReason === 'below_threshold'` **OR** `'below_minimum'` (both map to this one tag) |
| Clear non-fit (other) | `FSIQ DQ Clear Non Fit` | `assign-lead-status.ts:94,148,156` | `finalDecision === 'clear_non_fit'` and country is **not** non_us (also the `default` fallback) |
| Non-US | `FSIQ Non US` | `assign-lead-status.ts:87,141` | `finalDecision === 'clear_non_fit'` **AND** `countryEligibility === 'non_us'` (distinct from other clear-non-fit) |

Emitted DQ tag sets:
- National chain → `['FSIQ Analyzer Submitted', 'FSIQ DQ National Chain']`
- Invalid website → `['FSIQ Analyzer Submitted', 'FSIQ DQ Invalid Website']`
- Below threshold/minimum → `['FSIQ Analyzer Submitted', 'FSIQ DQ Below Threshold']`
- Clear non-fit → `['FSIQ Analyzer Submitted', 'FSIQ DQ Clear Non Fit']`
- Non-US → `['FSIQ Analyzer Submitted', 'FSIQ Non US']`

> DQ-reason source values come from `qualifyLead()` (`src/lib/qualification/qualify-lead.ts`):
> `'national_chain' | 'invalid_website' | 'below_threshold' | 'below_minimum' | 'clear_non_fit'`.
> Note `below_minimum` (spend < $50K) and `below_threshold` (spend < $600K) **collapse into the
> same tag/route** (`assign-lead-status.ts:126–133`).

### 1c. Hold / error states (no email should fire)

| Exact tag string | Set at (file:line) | Trigger condition |
|---|---|---|
| `FSIQ Manual Review` | `assign-lead-status.ts:74` | `manualReviewRequired === true` → set `['FSIQ Analyzer Submitted', 'FSIQ Manual Review']` |
| `FSIQ Workflow Failed` | `assign-lead-status.ts:64` | `workflowFailed === true` → set `['FSIQ Workflow Failed']` (note: **no** `FSIQ Analyzer Submitted` on this path) |
| `FSIQ PDF Failed` | `assign-lead-status.ts:192,203` | Qualified lead whose PDF errored/skipped or never confirmed a URL |

### 1d. Attribution tag (orthogonal — added on both qualified and DQ paths)

| Exact tag string | Set at (file:line) | Trigger condition |
|---|---|---|
| `FSIQ Meta Lead` | `submitAnalysis.ts:245` (DQ/early-exit path) and `submitAnalysis.ts:463` (qualified background path) | `leadSource === 'meta'` — appended to whatever tag set `assignLeadStatus` produced |

`leadSource` is derived by `deriveLeadSource(utm_source, fbclid)` (`src/lib/meta/lead-source.ts`):
`'meta'` when `fbclid` is present or `utm_source` ∈ {facebook, instagram, fb, ig, meta}.

### 1e. Defined-but-NOT-applied tags ⚠️

These two constants exist in `ghl-tags.ts:37–38` and are documented in
`docs/ghl-email-handoff.md:242–248`, but **no code path applies them anywhere** in the repo
(verified by grep — only the definitions and the doc reference exist):

| Exact tag string | Status |
|---|---|
| `FSIQ Possible Test Submission` | Defined only. The "Phase 8 heuristics" that would set it are **not implemented**. Will never arrive in GHL today. |
| `FSIQ Possible Spam Submission` | Defined only. Same — never applied. |

**Migration note:** do not build Zapier logic that waits on these two tags; they are dormant.

### 1f. Behavioral notes worth flagging for Zapier

- The `qualified_pdf_pending` fallback (`assign-lead-status.ts:200–205`) emits
  `['FSIQ Analyzer Submitted', 'FSIQ PDF Failed']` — it **drops `FSIQ Qualified`** and tags
  `FSIQ PDF Failed`. In the live qualified pipeline this preliminary state is overwritten by
  the final sync once the PDF resolves, so GHL normally sees the final tag set. Be aware the
  string `FSIQ PDF Failed` can appear on a lead that is genuinely qualified but mid-flight.
- `FSIQ Workflow Failed` is the only tag set that does **not** include `FSIQ Analyzer Submitted`.

---

## 2. Custom Field Inventory

**Type definition:** `src/lib/crm/ghl-types.ts` (`GhlHandoffPayload`, lines 11–71).
**Value assembly from DB record:** `buildGhlPayload()` in `src/lib/crm/build-ghl-payload.ts`.
**Serialization to GHL `customFields[]`:** `buildCustomFields()` in `src/lib/crm/ghl.ts:137–192`.

GHL receives custom fields as an array of `{ key, field_value }` objects (all values stringified).
GHL resolves the bare `fsiq_*` key on write (it stores them internally as `contact.fsiq_*`, which
is cosmetic). **Two keys diverge** — see the ⚠️ rows below.

### 2a. Identity / contact  ← (first name + email called out)

| GHL field key | Source (`build-ghl-payload.ts`) | Example value | Notes |
|---|---|---|---|
| `fsiq_full_name` | `submission.fullName` | `Roberto Sanchez` | **Full name.** First name is **not** stored as its own custom field. It is split inside `syncToGhl` (`ghl.ts:51–53`): `firstName = nameParts[0]`, `lastName = rest`, and written to GHL's **native** `firstName`/`lastName` contact fields (not a `fsiq_` custom field). |
| `fsiq_email` | `submission.email` | `roberto@casaroberto.com` | **Email.** Also used as the native GHL `email` on contact create (`ghl.ts:65`). This is the `To:` address for all email. |
| `fsiq_phone` | `submission.phone` (normalized) | `+15125551234` | Native GHL `phone` only set when present (`ghl.ts:66`). |
| `fsiq_phone_raw` | `rawPhone ?? submission.phoneRaw` | `(512) 555-1234` | Raw user input; pushed only when truthy (`ghl.ts:162`). |
| `fsiq_submission_id` | `submission.id` | `clx2a9f0b0000abcd1234efgh` | App DB cuid — stable join key. |

### 2b. Restaurant profile  ← (business name called out)

| GHL field key | Source | Example value |
|---|---|---|
| `fsiq_restaurant_name` | `submission.restaurantName` | `Casa Roberto` — **the restaurant/business name** for email personalization |
| `fsiq_website` | `submission.website` | `https://casaroberto.com` |
| `fsiq_concept_type` | `submission.conceptType` | `Fast casual` (one of: Quick service, Fast casual, Casual dining, Family dining, Full-service independent, Fine dining) |
| `fsiq_locations` | `submission.locations` | `2-4 locations` (one of: Single location, 2-4 locations, 5-10 locations, 10+ locations) |
| `fsiq_annual_food_spend` | `submission.annualFoodSpend` | `$1M–$3M` (raw dropdown: Under $600K, $600K–$800K, $800K–$1M, $1M–$3M, $3M–$7M, $7M+) |
| `fsiq_distributor_type` | `submission.distributorType` | `combination` (slug values: national_broadliners, combination, regional, local_specialty) |
| `fsiq_procurement_strategy` | `submission.procurementStrategy` | `negotiated_cost_plus` (slugs: market_price_single, market_price_multiple, negotiated_cost_plus) |
| `fsiq_top_skus` | `submission.topSkus` | `Ribeye, chicken breast, olive oil` (free text) |

### 2c. Qualification & routing (primary Zapier trigger fields)

| GHL field key | Source | Example value |
|---|---|---|
| `fsiq_lead_status` | `leadStatus` arg | `qualified_full_pdf_ready` (full list in §3c) |
| `fsiq_communication_route` | `communicationRoute` arg | `send_full_report` (full list in §3c) |
| `fsiq_qualified` | `submission.qualified === true` | `true` / `false` (stringified) |
| `fsiq_final_decision` | `submission.finalDecision` | `verified_restaurant` / `plausible_unverified` / `clear_non_fit` / `national_chain` / `invalid_website` |
| `fsiq_country_eligibility` | `submission.countryEligibility` | `us_verified` / `likely_us` / `unknown` / `non_us` |
| `fsiq_dq_reason` | `submission.dqReason` | `below_threshold` (only pushed when non-null, `ghl.ts:178`) |

### 2d. Savings / estimate values  ← (called out)

Populated only for qualified leads; **empty string `""` for DQ leads** (`build-ghl-payload.ts:52–58`).

| GHL field key | Source / formatting | Example (qualified) | Example (DQ) |
|---|---|---|---|
| `fsiq_estimated_savings` | `formatDollars(submission.dollarEstimate)` → `'$' + toLocaleString` | `$147,000` | `""` |
| `fsiq_final_pct` | `(round(finalPct*10)/10).toFixed(1) + '%'` | `5.8%` | `""` |
| `fsiq_spend_bucket` | `submission.spendBucket` | `$1M–$3M` | `""` |

### 2e. PDF fields  ← (PDF URL field called out)

| GHL field key | Source (`build-ghl-payload.ts:61–68`) | Example value | Notes |
|---|---|---|---|
| `fsiq_pdf_url` | `buildReportUrl(submission.id)` when `pdfDownloadUrl !== null`, else `null` | `https://app.foodserviceiq.com/report/clx2a9f0b0000abcd1234efgh` | **THE PDF link for the qualified email.** This is the app's **proxy route** (`/report/{id}`), NOT the raw PDFMonkey URL. Built by `src/lib/pdf/report-url.ts` = `${NEXT_PUBLIC_APP_URL}/report/{id}`. Only pushed to GHL when non-null (`ghl.ts:184`). |
| `fsiq_pdf_mode` | `submission.pdfMode` | `full` / `conservative` / null | Pushed only when non-null (`ghl.ts:181`). |
| `fsiq_pdf_status` | `submission.pdfStatus ?? 'pending'` | `complete` / `error` / `skipped` / `pending` | Always pushed. |
| `fsiq_pdf_ready_at` | `submission.updatedAt.toISOString()` when PDF confirmed | `2026-06-23T18:42:10.000Z` | Pushed only when non-null (`ghl.ts:187`). |

> **Booking / Calendly link:** there is **no `fsiq_calendly` or booking-URL custom field** in the
> payload. The Calendly link is **not** emitted by the app — it is hardcoded in the email templates
> (`https://calendly.com/neil-foodserviceiq/30min`; present only in the two qualified emails — see
> `docs/email-templates.md`). `CALENDLY_URL` exists as an env var (per `CLAUDE.md`) but is not part of
> the GHL payload.

### 2f. Traffic attribution (all optional — omitted when null)

Pushed conditionally in `ghl.ts:163–177`. Also mirrored into GHL's native `attributionSource`
panel on contact create via `buildAttributionSource()` (`ghl.ts:198–219`).

| GHL field key | Source | Notes |
|---|---|---|
| `fsiq_lead_source` | `submission.leadSource` | `meta` / `google` / `organic` / `direct` (always derived) |
| `fsiq_utm_source` | `submission.utmSource` | optional |
| `fsiq_utm_medium` | `submission.utmMedium` | optional |
| `fsiq_utm_campaign` | `submission.utmCampaign` | optional |
| `fsiq_utm_content` | `submission.utmContent` | optional |
| `fsiq_utm_term` | `submission.utmTerm` | optional |
| `fsiq_utm_id` | `submission.utmId` | optional |
| `fsiq_fb_ad_id` ⚠️ | `submission.fbadid` | **Write key differs from payload key.** Payload field is `fsiq_fbadid`; GHL key written is `fsiq_fb_ad_id` (`ghl.ts:174`). |
| `fsiq_fb_click_id` ⚠️ | `submission.fbclid` | **Write key differs.** Payload field `fsiq_fbclid` → GHL key `fsiq_fb_click_id` (`ghl.ts:175`). |
| `fsiq_referrer` | `submission.referrer` | optional |
| `fsiq_landing_page_url` | `submission.landingPageUrl` | optional |

### 2g. Workflow metadata

| GHL field key | Source | Example |
|---|---|---|
| `fsiq_manual_review_required` | `submission.manualReviewRequired` | `false` (stringified) |
| `fsiq_workflow_status` | `submission.workflowStatus ?? 'pending'` | `complete` / `partial` / `failed` / `in_progress` |
| `fsiq_workflow_stage` | `submission.workflowStage ?? ''` | `complete` |

---

## 3. GHL Sync Payload — Exact Code Path

### 3a. Path

| Step | File / function |
|---|---|
| Build typed payload from DB record | `buildGhlPayload(submission, leadStatus, communicationRoute, tags, rawPhone)` — `src/lib/crm/build-ghl-payload.ts:11` |
| Perform the sync (2 HTTP calls) | `syncToGhl(payload)` — `src/lib/crm/ghl.ts:32` |
| Serialize custom fields | `buildCustomFields(payload)` — `src/lib/crm/ghl.ts:137` |
| Native attribution panel | `buildAttributionSource(payload)` — `src/lib/crm/ghl.ts:198` |

### 3b. Endpoint / SDK calls

No SDK — raw `fetch` to the GHL REST API.

- **Base URL:** `process.env.GHL_API_BASE_URL ?? 'https://services.leadconnectorhq.com'` (`ghl.ts:23,28`)
- **Auth header:** `Authorization: Bearer ${GHL_ACCESS_TOKEN ?? GHL_API_KEY}` (`ghl.ts:26,45`)
- **Version header:** `Version: 2021-07-28` (`ghl.ts:47`)
- **Call 1 — create contact:** `POST {base}/contacts` (`ghl.ts:58`) — body carries `locationId`,
  `firstName`, `lastName`, `email`, optional `phone`, `customFields`, `attributionSource`.
  **Tags are deliberately NOT sent here.**
- **Call 2 — apply tags:** `POST {base}/contacts/{contactId}/tags` (`ghl.ts:108`) — body `{ tags: payload.tags }`.
  This is the call that **fires the GHL workflow trigger**.
- **Duplicate handling:** if create returns a duplicate error with `meta.contactId`, the app reuses
  that id and **skips field updates**, only applying tags (`ghl.ts:88–103`). So for an existing
  contact, custom fields are NOT refreshed — only tags land.

### 3c. Enumerated routing values in the payload

`fsiq_lead_status` (`src/lib/crm/lead-status.ts:9–29`): `qualified_pdf_pending`,
`qualified_full_pdf_ready`, `qualified_conservative_pdf_ready`, `disqualified_invalid_website`,
`disqualified_below_threshold`, `disqualified_national_chain`, `disqualified_clear_non_fit`,
`disqualified_non_us`, `manual_review_required`, `pdf_failed`, `workflow_failed`.

`fsiq_communication_route` (`src/lib/crm/lead-status.ts:35–51`): `send_full_report`,
`send_conservative_report`, `send_dq_invalid_website`, `send_dq_below_threshold`,
`send_dq_national_chain`, `send_dq_clear_non_fit`, `send_dq_non_us`, `manual_review_hold`,
`pdf_failure_hold`, `no_email_hold`.

### 3d. The payload-building code (quoted)

`src/lib/crm/build-ghl-payload.ts:25–91`:

```ts
  return {
    // Identity / contact
    fsiq_submission_id:         submission.id,
    fsiq_full_name:             submission.fullName,
    fsiq_email:                 submission.email,
    fsiq_phone:                 submission.phone ?? null,
    fsiq_phone_raw:             resolvedRawPhone,

    // Restaurant profile
    fsiq_restaurant_name:       submission.restaurantName,
    fsiq_website:               submission.website,
    fsiq_concept_type:          submission.conceptType,
    fsiq_locations:             submission.locations,
    fsiq_annual_food_spend:     submission.annualFoodSpend,
    fsiq_distributor_type:      submission.distributorType,
    fsiq_procurement_strategy:  submission.procurementStrategy,
    fsiq_top_skus:              submission.topSkus,

    // Qualification and routing
    fsiq_lead_status:           leadStatus,
    fsiq_communication_route:   communicationRoute,
    fsiq_qualified:             qualified,
    fsiq_final_decision:        submission.finalDecision ?? '',
    fsiq_country_eligibility:   submission.countryEligibility ?? '',
    fsiq_dq_reason:             submission.dqReason ?? null,

    // Savings estimates — empty string for DQ leads
    fsiq_estimated_savings:     qualified && submission.dollarEstimate !== null
                                  ? formatDollars(submission.dollarEstimate)
                                  : '',
    fsiq_final_pct:             qualified && submission.finalPct !== null
                                  ? `${(Math.round(submission.finalPct * 10) / 10).toFixed(1)}%`
                                  : '',
    fsiq_spend_bucket:          submission.spendBucket ?? '',

    // PDF
    fsiq_pdf_mode:              submission.pdfMode ?? null,
    fsiq_pdf_status:            submission.pdfStatus ?? 'pending',
    fsiq_pdf_url:               submission.pdfDownloadUrl !== null
                                  ? buildReportUrl(submission.id)
                                  : null,
    fsiq_pdf_ready_at:          submission.pdfDownloadUrl !== null
                                  ? submission.updatedAt.toISOString()
                                  : null,
    // ... (traffic attribution + workflow fields) ...
    // Tags assembled by assignLeadStatus — applied at sync time
    tags,
  };
```

The contact-create body and custom-field serialization (`src/lib/crm/ghl.ts:58–72`):

```ts
    const createRes = await fetch(`${apiBase}/contacts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        locationId,
        firstName,
        lastName,
        email: payload.fsiq_email,
        ...(payload.fsiq_phone ? { phone: payload.fsiq_phone } : {}),
        customFields: buildCustomFields(payload),
        ...buildAttributionSource(payload),
      }),
      signal: AbortSignal.timeout(10_000),
    });
```

```ts
    // Step 2: apply tags via the dedicated tags endpoint.
    const tagsRes = await fetch(`${apiBase}/contacts/${contactId}/tags`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tags: payload.tags }),
      signal: AbortSignal.timeout(10_000),
    });
```

---

## 4. Trigger Sources (Entry Points)

There is exactly **one** user-facing submission entry point that drives GHL sync, plus one
admin re-sync. There is no separate "form submit" vs "restaurant submit" — they are the same form.

| Entry point | File | Reaches GHL? | How it maps to tags/fields |
|---|---|---|---|
| **Analyzer form submit** (the only public submit) | UI: `src/components/analyzer/AnalyzerForm.tsx` `handleSubmit` (line 255) → calls server action `submitAnalysis(payload)` (`AnalyzerForm.tsx:336`) | **Yes** | `src/actions/submitAnalysis.ts` runs DB save → validation → qualification → (qualified) AI+PDF → `assignLeadStatus` → `buildGhlPayload` → `syncToGhl`. Two sync sites: DQ/early-exit `syncAndReturn` (`submitAnalysis.ts:576–577`) and qualified background `waitUntil` (`submitAnalysis.ts:475–476`). |
| **Website validation** (field blur + pre-submit gate) | action `src/actions/validateWebsite.ts` → `runValidation` | **No** | Read-only; "Does not write to the database" (file header). No GHL contact, no tags. Just returns a `ValidationResult` to the form. Not an email trigger. |
| **Admin "Retry GHL Sync"** | UI: `src/components/admin/RetryGhlButton.tsx` → action `retryGhlSync` in `src/actions/admin.ts:32` | **Yes** | Rebuilds status from current DB state via `assignLeadStatus` (`admin.ts:45–55`), then `buildGhlPayload` + `syncToGhl` (`admin.ts:57–58`). Same payload shape; re-fires the same tags. Note: `rawPhone` arg is omitted here, so it falls back to `submission.phoneRaw`. |

**Mapping by outcome (decided in `assignLeadStatus`, driven by `submitAnalysis.ts` steps 1–4):**
- Form values → DB `Submission` (`submitAnalysis.ts:98–130`) → become the `fsiq_*` profile fields.
- `runValidation` → `finalDecision` + `countryEligibility` → drive clear_non_fit / non_us routing.
- `qualifyLead` → `qualified` + `dqReason` → drive qualified vs DQ tag/route selection.
- PDF result (`pdfMode`/`pdfStatus`/`pdfDownloadUrl`) → drive PDF-ready tags + `fsiq_pdf_url`.
- `leadSource === 'meta'` → appends `FSIQ Meta Lead`.

---

## 5. Email Copy Check

**No email subject lines or body copy exist in the application code.**
`src/lib/email/` and `src/lib/email/templates/` contain only empty `.gitkeep` files. There is no
mailer dependency in `package.json` (no nodemailer/resend/sendgrid/postmark/SES/SMTP). The
`send-email.ts` referenced in `CLAUDE.md` does not exist — the directory is a reserved stub.
This is by design: `docs/ghl-email-handoff.md:6` — *"The app never sends email."*

**Canonical email copy lives in [`docs/email-templates.md`](./email-templates.md).** That file is the
single source of truth for all 9 transactional emails (exact HTML, From name/email, subjects, merge
fields), plus a Tag→Email mapping, reconciliation notes, and copy QA flags. The copy that previously
appeared inline in `docs/FSIQ_SOP_v3.3.md` (§12 DQ emails, §21 qualified email) was **outdated** and has
been replaced with a pointer to the canonical doc.

### 5.1 Current state (supersedes prior SOP-derived copy)

- **9 emails**, all sent **From `Robert Ferreira <rob@foodserviceiq.com>`** (the Microsoft 365 mailbox
  the migration sends through). The old copy was sent under "The FoodServiceIQ Team".
- **Merge fields** are now GHL contact fields — `{{contact.first_name}}`, `{{contact.fsiq_restaurant_name}}`,
  `{{contact.fsiq_pdf_url}}`, `{{contact.fsiq_final_pct}}`, `{{contact.fsiq_estimated_savings}}` — not the
  old Zapier step refs (`{{Step 4 → …}}`, `{{Step 19 → download_url}}`).
- **Recipient** is the GHL contact email → app field **`fsiq_email`**.
- **Qualified-email PDF button** now links to **`{{contact.fsiq_pdf_url}}`** (the app proxy route
  `/report/{id}`, already in the GHL payload — see §2e). This **supersedes** the prior behavior where the
  button used a PDFMonkey `download_url` regenerated inside Zapier (`{{Step 19 → download_url}}`).
- **Calendly CTA** is now `https://calendly.com/neil-foodserviceiq/30min` (was
  `…/15-minute-meeting-clone-1`). Present only in the two qualified emails.

### 5.2 Tag → Email mapping (all 9)

Full HTML and per-email detail in [`docs/email-templates.md`](./email-templates.md) §1–2. The **human
label** is for readability; the **authoritative trigger tag** is the verbatim string from
`src/lib/crm/ghl-tags.ts`. Where they differ, the app string wins. This block is identical to
`docs/email-templates.md` §1.

<!-- CANONICAL TAG→EMAIL TABLE — keep identical across docs/email-templates.md and docs/email-migration-data-contract.md -->

| # | Email (human label) | Authoritative trigger tag — verbatim app string | Subject | Merge fields used |
|---|---|---|---|---|
| 1 | Full PDF Ready | `FSIQ Full PDF Ready` | Your FoodServiceIQ Food Cost Analysis is ready | `first_name`, `fsiq_restaurant_name`, `fsiq_pdf_url`, `fsiq_final_pct`, `fsiq_estimated_savings` |
| 2 | Conservative PDF Ready | `FSIQ Conservative PDF Ready` | Your FoodServiceIQ Food Cost Analysis is ready | `first_name`, `fsiq_restaurant_name`, `fsiq_pdf_url`, `fsiq_final_pct`, `fsiq_estimated_savings` |
| 3 | DQ: Below Threshold | `FSIQ DQ Below Threshold` | Quick check on your FoodServiceIQ submission | `first_name`, `fsiq_restaurant_name` |
| 4 | DQ: Clear Non-Fit | `FSIQ DQ Clear Non Fit` | Thanks for using FoodServiceIQ's Food Cost Analyzer | `first_name`, `fsiq_restaurant_name` |
| 5 | DQ: Non-US | `FSIQ Non US` | Thanks for your interest in FoodServiceIQ | `first_name`, `fsiq_restaurant_name` |
| 6 | DQ: National Chain | `FSIQ DQ National Chain` | About your FoodServiceIQ submission | `first_name`, `fsiq_restaurant_name` |
| 7 | DQ: Invalid Website | `FSIQ DQ Invalid Website` | About your FoodServiceIQ submission | `first_name`, `fsiq_restaurant_name` |
| 8 | Fail | `FSIQ Workflow Failed` | Thanks for using FoodServiceIQ's Food Cost Analyzer | `first_name`, `fsiq_restaurant_name` |
| 9 | None | _else branch — no routing tag_ (only `FSIQ Analyzer Submitted` present) | Thanks for using FoodServiceIQ's Food Cost Analyzer | `first_name`, `fsiq_restaurant_name` |

**Notes on the trigger strings (verbatim from `src/lib/crm/ghl-tags.ts`):**
- Row 3 `FSIQ DQ Below Threshold` is applied for **both** DQ reasons `below_threshold` **and** `below_minimum` (`assign-lead-status.ts` `assignDqStatus`).
- Row 4 app string is `FSIQ DQ Clear Non Fit` — **no hyphen** (human label says "Clear Non-Fit").
- Row 5 app string is `FSIQ Non US` — **no "DQ" prefix and no hyphen** (human label says "Non-US"). The app does **not** write `FSIQ DQ Non US`.
- Rows 8–9 confirmed from the live **"Webhook (Analyzer) V3"** GHL workflow (verified in the workflow builder): **Fail** fires on `FSIQ Workflow Failed`; **None** is the **else branch** — the contact has only `FSIQ Analyzer Submitted` and no routing tag. ⚠️ This **overrides** `docs/ghl-email-handoff.md`, which describes `FSIQ Workflow Failed` as a no-email *hold route*: the live workflow **does send an email** on that tag, and the live workflow is authoritative.
- A qualified lead whose PDF failed carries `FSIQ Analyzer Submitted` + `FSIQ Qualified` + `FSIQ PDF Failed` (no PDF-ready tag). `FSIQ PDF Failed` is **not** one of the 8 routing tags, so such a contact matches no positive branch and falls to the **None** (else) email.

### 5.3 Reconciliation against the tag inventory (§1)

- **Match exactly:** Full PDF Ready (`FSIQ Full PDF Ready`), Conservative PDF Ready (`FSIQ Conservative PDF Ready`),
  DQ: Below Threshold (`FSIQ DQ Below Threshold`, covers `below_threshold` + `below_minimum`),
  DQ: National Chain (`FSIQ DQ National Chain`), DQ: Invalid Website (`FSIQ DQ Invalid Website`).
- **DQ: Clear Non-Fit** — the app string has no hyphen: **`FSIQ DQ Clear Non Fit`**. Trigger on that.
- **DQ: Non-US** — the app does **not** write `FSIQ DQ Non US`; it writes **`FSIQ Non US`** (no "DQ"
  prefix, no hyphen). Trigger the Non-US email on `FSIQ Non US`.
- **Fail / None — RESOLVED from the live workflow (2026-06-23).** Confirmed in the live "Webhook
  (Analyzer) V3" builder: **Fail** fires on **`FSIQ Workflow Failed`** (branch 8); **None** is the
  **else branch** (contact has only `FSIQ Analyzer Submitted`, no routing tag). ⚠️ Fail **overrides**
  `ghl-email-handoff.md` (§1c), which described `FSIQ Workflow Failed` as a no-email hold route — the
  live workflow sends an email on it and is authoritative. A qualified-but-PDF-failed contact
  (`FSIQ Qualified` + `FSIQ PDF Failed`, no PDF-ready tag) also matches no routing tag and lands in None.
- **`FSIQ Possible Test Submission` / `FSIQ Possible Spam Submission`** are defined but **never applied**
  (§1e) — no email uses them, correctly.

Full reconciliation + copy QA flags (resubmit-link inconsistency, `rob@` vs `robert@` sender mismatch,
Fail/None near-duplication) are in [`docs/email-templates.md`](./email-templates.md) §3–4.

---

## 6. Optional Outbound Webhook Hook (identification only — NOT implemented)

**Question:** if you later want the app to additionally POST a JSON payload to an external
webhook (e.g. a Zapier Catch Hook) so Zapier can trigger email **without** going through GHL —
where is the single cleanest place?

**Answer: inside `syncToGhl()` in `src/lib/crm/ghl.ts` (function starts line 32).**

Rationale:
- Every email-relevant code path — qualified background sync, DQ early-exit sync, and admin
  retry — converges on exactly one function call: `syncToGhl(payload)`. Adding one `fetch` to a
  `ZAPIER_CATCH_HOOK_URL` there (e.g. right after the function receives `payload`, fire-and-forget,
  non-fatal like the existing pattern) captures **100% of leads in one spot**, with zero changes to
  the three call sites.
- **Data in scope at that point is the complete contract:** the entire `GhlHandoffPayload`
  (`payload`) — all `fsiq_*` custom fields, the resolved `fsiq_lead_status` /
  `fsiq_communication_route`, savings values, `fsiq_pdf_url`, contact identity (email, full name,
  phone), attribution, and the final `tags[]` array. This object is already assembled and is exactly
  what Zapier would need to route + personalize an email — no extra DB fetch required.
- It is also the most maintainable: the payload shape is owned by `GhlHandoffPayload`, so the
  webhook body stays in sync with the GHL contract automatically.

**Single named target:** `src/lib/crm/ghl.ts` → `syncToGhl(payload: GhlHandoffPayload)`.
Emit `JSON.stringify(payload)` (optionally augmented with the split `firstName`/`lastName` that
`syncToGhl` already computes at lines 51–53) to the catch hook.

**Alternative (if you want app-DB-state rather than the in-flight payload):** the three call sites
in `src/actions/submitAnalysis.ts` (qualified: ~line 475; DQ: ~line 576) and
`src/actions/admin.ts` (~line 57) each hold a fresh `Submission` record (`fresh` / `submission`)
plus the computed `finalStatus`/`status`. Hooking there gives access to the full DB row (including
fields not in the GHL payload). But it requires touching three places instead of one, so
`syncToGhl` remains the cleanest single point.

> Per audit scope: nothing above was implemented. This section only identifies the location.

---

## Appendix — Files audited

- `src/lib/crm/ghl.ts` (sync + endpoints + custom-field serialization)
- `src/lib/crm/build-ghl-payload.ts` (payload assembly)
- `src/lib/crm/ghl-types.ts` (`GhlHandoffPayload` contract)
- `src/lib/crm/ghl-tags.ts` (`GHL_TAG` constants)
- `src/lib/crm/lead-status.ts` (`LEAD_STATUS`, `COMMUNICATION_ROUTE` enums)
- `src/lib/crm/assign-lead-status.ts` (tag/route/status assignment)
- `src/actions/submitAnalysis.ts` (pipeline + 2 sync sites)
- `src/actions/admin.ts` (`retryGhlSync`)
- `src/actions/validateWebsite.ts` (non-syncing entry point)
- `src/lib/qualification/qualify-lead.ts` (DQ reasons)
- `src/lib/pdf/report-url.ts` (`fsiq_pdf_url` builder)
- `src/lib/analyzer/form-types.ts` (dropdown example values)
- `src/components/analyzer/AnalyzerForm.tsx` (form entry)
- `src/lib/email/` + `src/lib/email/templates/` (empty stubs — no email code)
- `docs/ghl-email-handoff.md` (the authoritative documented contract)
- `docs/FSIQ_SOP_v3.3.md` (existing Zapier/Outlook email templates)
</content>
</invoke>
