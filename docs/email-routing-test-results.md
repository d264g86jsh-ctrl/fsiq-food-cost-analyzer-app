# Email Routing — Live Test Results

**Date:** 2026-06-23
**Script:** `scripts/test-email-routing.ts` (run via `npx tsx`)
**GHL location:** `TJiIGklYCODKR51wtbC2` (live)
**Recipient:** plus-addressed `rodrigo+<case>@foodserviceiq.com` → all deliver to rodrigo@foodserviceiq.com
**Status:** ✅ **All 9 reached GHL** — distinct contact created + exact tag set applied for each.

---

## What this test does (and its limits)

`submitAnalysis.ts` is a Next.js `'use server'` action and cannot run headless, so the script
**replicates `syncToGhl()`** (`src/lib/crm/ghl.ts`): `POST /contacts` (create + custom fields) then
`POST /contacts/:id/tags`. The **tags call is what fires** the GHL "Webhook (Analyzer) V3" enrollment +
branch + the migrated Zapier webhook → Outlook send. Tag sets are the **verbatim strings** the app
emits, derived from `src/lib/crm/assign-lead-status.ts` + `ghl-tags.ts`. Website validation / AI / PDF
generation were **not** run (tags forced); qualified `fsiq_pdf_url` is **synthetic**.

**Directly confirmed by this run:** GHL contact creation + exact tag application (HTTP 2xx) for all 9.
**NOT directly verified here (downstream — check GHL workflow history / Zapier task log / the inbox):**
that each GHL branch matched, the webhook fired, Zapier routed, and Outlook delivered.

Plus-addressing was used so each case is a **distinct GHL contact** (a shared address would let GHL
dedup collapse all 9 onto one contact) and the existing `rodrigo@` contact is untouched. All 9 returned
`created: true`, so this GHL location **allows duplicate emails** — 9 separate contacts exist.

---

## Results (all 9)

| # | Webhook tag | Restaurant name | Completed → GHL? | Exact GHL tag(s) applied | Contact ID | PDF URL | Error |
|---|---|---|---|---|---|---|---|
| 1 | `fsiq_full_pdf_ready` | TEST full_pdf_ready | ✅ created + tagged | `FSIQ Analyzer Submitted`, `FSIQ Qualified`, `FSIQ Full PDF Ready` | `RXzNmKFGXN98VxnfJvH2` | synthetic (see ⚠️) | — |
| 2 | `fsiq_conservative_pdf` | TEST conservative_pdf | ✅ created + tagged | `FSIQ Analyzer Submitted`, `FSIQ Qualified`, `FSIQ Conservative PDF Ready` | `27dhN6Jd9eSKpagmnzXc` | synthetic (see ⚠️) | — |
| 3 | `fsiq_dq_below_threshold` | TEST below_threshold | ✅ created + tagged | `FSIQ Analyzer Submitted`, `FSIQ DQ Below Threshold` | `G0JpbGPuTJ0H9Q4zLqtt` | — | — |
| 4 | `fsiq_clear_non_fit` | TEST clear_non_fit | ✅ created + tagged | `FSIQ Analyzer Submitted`, `FSIQ DQ Clear Non Fit` | `g5xME8qlcMq5uNdjrpyC` | — | — |
| 5 | `fsiq_non_us` | TEST non_us | ✅ created + tagged | `FSIQ Analyzer Submitted`, `FSIQ Non US` | `0RjX8eahbkYI8yOpFbyb` | — | — |
| 6 | `fsiq_dq_national_chain` | TEST national_chain | ✅ created + tagged | `FSIQ Analyzer Submitted`, `FSIQ DQ National Chain` | `Y354JPC3EGZZnQIQDXqD` | — | — |
| 7 | `fsiq_dq_invalid_website` | TEST invalid_website | ✅ created + tagged | `FSIQ Analyzer Submitted`, `FSIQ DQ Invalid Website` | `UpTlhiOn07G70dVvd7LD` | — | — |
| 8 | `fsiq_workflow_failed` | TEST workflow_failed | ✅ created + tagged ⚠️ | `FSIQ Analyzer Submitted`, `FSIQ Workflow Failed` | `0fo9eUAHDcqGTIpZhDH4` | — | — |
| 9 | `none` | TEST none | ✅ created + tagged | `FSIQ Analyzer Submitted`, `FSIQ Manual Review` | `U4upuWC22TlALTrOP4SP` | — | — |

All 9 created brand-new contacts; no existing contact was mutated.

---

## Flags / caveats

**⚠️ 1 — `fsiq_workflow_failed` (case 8) is not naturally reachable in production.**
`assign-lead-status.ts` emits `[FSIQ Workflow Failed]` **without** `FSIQ Analyzer Submitted`, and the
GHL workflow enrolls on `FSIQ Analyzer Submitted` being added — so a real workflow-failed contact would
never enroll. Moreover, in `submitAnalysis.ts` a failed pipeline `return fail()` **without syncing to
GHL at all**; the only emitter of `FSIQ Workflow Failed` is the admin `retryGhlSync` path. This test
**forced** the `[FSIQ Analyzer Submitted, FSIQ Workflow Failed]` combo so branch 8 could be exercised,
but **the app never produces that combo in normal flow** → branch 8 is effectively dead in prod.
Decision needed (live GHL/Zapier) on how a genuine pipeline failure should route, if at all.

**⚠️ 2 — `none` (case 9)** was tested via `[FSIQ Analyzer Submitted, FSIQ Manual Review]` (a real
manual-review tag set) which carries no routing branch tag → falls to the GHL else/None branch. A
qualified-but-PDF-failed lead (`FSIQ Qualified` + `FSIQ PDF Failed`) routes here too.

**⚠️ 3 — `fsiq_pdf_url` host/format is wrong in this env (real finding).** The synthetic URLs came out as
`https://fsiq-food-cost-analyzer-app.vercel.app//report/...` because `NEXT_PUBLIC_APP_URL` in
`.env.local` = `"https://fsiq-food-cost-analyzer-app.vercel.app/"` (trailing slash → double `//report`,
and the **Vercel host**, not `app.foodserviceiq.com`). `buildReportUrl()` (`src/lib/pdf/report-url.ts`)
builds the **real** `fsiq_pdf_url` from this var, so **real qualified emails' PDF links inherit both the
double-slash and the vercel host** wherever this env value is used. This is the **local** `.env.local`;
**verify the production Vercel `NEXT_PUBLIC_APP_URL`** — if it matches, qualified PDF links are malformed.
(The docs previously assumed `https://app.foodserviceiq.com/report/{id}`.)

**⚠️ 4 — Inbox delivery is not confirmed by this run.** Sends are downstream (webhook → Zapier →
Outlook) and go to the plus-addressed `rodrigo+<case>@foodserviceiq.com`. Delivery to the base inbox
depends on **Microsoft 365 plus-addressing (subaddressing)** being enabled on the tenant. Verify in the
inbox and in the Zapier task history. If plus-addressed mail does not arrive, that's an M365 config item,
not a routing failure.

**⚠️ 5 — Qualified PDF links won't render.** They are synthetic ids with no DB-backed submission, so
`/report/{id}` will 404. The qualified emails will *arrive and route* correctly; the PDF link is for
routing confirmation only. A true end-to-end PDF test requires a real DB-backed submission + PDF gen.

---

## Run 2 (re-run) — also all 9 ✅

Re-run of the same script. All 9 again created + tagged (HTTP 2xx), no errors. Because the location
allows duplicate emails, these are **9 additional new contacts** (≈18 test contacts total now).

| Webhook tag | Run 2 contact ID |
|---|---|
| `fsiq_full_pdf_ready` | `2Q8L4wBdVAo1x9lhvLVF` |
| `fsiq_conservative_pdf` | `QDV0fWjZkLJsvsBrqMgN` |
| `fsiq_dq_below_threshold` | `1qhM9O73fKiRiG7SYsFE` |
| `fsiq_clear_non_fit` | `CrF473f95v4t0hFwFmb5` |
| `fsiq_non_us` | `oGOg9KfTgY9X1ldxvgL5` |
| `fsiq_dq_national_chain` | `NRfx4isgeTf6Q5yat93g` |
| `fsiq_dq_invalid_website` | `NAd6ztw4nyMEM1eZBdqY` |
| `fsiq_workflow_failed` | `Mk9Z1dRdDYPaDbMO39Uh` |
| `none` | `DAHcXV6EUnSMN4GpOy7A` |

The same caveats apply (workflow_failed combo is forced; PDF URLs synthetic + malformed host; inbox
delivery via M365 plus-addressing unverified here).

## Cleanup

Across both runs, **18 test contacts** were created in GHL (run-1 and run-2 IDs in the tables above),
each named `Rodrigo <case>` with email `rodrigo+<case>@foodserviceiq.com` and a `TEST <case>` restaurant
name. Delete them in GHL when done; the script created nothing else (no DB rows, no PDFs). Each re-run
creates 9 more distinct contacts (duplicate emails are allowed on this location).
</content>
