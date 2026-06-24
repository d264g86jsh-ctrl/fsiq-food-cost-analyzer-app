# GHL / Zapier Email Handoff Contract — FSIQ Food Cost Analyzer

**Related:** `docs/meta-tracking.md` (attribution flow) · `docs/architecture.md` · `docs/environment.md`  
**Status:** Authoritative reference for v1 app → GHL integration.

The app is the workflow brain. GHL/Zapier owns customer-facing emails and funnel automation.
The app never sends email directly. It outputs a complete, final lead record to GHL
after all processing is done.

---

## Responsibility Split

### App-owned (never delegated to GHL/Zapier)

- Form validation and website reachability checks
- Qualification and DQ logic
- Savings formula and all deterministic math
- AI Research and Narrative generation
- PDFMonkey generation (direct API call — no Zapier)
- `pdfDownloadUrl` confirmation before GHL sync for PDF-eligible leads
- Lead status assignment (`fsiq_lead_status`)
- Communication route assignment (`fsiq_communication_route`)
- CRM tag list assembly
- All GHL custom field values
- DB persistence (app DB is the source of truth)
- Single final GHL handoff after processing is complete

### GHL/Zapier-owned (never hardcoded in app)

- Customer-facing email subject lines
- Customer-facing email body copy
- Calendly booking link copy
- Follow-up sequences and nurture automation
- Pipeline stage assignment within GHL
- Email send timing and scheduling

---

## v1 Handoff Rule: Single Final Sync After Processing

The app syncs to GHL **once**, after the lead route is fully determined. There is no
early "submitted" sync before processing completes in v1.

```
Form submit
  → DB save
  → Website validation
  → Qualification
  → [If PDF eligible]: AI pipeline → PDFMonkey → confirm pdfDownloadUrl
  → Assign fsiq_lead_status + fsiq_communication_route + tags
  → Single final GHL handoff
```

**GHL/Zapier automation triggers only after receiving the final handoff.**

A two-stage sync (early "submitted" tag + final routing sync) is documented here as
an optional future pattern — it is not implemented in v1.

---

## PDF URL Handoff Rules

These rules are non-negotiable. Violating them causes GHL/Zapier to send report
emails before the PDF is ready.

| Lead type | GHL sync condition |
|---|---|
| Qualified — full PDF | Sync only after `pdfDownloadUrl` is non-null and confirmed usable |
| Qualified — conservative PDF | Sync only after `pdfDownloadUrl` is non-null and confirmed usable |
| Qualified — PDF generation started, URL not yet confirmed | Do NOT sync; use `fsiq_lead_status = qualified_pdf_pending` |
| DQ (any reason) | Sync once DQ route is known — no PDF URL required |
| Manual review | Sync with `manual_review_hold` route — no PDF-ready tag |
| PDF failed | Sync with `pdf_failure_hold` route — no PDF-ready tag; no report email |

**Never send `FSIQ Full PDF Ready` or `FSIQ Conservative PDF Ready` until `pdfDownloadUrl` exists.**

---

## Lead Status Values (`fsiq_lead_status`)

| Value | Meaning |
|---|---|
| `qualified_pdf_pending` | Qualified, PDF generation started or doc ID exists, `pdfDownloadUrl` not yet confirmed — GHL sync deferred |
| `qualified_full_pdf_ready` | Full personalized PDF generated, `pdfDownloadUrl` confirmed — ready for report email |
| `qualified_conservative_pdf_ready` | Conservative PDF generated, `pdfDownloadUrl` confirmed — ready for report email |
| `disqualified_invalid_website` | 404/NXDOMAIN — DQ email route |
| `disqualified_below_threshold` | Spend < $600K — DQ email route |
| `disqualified_national_chain` | National chain detected — DQ email route |
| `disqualified_clear_non_fit` | Other clear non-fit (non-restaurant, non-operator, etc.) |
| `disqualified_non_us` | Non-US location detected — kept separate for distinct GHL messaging |
| `manual_review_required` | Flagged for human review before any automation fires |
| `pdf_failed` | Qualified, route determined, but PDFMonkey call failed — no report email |
| `workflow_failed` | Pipeline error before route could be determined |

---

## Communication Route Values (`fsiq_communication_route`)

GHL/Zapier uses this field as the primary automation trigger.

| Value | GHL/Zapier action |
|---|---|
| `send_full_report` | Send full report email with `fsiq_pdf_url` + Calendly CTA |
| `send_conservative_report` | Send conservative report email with `fsiq_pdf_url` + Calendly CTA |
| `send_dq_invalid_website` | Send "quick check" DQ email — no PDF URL |
| `send_dq_below_threshold` | Send "below threshold" DQ email — no PDF URL |
| `send_dq_national_chain` | Send "national chain" DQ email — no PDF URL |
| `send_dq_clear_non_fit` | Send polite ineligible message — no PDF URL, no harsh language |
| `send_dq_non_us` | Send polite non-US message — no PDF URL, no country-hostile language |
| `manual_review_hold` | Human must review before any automation fires |
| `pdf_failure_hold` | PDF failed — no report email until PDF is retried and URL confirmed |
| `no_email_hold` | Permanent hold (test submissions, internal, spam-like records) |

---

## GHL Custom Fields

All fields prefixed `fsiq_` to avoid collisions with other GHL integrations.

**GHL key resolution:** GHL's Contact API v2021-07-28 accepts custom field values by bare key (e.g. `fsiq_lead_source`) even though GHL internally stores the field with a `contact.` prefix (`contact.fsiq_lead_source`). The `contact.` prefix is cosmetic in the field listing — bare keys resolve correctly on write. Confirmed in production. **Exception:** two fields whose display names were slugified differently by GHL — the app uses `fsiq_fb_ad_id` and `fsiq_fb_click_id` as the write keys for the `fbadid` and `fbclid` payloads (see `ghl.ts:buildCustomFields`).

### Identity / contact

| Field | Value source |
|---|---|
| `fsiq_submission_id` | App DB `id` (cuid) |
| `fsiq_full_name` | Form `fullName` |
| `fsiq_email` | Form `email` |
| `fsiq_phone` | Form `phone` (optional) |

### Restaurant profile (form answers)

| Field | Value source |
|---|---|
| `fsiq_restaurant_name` | Form `restaurantName` |
| `fsiq_website` | Form `website` |
| `fsiq_concept_type` | Form `conceptType` |
| `fsiq_locations` | Form `locations` |
| `fsiq_annual_food_spend` | Form `annualFoodSpend` (raw dropdown value) |
| `fsiq_distributor_type` | Form `distributorType` |
| `fsiq_procurement_strategy` | Form `procurementStrategy` |
| `fsiq_top_skus` | Form `topSkus` (free text) |

### Qualification and routing

| Field | Value source |
|---|---|
| `fsiq_lead_status` | `LeadStatus` value (see above) |
| `fsiq_communication_route` | `CommunicationRoute` value (see above) |
| `fsiq_qualified` | Boolean — `true` / `false` |
| `fsiq_final_decision` | `finalDecision` from validation |
| `fsiq_country_eligibility` | `countryEligibility` from validation |
| `fsiq_dq_reason` | `dqReason` if disqualified, else empty |

### Savings estimates (qualified leads only)

| Field | Value source |
|---|---|
| `fsiq_estimated_savings` | `dollarEstimateDisplay` (e.g. "$147,000") |
| `fsiq_final_pct` | `finalPctDisplay` (e.g. "7.4%") |
| `fsiq_spend_bucket` | `spendBucket` (e.g. "$1M–$3M") |

### PDF

| Field | Value source |
|---|---|
| `fsiq_pdf_mode` | `pdfMode` — `full` / `conservative` / null |
| `fsiq_pdf_status` | `pdfStatus` — `complete` / `error` / `skipped` / `pending` |
| `fsiq_pdf_url` | `buildReportUrl(submissionId)` = `https://app.foodserviceiq.com/report/{id}` — the **proxy route**, not the raw PDFMonkey URL. Only set when `pdfDownloadUrl` is confirmed non-null. Verified working in production (email links resolve and display PDF inline). |
| `fsiq_pdf_ready_at` | ISO timestamp when `pdfDownloadUrl` was confirmed |

### Traffic attribution
Decoded UTM/Meta params from the user's landing URL. All `fsiq_utm_*` fields are optional (omitted if null). The `fsiq_lead_source` value is always set (derived). The full set is also sent as `attributionSource` in the GHL contact create body to populate the native "Source of Traffic" attribution panel.

| Field | Value source |
|---|---|
| `fsiq_lead_source` | Derived: `meta` / `google` / `organic` / `direct` |
| `fsiq_utm_source` | `utm_source` param |
| `fsiq_utm_medium` | `utm_medium` param (decoded — `+` → space) |
| `fsiq_utm_campaign` | `utm_campaign` param (decoded) |
| `fsiq_utm_content` | `utm_content` param (decoded) |
| `fsiq_utm_term` | `utm_term` param |
| `fsiq_utm_id` | `utm_id` param (Meta campaign numeric ID) |
| `fsiq_fbadid` | `fbadid` param (Meta ad creative ID) |
| `fsiq_fbclid` | `fbclid` param (Facebook click ID) |
| `fsiq_referrer` | First-touch `document.referrer` |
| `fsiq_landing_page_url` | Full first-touch URL including all query params |

### Workflow

| Field | Value source |
|---|---|
| `fsiq_manual_review_required` | Boolean |
| `fsiq_workflow_status` | `workflowStatus` |
| `fsiq_workflow_stage` | `workflowStage` |

---

## GHL Tags

Applied by the app at sync time. GHL/Zapier automation is triggered by these tags.

### Always applied

| Tag | Condition |
|---|---|
| `FSIQ Analyzer Submitted` | Every completed submission that reaches GHL sync |

### PDF-ready tags (only after `pdfDownloadUrl` confirmed)

| Tag | Condition |
|---|---|
| `FSIQ Full PDF Ready` | `pdfMode = full` AND `pdfDownloadUrl` non-null |
| `FSIQ Conservative PDF Ready` | `pdfMode = conservative` AND `pdfDownloadUrl` non-null |

### DQ tags

| Tag | Condition |
|---|---|
| `FSIQ DQ Invalid Website` | `dqReason = invalid_website` |
| `FSIQ DQ Below Threshold` | `dqReason = below_threshold` or `below_minimum` |
| `FSIQ DQ National Chain` | `dqReason = national_chain` |
| `FSIQ DQ Clear Non Fit` | `dqReason = clear_non_fit` (non-US excluded — see below) |
| `FSIQ Non US` | `countryEligibility = non_us` — distinct from other clear non-fits |

### State / hold tags

| Tag | Condition |
|---|---|
| `FSIQ Qualified` | `qualified = true` (regardless of PDF outcome) |
| `FSIQ Manual Review` | `manualReviewRequired = true` |
| `FSIQ PDF Failed` | `pdfStatus = error` on a qualified lead |
| `FSIQ Workflow Failed` | `workflowStatus = failed` before route was determined |

### Attribution tag

| Tag | Condition |
|---|---|
| `FSIQ Meta Lead` | `leadSource === 'meta'` (fbclid present OR utm_source is facebook/instagram/fb/ig/meta) — applied on BOTH qualified and DQ paths |

### Heuristic tags (applied by Phase 8 heuristics)

| Tag | Condition |
|---|---|
| `FSIQ Possible Test Submission` | Heuristic: test-like name/email/website |
| `FSIQ Possible Spam Submission` | Heuristic: spam signals |

---

## Email / Funnel Automation Trigger Rules (GHL/Zapier)

These rules live in GHL/Zapier — they are documented here so the app and GHL stay aligned.

### Report emails (require PDF URL)

Trigger report email when **all three** conditions are met:
1. `fsiq_communication_route` = `send_full_report` OR `send_conservative_report`
2. `fsiq_pdf_url` is present and non-empty
3. Tag `FSIQ Full PDF Ready` OR `FSIQ Conservative PDF Ready` is applied

**Do not send report email if any condition is missing.**

### DQ emails (no PDF URL required)

Trigger DQ email when:
1. `fsiq_communication_route` starts with `send_dq_`
2. Matching DQ tag is present

### Hold routes (no email)

Do NOT trigger any email when `fsiq_communication_route` is:
- `manual_review_hold`
- `pdf_failure_hold`
- `no_email_hold`

> ⚠️ **Superseded for `FSIQ Workflow Failed` (verified 2026-06-23).** This section described
> `workflow_failed` / `FSIQ Workflow Failed` as a no-email hold route. The **live** GHL workflow
> "Webhook (Analyzer) V3" (confirmed in the workflow builder) **does send an email** on the
> `FSIQ Workflow Failed` tag — it is branch 8 ("Fail"). The live workflow is authoritative. See
> `docs/email-templates.md` §1 and `docs/zapier-migration-build-spec.md`. The other hold routes
> (`manual_review_hold`, `pdf_failure_hold`, `no_email_hold`) are unaffected by this note.

---

## DQ Routing Rules

| `dqReason` | `fsiq_communication_route` | PDF required |
|---|---|---|
| `invalid_website` | `send_dq_invalid_website` | No |
| `below_threshold` / `below_minimum` | `send_dq_below_threshold` | No |
| `national_chain` | `send_dq_national_chain` | No |
| `clear_non_fit` (non-US) | `send_dq_non_us` | No |
| `clear_non_fit` (other) | `send_dq_clear_non_fit` | No |

---

## Manual Review Rules

- `manualReviewRequired = true` → `fsiq_communication_route = manual_review_hold`
- Apply tag `FSIQ Manual Review`
- Do **not** apply `FSIQ Full PDF Ready` or `FSIQ Conservative PDF Ready`
- GHL/Zapier must not trigger a report email for manual review leads
- Human reviews the lead in admin dashboard; manual follow-up is handled outside the app

---

## PDF Failure Rules

- `pdfStatus = error` on a qualified lead → `fsiq_communication_route = pdf_failure_hold`
- Apply tag `FSIQ PDF Failed`
- Do **not** apply `FSIQ Full PDF Ready` or `FSIQ Conservative PDF Ready`
- GHL/Zapier must not trigger a report email
- Phase 8 can retry PDF generation; once `pdfDownloadUrl` is confirmed, upgrade
  `fsiq_lead_status` to `qualified_full_pdf_ready` / `qualified_conservative_pdf_ready`
  and re-sync to GHL with the PDF-ready tag

---

## Phase 8 Orchestration Implications

Phase 8 (`src/actions/submitAnalysis.ts`) must enforce these rules:

1. **Single final GHL handoff.** Do not sync to GHL before the route is fully known.
2. **PDF URL gate.** For `send_full_report` / `send_conservative_report` routes, do not
   call the GHL sync function until `pdfDownloadUrl` is non-null and confirmed.
3. **DQ sync is immediate.** Once DQ reason is determined, PDF is skipped — sync to GHL
   right away with the DQ route and tags.
4. **Manual review hold.** Set `communication_route = manual_review_hold` and sync —
   no PDF-ready tag, no report email automation fires.
5. **PDF failure hold.** If PDFMonkey returns `pdfStatus = error`, sync with
   `pdf_failure_hold` — retry is a separate operation.
6. **Qualified + PDF pending.** If PDF generation starts but `pdfDownloadUrl` is not
   yet confirmed, set `fsiq_lead_status = qualified_pdf_pending` and defer GHL sync.
7. **All qualified routes require `pdfDownloadUrl` before PDF-ready tag is sent.**
8. **Tag assembly happens in the app** before calling the GHL sync function.
9. **Two-stage sync (early "submitted" + final routing) is optional/future** — not
   implemented in v1.
