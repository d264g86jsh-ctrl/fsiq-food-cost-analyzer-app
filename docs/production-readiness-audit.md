# Production Readiness Audit — FSIQ Food Cost Analyzer

**Date:** 2026-06-24
**Scope:** Read-only audit after the GHL → Zapier/Outlook email-send migration. No code/env/GHL/Zapier
changed. Findings only — nothing fixed.
**Method:** Source confirmed where cited (`file:line`). Where I infer rather than confirm from code (esp.
the live production Vercel env and live HTTP behavior), it is marked **[INFERRED]**.

**Headline rating: 🟡 YELLOW** — the happy path works and all 9 routes were manually confirmed sending,
but there is a likely customer-facing PDF-link defect (pending prod-env verification) and several
silent lead-loss paths with no alerting. Short, cheap blocker list; not green yet.

---

## 1. Routing & email integrity

### 1a. The 9 outcomes still map cleanly (confirmed: `src/lib/crm/assign-lead-status.ts`, `ghl-tags.ts`)

Each `assignLeadStatus` return emits exactly one routing tag (verbatim strings confirmed in `ghl-tags.ts`):

| Outcome | Emitted tag set (assign-lead-status.ts) | Branch tag | Maps cleanly? |
|---|---|---|---|
| Full PDF ready | `[Analyzer Submitted, Qualified, Full PDF Ready]` (L173) | `FSIQ Full PDF Ready` | ✅ |
| Conservative PDF ready | `[Analyzer Submitted, Qualified, Conservative PDF Ready]` (L181) | `FSIQ Conservative PDF Ready` | ✅ |
| DQ below threshold | `[Analyzer Submitted, DQ Below Threshold]` (L131) — covers `below_threshold` **and** `below_minimum` | `FSIQ DQ Below Threshold` | ✅ |
| DQ clear non-fit | `[Analyzer Submitted, DQ Clear Non Fit]` (L94/148/156) | `FSIQ DQ Clear Non Fit` | ✅ |
| DQ non-US | `[Analyzer Submitted, Non US]` (L87/141) | `FSIQ Non US` | ✅ |
| DQ national chain | `[Analyzer Submitted, DQ National Chain]` (L114) | `FSIQ DQ National Chain` | ✅ |
| DQ invalid website | `[Analyzer Submitted, DQ Invalid Website]` (L122) | `FSIQ DQ Invalid Website` | ✅ |
| Fail | `[Workflow Failed]` (L64) — **no Analyzer Submitted** | `FSIQ Workflow Failed` | ⚠️ see 1b |
| None (else) | n/a — contact has `Analyzer Submitted` + no branch tag | else branch | ⚠️ see 1b |

`FSIQ Meta Lead` may be appended on any path (`submitAnalysis.ts:245,463`) — orthogonal, not a router.
`FSIQ Possible Test/Spam Submission` exist in `ghl-tags.ts` but are **never applied** (no code path) —
confirmed; no email depends on them.

### 1b. The two known concerns — current status

**(a) `fsiq_workflow_failed` branch is effectively dead in production. [CONFIRMED from code]**
- `assignLeadStatus` only returns the Workflow-Failed result when `workflowFailed === true`
  (`assign-lead-status.ts:60`), and that return is **`tags: [GHL_TAG.WORKFLOW_FAILED]` only — it omits
  `FSIQ Analyzer Submitted`** (L64). The GHL workflow enrolls on *Analyzer Submitted added*, so a
  contact tagged only `Workflow Failed` **never enrolls** → branch 8 never fires.
- Worse: in `submitAnalysis.ts`, **every** `assignLeadStatus`/`needsAiAndPdf` call passes
  `workflowFailed: false` (L231, L242, L284, L460). A genuinely failed pipeline (validation or
  qualification throws) hits `return fail(...)` (L167, L221) and **never calls `syncToGhl` at all** —
  no contact, no tag, no email. The user sees "Analysis failed. Please try again."
- The **only** emitter of `FSIQ Workflow Failed` is the admin `retryGhlSync` path (`actions/admin.ts:54`,
  `workflowFailed: submission.workflowStatus === 'failed'`), which would create a contact tagged only
  `Workflow Failed` (no Analyzer Submitted) → still won't enroll.
- **Net:** a real failed pipeline is **dropped** (no email, no CRM contact), and branch 8 is unreachable
  by the live app. My routing test reached it only by **force-adding** `Analyzer Submitted` alongside
  `Workflow Failed` — a combination the app never produces.

**(b) `none` / manual-review fall-through — handled, but with wrong copy. [CONFIRMED from code]**
- A manual-review lead emits `[Analyzer Submitted, Manual Review]` (`assign-lead-status.ts:74`). It
  **enrolls** (has Analyzer Submitted) and matches **no** routing branch → falls to the **None/else**
  branch → it **does get an email** (not dropped). But the None email copy is the generic *"we weren't
  able to correctly fetch your profile… resubmit"* (`email-templates.md` §2.9) — **inappropriate** for a
  lead held for human review.
- Same fall-through hits a **qualified-but-PDF-failed** lead: `[Analyzer Submitted, Qualified, PDF
  Failed]` (`assign-lead-status.ts:192`) has no branch tag → None/else → the qualifying customer is told
  *"we couldn't fetch your profile, resubmit."* That is a **mishandled paying lead** (see §3).

### 1c. Outcomes a real submission can produce with NO email at all [CONFIRMED from code]

| Scenario | Result | Silent to user? |
|---|---|---|
| Validation/qualification throws (Step 3/4) | `return fail()`, **no GHL sync** → no contact, no email | No — user sees "Analysis failed." |
| Qualified background throws **before** the sync block (AI/logo/PDF-patch/unexpected) | outer `catch` only does `db.update({workflowStatus:'partial'})` (`submitAnalysis.ts:523-529`) — **no `syncToGhl`** → no contact, no email | **YES — user already saw the success screen** |
| `fresh = db.findUnique(...)` returns null in background or DQ path | `if (fresh)` guard skips sync (`submitAnalysis.ts:473/486/575`) → no contact, no email | **YES (qualified) / partial (DQ)** |
| `syncToGhl` returns error (GHL API down/4xx/timeout) | `crmSyncStatus='error'`, `workflowStatus='partial'`, **no contact/tag created** → no email; **no auto-retry** | **YES** — only visible via admin dashboard |

These are the highest-severity reliability gaps (see §3, §6). The common/happy path is fine; these fire
only on errors — but there is **no alerting**, so they are invisible.

---

## 2. The PDF URL bug — scope confirmed

**Where the var is read [CONFIRMED]:** only two places —
- `src/lib/pdf/report-url.ts:2` — `buildReportUrl()` = `` `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/report/${id}` `` — **no trailing-slash handling.**
- `src/lib/meta/meta-events.ts:12` — `(NEXT_PUBLIC_APP_URL ?? 'https://app.foodserviceiq.com').replace(/\/+$/, '')` — **strips trailing slash and defaults to the correct host.** A unit test even asserts this (`__tests__/meta-events.test.ts:172`). So Meta is immune.

**Local value [CONFIRMED]:** `.env.local` → `NEXT_PUBLIC_APP_URL="https://fsiq-food-cost-analyzer-app.vercel.app/"` (Vercel host **and** trailing slash).

**Blast radius [CONFIRMED scope, behavior partly INFERRED]:** the only place a malformed URL surfaces is
**`fsiq_pdf_url`** (`build-ghl-payload.ts:63-65`, set only when `pdfDownloadUrl !== null`), i.e. the
**PDF button in the two qualified emails** (Full + Conservative). With the local value it produces:
`https://fsiq-food-cost-analyzer-app.vercel.app//report/{id}` — two defects:
1. **Wrong host** — an unbranded Vercel preview URL in customer email (looks untrustworthy; not `app.foodserviceiq.com`).
2. **Double slash** `//report` — **[INFERRED]** likely 404s or misroutes under Next.js path handling; I did not hit the live route to confirm. Even with the correct host, the trailing slash reproduces this because `report-url.ts` (unlike `meta-events.ts`) does not strip it.

**Production value [CANNOT CONFIRM from repo]:** `.env.local` is the local file; the production Vercel
env var is not in the repo and I must not `vercel env pull`. **Action: verify with `vercel env ls`.**
The correct production value is **`https://app.foodserviceiq.com`** (no trailing slash). Note
`.env.example` does **not list `NEXT_PUBLIC_APP_URL` at all** (confirmed) — so a prod setup driven from
`.env.example` could leave it unset, in which case `buildReportUrl` yields `/report/{id}` (relative, host
missing) — also broken in email.

---

## 3. Submission → sync → PDF pipeline (trace of `src/actions/submitAnalysis.ts`)

Order: DB save → validation → qualification → (DQ/manual/non-fit: sync now) OR (qualified: return to
client, then background AI → logo → PDF → cache → GHL sync → Meta CAPI → final DB update).

| Step | Failure mode | User experience | Silent? | Live surface |
|---|---|---|---|---|
| 2 — `db.submission.create` (L98) | DB unreachable/constraint | "Failed to save submission. Please try again." | No | **PROD DB write** (Supabase pooler) |
| 3 — `runValidation` (L149) | Browserless/Google Places/Claude error or timeout | "Analysis failed. Please try again." | No | **External:** Browserless, Google Places, Anthropic |
| 4 — `qualifyLead` (L175) | throws (rare; pure logic) | "Analysis failed." | No | none |
| DQ/manual early exit — `syncAndReturn` → `syncToGhl` (L577) | GHL 4xx/timeout | DQ result shown; **but no GHL contact/tag → no DQ email**, `workflowStatus='partial'` | **YES** | **External: GHL**, PROD DB update |
| 7 — AI research (L299) | Claude error | handled — fallback narrative used | No (degraded) | **External: Anthropic** |
| 7.5 — logo fetch/process (L328) | fetch/parse error | handled — white-box fallback | No | External fetch |
| 9 — `generatePdf` (L384) | PDFMonkey error | captured as `pdfStatus='error'` → routes to **None email** (wrong copy) | **YES (mis-messaged)** | **External: PDFMonkey** |
| 9 — Supabase cache (L419) | storage error | non-fatal, logged | yes (non-fatal) | **External: Supabase Storage** |
| 10 — `syncToGhl` (L476) | GHL error | success screen already shown; **no contact/tag → no email**; no retry | **YES** | **External: GHL** |
| Background outer scope (L293-529) | **any unexpected throw before sync** | success screen already shown; outer `catch` updates DB only, **no sync** → no email | **YES** | PROD DB update |
| 10 — Meta CAPI (L497/600) | error | non-fatal, recorded | yes (non-fatal) | **External: Meta CAPI** |

**Live-traffic surface (writes/calls on a real submission):** PROD Supabase DB (create + multiple
updates), Browserless, Google Places, Anthropic (×2), PDFMonkey, Supabase Storage, GHL (create + tags),
Meta CAPI. Every qualified submission touches all of these.

**Most dangerous property [CONFIRMED]:** the qualified path returns success to the user **before** any of
AI/PDF/GHL run (`waitUntil` background). So **any** background failure that prevents the GHL sync results
in a customer who saw "your analysis is on its way" but receives **no email and has no CRM contact** —
and there is **no auto-retry and no alerting**. Recovery depends on a human noticing `workflowStatus =
partial/failed` in the admin dashboard and clicking "Retry GHL Sync."

---

## 4. Data & config hygiene

### 4a. TEST contacts to clean up [CONFIRMED — created by this session's routing tests]

Two runs of `scripts/test-email-routing.ts` created **18 live GHL contacts**, all named `Rodrigo <case>`,
email `rodrigo+<case>@foodserviceiq.com`, restaurant `TEST <case>`:

- Run 1: `RXzNmKFGXN98VxnfJvH2`, `27dhN6Jd9eSKpagmnzXc`, `G0JpbGPuTJ0H9Q4zLqtt`, `g5xME8qlcMq5uNdjrpyC`, `0RjX8eahbkYI8yOpFbyb`, `Y354JPC3EGZZnQIQDXqD`, `UpTlhiOn07G70dVvd7LD`, `0fo9eUAHDcqGTIpZhDH4`, `U4upuWC22TlALTrOP4SP`
- Run 2: `2Q8L4wBdVAo1x9lhvLVF`, `QDV0fWjZkLJsvsBrqMgN`, `1qhM9O73fKiRiG7SYsFE`, `CrF473f95v4t0hFwFmb5`, `oGOg9KfTgY9X1ldxvgL5`, `NRfx4isgeTf6Q5yat93g`, `NAd6ztw4nyMEM1eZBdqY`, `Mk9Z1dRdDYPaDbMO39Uh`, `DAHcXV6EUnSMN4GpOy7A`

**Recommend deleting all 18** before launch. The location **allows duplicate emails** (all 18 returned
`created:true`), so re-runs accumulate; and `syncToGhl`'s dedupe-and-apply-tags behavior (`ghl.ts:88-113`,
no tag removal) means a repeat real contact can **accumulate multiple routing tags**, which the GHL
first-match order resolves but which would muddy reporting. (`scripts/test-email-routing.ts` itself is a
test-only artifact — consider removing or gitignoring before launch.)

### 4b. Hardcoded test values / debug flags / staging URLs

- **Staging host via env, not hardcode:** no `vercel.app` literal in `src/` (confirmed) — it enters only
  through `NEXT_PUBLIC_APP_URL` (§2). The `localhost`/`127.0.0.1` matches are SSRF guards in
  `normalize-url.ts` / `pdfmonkey.ts` — legitimate.
- **Debug logs in prod paths [CONFIRMED]:** `[FSIQ DEBUG]` logs at `submitAnalysis.ts:295,474` plus many
  `[FSIQ LOGO]` / `[FSIQ PDF ...]` / `[PDF Proxy]` `console.log`s. Not breaking, but noisy and may leak
  submission IDs into logs. Recommend gating behind a debug flag or removing.
- **Sender/signature mismatch [CONFIRMED, prior QA flag still open]:** emails send From `rob@` but the
  signature/`mailto:` is `robert@foodserviceiq.com` (`email-templates.md` §4.2).

### 4c. Production env vars to set/verify in Vercel before launch

From `.env.example` + `CLAUDE.md` + code readers. **Bold = verify especially:**
- **`NEXT_PUBLIC_APP_URL`** → must be `https://app.foodserviceiq.com`, **no trailing slash** (and it is
  **missing from `.env.example`** — easy to forget). Drives §2.
- `DATABASE_URL` (pooler :6543, must keep `pgbouncer=true&connection_limit=1`), `DIRECT_URL` (migrations only)
- `ANTHROPIC_API_KEY`; `PDFMONKEY_API_KEY`, `PDFMONKEY_TEMPLATE_ID`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- `GHL_ACCESS_TOKEN` (or `GHL_API_KEY`), `GHL_LOCATION_ID`, `GHL_PIPELINE_ID`, `GHL_API_BASE_URL`
- `META_PIXEL_ID` / `NEXT_PUBLIC_META_PIXEL_ID`, `META_CONVERSIONS_API_TOKEN`, and **ensure
  `META_TEST_EVENT_CODE` is UNSET in prod** (test-event code leaks events to the Meta test stream if left set — [INFERRED] from standard Meta CAPI behavior).
- `ADMIN_ACCESS_TOKEN` (admin dashboard auth — must be strong in prod)
- Headless validation: `CLAUDE.md` references `BROWSERLESS_API_KEY`, but `.env.example` lists
  `HEADLESS_ENABLED` and **not** `BROWSERLESS_API_KEY` — **reconcile** which the prod path actually needs.
- **`OUTLOOK_CLIENT_ID/SECRET/TENANT_ID` are in `.env.example` but unused by app code** (no Outlook/Graph
  send code exists in `src/` — confirmed). The send is entirely Zapier-owned; these app env vars are
  vestigial/forward-looking and not required for the current pipeline.
- `CALENDLY_URL`, `FSIQ_LOGO_*` (PDF/branding).

---

## 5. Reply-To / deliverability

- Sends are **entirely Zapier→Outlook**; there is **no Outlook/Graph send code in the app** (confirmed).
  So reply routing is a Zapier/Outlook config concern, not app code.
- From `rob@foodserviceiq.com`, Reply-To `rob@` → **replies bypass GHL Conversations and the
  `foodservice-iq.com` forwarder.** [Stated by you; consistent with there being no app-side reply ingest.]
- **Two DQ emails actively invite replies [CONFIRMED in `email-templates.md`]:** Below Threshold —
  *"please don't hesitate to reply to this email"*; Non-US — *"just reply to this email and I'll add you
  to our list."* Those replies now land **only in the `rob@` mailbox**, are **not logged in GHL**, and
  the Non-US "add me to the launch list" intent has **no capture mechanism** — it relies on a human
  reading `rob@` and acting. High chance of dropped interest.
- **Docs that assume GHL logging:** `docs/ghl-email-handoff.md` lists "Follow-up sequences and nurture
  automation" and pipeline/Conversations handling as GHL-owned; the build spec left **Reply-To and the
  optional BCC-to-GHL-inbound as open TODOs**. Nothing in the **app** assumes replies log in GHL (the app
  never read replies), but the **process/docs** still imply GHL conversation capture that the new send
  path doesn't provide. Recommend a decision on Reply-To + BCC-to-GHL-inbound before inviting replies.

---

## 6. Go-to-market readiness assessment

**Rating: 🟡 YELLOW.** All 9 routes were manually confirmed sending, and the happy path (submit →
qualify → PDF → GHL tag → webhook → Outlook) is sound. But for *real money / real leads* there are a few
gaps that can silently lose or mis-serve customers. None is a large build; close the blockers and this is
green.

### BLOCKERS (fix before any real traffic)

1. **Verify & fix `NEXT_PUBLIC_APP_URL` in prod.** If prod equals the local value (vercel host + trailing
   slash), **every qualified email's PDF link is malformed** (unbranded host + `//report` likely 404 —
   host wrong is certain, 404 [INFERRED]). The PDF *is the product*. **Effort: trivial** (set env var to
   `https://app.foodserviceiq.com`, no trailing slash; redeploy). **Risk: low.** Caveat: `report-url.ts`
   doesn't strip a trailing slash (unlike `meta-events.ts`), so the env value must be exactly clean.
   **Must verify via `vercel env ls` — I cannot read prod env from the repo.**

2. **No visibility/retry on dropped syncs.** A qualified lead can see "success" yet get **no email and no
   CRM contact** if the background errors before sync, `fresh` is null, or `syncToGhl` errors — silently,
   with no alerting and only manual admin retry (§1c, §3). For real money this is a launch blocker: you
   won't know it's happening. **Effort: low–medium** (add an alert on `workflowStatus in (partial,failed)`
   / `crmSyncStatus='error'`, and/or an auto-retry). **Risk: medium** — severity scales with GHL/PDFMonkey
   error rate, which is unmeasured.

### SHOULD-FIX (soon after launch)

3. **Qualified-but-PDF-failed and manual-review leads get the generic "None" email** ("we couldn't fetch
   your profile, resubmit") — wrong, sometimes damaging, copy for a paying/held lead (§1b). Effort: low
   (distinct route/copy or a hold). 
4. **`fsiq_workflow_failed` branch is dead + failed pipelines are silent** (§1b/§1c). Decide how genuine
   failures should notify the lead and/or the team. Effort: low–medium.
5. **Reply-To / GHL-Conversations gap** while two emails invite replies (§5). Decide Reply-To + BCC-to-GHL
   and, for Non-US, a real "notify me at launch" capture. Effort: low (Zapier/Outlook config).
6. **Delete the 18 TEST GHL contacts** and remove/gitignore `scripts/test-email-routing.ts` (§4a). Effort: trivial.
7. **Remove `[FSIQ DEBUG]` logging** and reconcile `BROWSERLESS_API_KEY` vs `HEADLESS_ENABLED` env (§4b/§4c). Effort: trivial.
8. **Sender/signature mismatch** `rob@` vs `robert@` (§4b). Effort: trivial (copy edit).

### NICE-TO-HAVE

9. Add `NEXT_PUBLIC_APP_URL` to `.env.example`; remove vestigial `OUTLOOK_*` vars if the app will never send directly (§4c).
10. Make `report-url.ts` strip trailing slashes like `meta-events.ts` does (defense-in-depth so a stray slash can't reintroduce the bug). Effort: trivial — but it's a code change, flagged not done.
11. Consolidate the near-duplicate Fail/None templates (`email-templates.md` §4.3).

### Bottom line
The chain you manually tested works. The risk is **on the error edges**: a real lead can pay attention,
submit, see success, and silently get nothing — and your most important asset (the report PDF link) may
be pointing at the wrong host. Close blockers #1 and #2, confirm the prod env var, and you're green.
