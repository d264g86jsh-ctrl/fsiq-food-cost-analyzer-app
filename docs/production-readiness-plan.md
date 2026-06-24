# Production Readiness Remediation Plan — YELLOW → GREEN

**Date:** 2026-06-24
**Basis:** `docs/production-readiness-audit.md`. This is a **plan for review** — no code, env, config,
GHL, or Zapier has been changed. Nothing is implemented until you approve.
**Citations:** every root cause cites `file:line` confirmed from source this session. Anything that
depends on state I can't see from the repo (prod Vercel env, live GHL/Zapier) is marked and placed in
**your column** (§B).

Legend — **Owner:** 🧑 You (live infra) / 🤖 Me (repo). **Surface:** code / env / GHL-Zapier.
**Mutation:** safe-local / prod.

---

## BLOCKERS

### B1 — Qualified emails' PDF link is malformed (`NEXT_PUBLIC_APP_URL`)

1. **Finding (severity: BLOCKER).** `fsiq_pdf_url` in the two qualified emails can point at the wrong
   host with a double slash (`…vercel.app//report/{id}`), breaking the core deliverable.
2. **Root cause.**
   - `src/lib/pdf/report-url.ts:1-4` — `buildReportUrl()` does `` `${process.env.NEXT_PUBLIC_APP_URL ?? ''}/report/${id}` `` with **no trailing-slash strip and no safe host default** (contrast `src/lib/meta/meta-events.ts:12`, which does `.replace(/\/+$/, '')` and defaults to `https://app.foodserviceiq.com`).
   - Consumed at `src/lib/crm/build-ghl-payload.ts:63-65` (`fsiq_pdf_url`).
   - Local `.env.local` value = `"https://fsiq-food-cost-analyzer-app.vercel.app/"` (wrong host + trailing slash). **Prod value not visible from repo.**
3. **Proposed fix — two parts:**
   - **(i) Prod env [🧑 You, env, prod].** Verify and, if needed, correct the production
     `NEXT_PUBLIC_APP_URL` to `https://app.foodserviceiq.com` (no trailing slash). Exact steps in §C.
     Rollback: re-set the previous value in Vercel and redeploy.
   - **(ii) Code hardening [🤖 Me, code, safe-local].** Make `report-url.ts` strip trailing slashes and
     default to the correct host, mirroring `meta-events.ts`, so a stray slash can never reintroduce the
     bug. Proposed diff in §C (not applied). Rollback: revert the one-line change (git).
4. **Blast radius / re-test.** `buildReportUrl` is used **only** by `fsiq_pdf_url` (confirmed:
   `grep buildReportUrl` → `build-ghl-payload.ts` only). The code change is additive normalization; risk
   is near-zero. Re-test: one qualified submission → confirm the email PDF link is
   `https://app.foodserviceiq.com/report/{id}` (single slash) and renders. `meta-events.ts` already
   strips slashes (unit test `__tests__/meta-events.test.ts:172`), so Meta is unaffected.
5. **Effort:** trivial (env: minutes; code: ~1 line + a test).

### B2 — Silent lead loss on background/sync failure (no alerting, no retry)

1. **Finding (severity: BLOCKER).** A qualified lead can see the success screen yet get **no email and no
   GHL contact** if the background errors before sync, the record re-fetch is null, or `syncToGhl`
   errors — silently, with no auto-retry and no alert.
2. **Root cause (all `src/actions/submitAnalysis.ts`).**
   - Qualified path returns success to the client *before* the background runs (`waitUntil(...)` opens at
     ~L293; client `return` at ~L533).
   - Outer background `catch (unexpectedErr)` at ~L523-529 only does
     `db.update({ workflowStage:'complete', workflowStatus:'partial' })` — **it never calls `syncToGhl`.**
   - Sync is gated on `if (fresh)` (~L473/486) where `fresh = db.findUnique(...).catch(()=>null)` (~L467);
     a null re-fetch silently skips sync.
   - `syncToGhl` failure → `crmSyncStatus='error'`, `workflowStatus='partial'` (~L504-522); **no retry**;
     recovery only via admin `retryGhlSync` (`src/actions/admin.ts:32`).
   - There is **no alerting** anywhere on `partial`/`failed`/`crmSyncStatus='error'` (confirmed: no
     notifier in the pipeline).
3. **Proposed fix — options laid out in §C (you choose; I won't pick unilaterally).** Spans alerting /
   retry / guaranteed-fallback-email / honest-success-screen. Mix of [🤖 code] and possibly [🧑 a Slack/
   email alert secret]. Rollback per option in §C.
4. **Blast radius / re-test.** Depends on chosen option (see §C); a fallback-email or retry changes the
   customer-facing path and must be tested for duplicate-send and correct-copy.
5. **Effort:** low (alerting only) → medium (retry + fallback) → high (durable queue).

---

## SHOULD-FIX (post-launch unless marked trivial)

### S3 — PDF-failed-qualified & manual-review leads get the generic "None" email (wrong copy)

1. **Finding (SHOULD-FIX).** A qualifying lead whose PDF failed, and a manual-review lead, both fall to
   the None/else branch and receive *"we couldn't fetch your profile, resubmit"* — wrong, sometimes
   damaging, copy.
2. **Root cause.**
   - PDF-failed-qualified emits `[Analyzer Submitted, Qualified, PDF Failed]` (`src/lib/crm/assign-lead-status.ts:192`); `FSIQ PDF Failed` is **not** a routing branch tag → falls to else/None.
   - Manual review emits `[Analyzer Submitted, Manual Review]` (`assign-lead-status.ts:74`) → no branch tag → else/None.
   - None copy: `docs/email-templates.md` §2.9.
3. **Proposed fix — two options:**
   - **(a) Route them explicitly [🤖 code + 🧑 GHL/Zapier].** Add dedicated GHL branches/Zapier paths for
     `FSIQ PDF Failed` and `FSIQ Manual Review` (tags already emitted). Code touch: none required (tags
     exist); **GHL workflow + Zapier paths** must be added by you, plus new copy in `email-templates.md`
     [🤖]. Surface: GHL-Zapier + doc. Mutation: prod (GHL/Zapier). Rollback: disable the new branches.
   - **(b) Soften the None copy [🤖 doc + 🧑 Zapier].** Reword §2.9 to a neutral "we've received your
     submission and will follow up" that's safe for all fall-through cases. Surface: doc + Zapier
     re-paste. Rollback: restore prior copy.
4. **Blast radius / re-test.** (a) changes routing — re-test that PDF-failed and manual-review contacts
   hit the new branch, and that None still catches true unknowns. (b) is copy-only — proofread.
5. **Effort:** (a) medium; (b) trivial. **Recommend (b) before launch (trivial), (a) after.**

### S4 — `fsiq_workflow_failed` branch is dead; real failed pipelines are silent

1. **Finding (SHOULD-FIX; overlaps B2).** Branch 8 never fires for real traffic, and a genuinely failed
   pipeline produces no email/contact at all.
2. **Root cause.**
   - `assign-lead-status.ts:60-67` returns `tags: [GHL_TAG.WORKFLOW_FAILED]` **without** `FSIQ Analyzer
     Submitted` → the contact never enrolls (workflow trigger = Analyzer Submitted added).
   - Every `submitAnalysis.ts` call passes `workflowFailed:false` (~L231/242/284/460); failed validation/
     qualification `return fail()` (~L167/221) **without syncing**. Only `admin.ts:54` ever sets
     `workflowFailed`, and even then the emitted tag set won't enroll.
3. **Proposed fix — choose in concert with B2:**
   - **(a) Make failures route to a real email [🤖 code + 🧑 GHL/Zapier].** On pipeline failure, sync a
     minimal contact with `[Analyzer Submitted, Workflow Failed]` (so it enrolls and hits branch 8). Code
     touch: `submitAnalysis.ts` failure handlers + the `assign-lead-status.ts:64` tag set. Surface: code;
     plus confirm branch 8 copy in Zapier. Mutation: prod DB on the failure path. Rollback: revert code.
   - **(b) Retire branch 8, rely on B2 alerting [🧑 GHL/Zapier + 🤖 docs].** If failures should be
     human-handled, delete/disable branch 8 and document that failures are caught by B2 alerting. Surface:
     GHL/Zapier + doc. Rollback: re-enable branch.
4. **Blast radius / re-test.** (a) adds a new prod-DB write + GHL sync on the error path — test that a
   forced failure now yields exactly one enrolled contact + one email. (b) ensure no orphaned Zapier path.
5. **Effort:** (a) medium; (b) low. **Decide alongside B2 (they're the same reliability question).**

### S5 — Reply-To bypasses GHL Conversations + forwarder while emails invite replies

1. **Finding (SHOULD-FIX).** Sends are From/Reply-To `rob@foodserviceiq.com`; replies don't log in GHL or
   reach the `foodservice-iq.com` forwarder. Two DQ emails explicitly ask the lead to reply (Below
   Threshold; Non-US "reply… I'll add you to our list" — no capture).
2. **Root cause.** Reply routing is **Zapier/Outlook config**, not app code (confirmed: no Outlook/Graph
   send code in `src/`). Reply-invite copy: `docs/email-templates.md` (Below Threshold §2.3, Non-US §2.5).
   `docs/zapier-migration-build-spec.md` left Reply-To + BCC-to-GHL-inbound as open TODOs.
3. **Proposed fix [🧑 Zapier/Outlook + 🤖 docs].** You decide Reply-To target (native `rob@` inbox vs
   `foodservice-iq.com` forwarder) and whether to BCC the GHL inbound address so replies log in
   Conversations. I update `email-templates.md`/`zapier-migration-build-spec.md` to record the decision
   and, if you want, soften the Non-US "I'll add you to our list" line to avoid promising a capture that
   doesn't exist. Surface: GHL/Zapier (you) + doc (me). Mutation: prod (Zapier). Rollback: revert Zapier
   Reply-To/BCC + doc.
4. **Blast radius / re-test.** Send a test reply to one DQ email; confirm it lands where intended and (if
   BCC enabled) appears in GHL Conversations.
5. **Effort:** low.

### S6 — 18 TEST contacts in GHL + the test script artifact

1. **Finding (SHOULD-FIX; cleanup).** Two routing-test runs created 18 live `rodrigo+<case>@` contacts;
   tag accumulation on dupes can muddy real data. `scripts/test-email-routing.ts` is a test-only artifact.
2. **Root cause.** Created by `scripts/test-email-routing.ts` (this session). The GHL location allows
   duplicate emails (all 18 `created:true`); `ghl.ts:88-113` applies tags to existing contacts without
   removal → accumulation.
3. **Proposed fix.**
   - [🧑 GHL, prod] Delete the 18 contacts (IDs listed in `docs/email-routing-test-results.md`). Rollback:
     n/a (they're test data; recreate by re-running the script if ever needed).
   - [🤖 repo, safe-local] Remove `scripts/test-email-routing.ts` or add it to `.gitignore` / mark clearly
     test-only. Rollback: git restore.
4. **Blast radius / re-test.** Deleting test contacts can't affect real leads (distinct plus-addresses).
   Removing the script has no runtime effect.
5. **Effort:** trivial.

### S7 — Debug logging in prod paths + env-var reconciliation

1. **Finding (SHOULD-FIX; trivial).** `[FSIQ DEBUG]` logs and submission-ID logging in hot paths; and a
   `BROWSERLESS_API_KEY` (CLAUDE.md) vs `HEADLESS_ENABLED` (`.env.example`) mismatch.
2. **Root cause.** `src/actions/submitAnalysis.ts:295,474` (`[FSIQ DEBUG]`), plus assorted
   `[FSIQ LOGO]`/`[PDF …]` `console.log`s. `.env.example` lists `HEADLESS_ENABLED` but not
   `BROWSERLESS_API_KEY`; CLAUDE.md references `BROWSERLESS_API_KEY`.
3. **Proposed fix.**
   - [🤖 code] Remove or gate the `[FSIQ DEBUG]` logs behind a debug flag. Rollback: git revert.
   - [🧑 + 🤖] Confirm which the prod headless path actually uses; align `.env.example` + Vercel env
     accordingly. The "which is real" answer needs the live Vercel env [🧑]; the `.env.example` edit is
     mine [🤖].
4. **Blast radius / re-test.** Log removal is no-op for behavior. Env reconciliation: confirm website
   validation still runs headless in prod after any change.
5. **Effort:** trivial (logs); low (env reconciliation, mostly investigation).

### S8 — Sender/signature mismatch (`rob@` vs `robert@`)

1. **Finding (SHOULD-FIX; trivial).** Emails send From `rob@foodserviceiq.com` but the signature/`mailto:`
   is `robert@foodserviceiq.com`.
2. **Root cause.** `docs/email-templates.md` §4.2 (signature block in all 9 templates).
3. **Proposed fix [🤖 doc + 🧑 Zapier].** Decide the canonical address; I align the signature in
   `email-templates.md`; you re-paste affected templates into Zapier. Rollback: restore prior copy.
4. **Blast radius / re-test.** Copy-only; proofread one of each template after re-paste.
5. **Effort:** trivial.

---

## NICE-TO-HAVE (optional)

- **N9 — `.env.example` hygiene [🤖 doc/repo].** Add `NEXT_PUBLIC_APP_URL` (currently absent); remove the
  vestigial `OUTLOOK_CLIENT_ID/SECRET/TENANT_ID` (no Outlook send code in `src/`). Trivial. Pairs with B1.
- **N10 — Consolidate near-duplicate Fail/None templates** (`email-templates.md` §4.3). Trivial copy
  decision; do with S3.
- **N11 — `META_TEST_EVENT_CODE` must be unset in prod [🧑 env].** [INFERRED from standard Meta CAPI
  behavior] — if set, events route to the Meta test stream. Verify in Vercel. Trivial.

---

## A. Sequencing

**Do before any real traffic (blockers):**
1. **B1(i)** — verify/fix prod `NEXT_PUBLIC_APP_URL` (you). **Do this first** — it's the only thing that
   makes the live PDF link correct, and it tells us whether B1(ii) is urgent.
2. **B1(ii)** — `report-url.ts` hardening (me), **after** you've confirmed the prod value, so we don't
   mask a wrong env value with code. Pairs with **N9** (add the var to `.env.example`).
3. **B2** — pick a silent-loss option (§C) and implement. Minimum-viable alerting can ship fast; decide
   before traffic so failures aren't invisible.
4. **S3(b)** — soften None copy (trivial) so fall-through leads aren't mis-messaged on day one.

**Do soon after launch:**
5. **S4** + finish **B2** (same reliability question — failed pipelines routing/alerting).
6. **S3(a)** — dedicated PDF-failed / manual-review routing.
7. **S5** — Reply-To / BCC decision.
8. **S6/S7/S8** — cleanup (delete test contacts, remove debug logs + script, env reconciliation, sender fix).

**Optional:** N9 (fold into step 2), N10 (fold into S3), N11 (fold into the env-verification pass).

**Dependencies:** B1(i) → B1(ii); B2 and S4 are coupled (decide together); S3/S4/S5/S8 each require a
Zapier/GHL re-paste or branch change after the doc/code change.

---

## B. What YOU must do vs what I can do

### 🧑 Your column — live Vercel / GHL / Zapier (I cannot execute these)

| Ref | Action | Exact steps |
|---|---|---|
| B1(i) | Verify/fix prod `NEXT_PUBLIC_APP_URL` | See §C commands. Must be `https://app.foodserviceiq.com` (no trailing slash). |
| B2 | Provision an alert channel (if you pick the alerting option) | e.g. a Slack incoming-webhook URL or ops email to add as a Vercel env var; tell me which. |
| S3(a) | Add GHL branches + Zapier paths for `FSIQ PDF Failed` and `FSIQ Manual Review` | New GHL workflow branches gated on those tags → new Zapier paths → Outlook send. |
| S4 | Enable/disable GHL branch 8 per chosen option | In "Webhook (Analyzer) V3". |
| S5 | Set Reply-To (native vs forwarder) + optional BCC to GHL inbound | In the Zapier Outlook send step(s). |
| S6 | Delete the 18 TEST GHL contacts | IDs in `docs/email-routing-test-results.md`. |
| S7 | Confirm prod headless var (`BROWSERLESS_API_KEY` vs `HEADLESS_ENABLED`) | `vercel env ls`; tell me which is set. |
| S8/S3/S5 | Re-paste any changed templates into Zapier | After I update `email-templates.md`. |
| N11 | Ensure `META_TEST_EVENT_CODE` is unset in prod | `vercel env ls`; remove if present. |

### 🤖 My column — repo changes I'll propose as diffs for your approval (no edits yet)

- B1(ii) `src/lib/pdf/report-url.ts` hardening (diff in §C).
- B2 chosen option: failure logging/alerting and/or retry and/or fallback in `src/actions/submitAnalysis.ts` (after you choose).
- S3(b) None copy + S8 signature + S5 doc updates in `docs/email-templates.md` (+ `zapier-migration-build-spec.md`).
- S4 code path (if option a) in `submitAnalysis.ts` + `assign-lead-status.ts`.
- S6 remove/gitignore `scripts/test-email-routing.ts`.
- S7 remove `[FSIQ DEBUG]` logs in `submitAnalysis.ts`.
- N9 `.env.example` add `NEXT_PUBLIC_APP_URL`, drop `OUTLOOK_*`.

---

## C. The two blockers in detail

### C1 — `NEXT_PUBLIC_APP_URL`

**Check the production value [🧑 You].** `CLAUDE.md` forbids `vercel env pull` (it overwrites
`.env.local`), so do **not** pull. Use:

```bash
# 1) Confirm the var exists for Production (lists keys + target, not values):
vercel env ls

# 2) View the actual VALUE without overwriting .env.local — use the dashboard:
#    Vercel → Project → Settings → Environment Variables → NEXT_PUBLIC_APP_URL (Production)
#    (Do NOT run `vercel env pull` — it clobbers local Sensitive vars per CLAUDE.md.)
```

**It must be:** `https://app.foodserviceiq.com` — **no trailing slash**, production host (not the
`*.vercel.app` preview host). If it's wrong, update it in the dashboard for the **Production** target and
redeploy. Rollback: restore the previous value + redeploy.

**Code hardening [🤖 Me] — proposed diff (NOT applied):** `src/lib/pdf/report-url.ts`

```diff
 export function buildReportUrl(submissionId: string): string {
-  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
-  return `${base}/report/${submissionId}`;
+  // Mirror meta-events.ts: strip trailing slashes and default to the prod host so a
+  // misconfigured env value can't produce `//report` or an empty host in customer emails.
+  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.foodserviceiq.com').replace(/\/+$/, '');
+  return `${base}/report/${submissionId}`;
 }
```

This matches the existing pattern at `src/lib/meta/meta-events.ts:12`. Add/extend a unit test
(`buildReportUrl` with a trailing-slash env → single slash) alongside the existing
`__tests__/meta-events.test.ts:172` precedent. Safe/local; rollback = git revert. **Apply only after you
confirm the prod env value**, so we don't paper over a wrong host with a default.

### C2 — Silent lead loss (options — you choose; I won't pick unilaterally)

All target the same guarantee: *a real submission never silently results in no email.* Trade-offs:

| Option | What it does | Pros | Cons | Owner / effort |
|---|---|---|---|---|
| **A. Observability only** | Emit a structured error + alert (Slack webhook / ops email) whenever `workflowStatus` becomes `partial`/`failed` or `crmSyncStatus='error'`; in `submitAnalysis.ts` background + DQ paths. | Smallest change; makes today's silent failures visible; no customer-path change | Lead still gets no email until a human manually retries (`admin.ts:retryGhlSync`) | 🤖 code + 🧑 alert secret · **low** |
| **B. Auto-retry the GHL sync** | Wrap `syncToGhl` in N retries w/ backoff (background + DQ paths). | Fixes transient GHL errors automatically | Doesn't help if the background throws *before* sync or `fresh` is null; small duplicate-tag risk (mitigated by GHL dedup) | 🤖 code · **low–med** |
| **C. Guaranteed fallback email** | In the outer `catch` and the `if(!fresh)`/sync-error paths, sync a minimal contact with an enrolling fallback tag (`Analyzer Submitted` + a safe branch) so Zapier still sends *something* instead of nothing. | Customer always gets an email; closes the truly-silent gap | Fallback copy may be generic/wrong for a lead who actually qualified; needs a defined fallback route (pairs with S3/S4) | 🤖 code + 🧑 GHL/Zapier branch · **med** |
| **D. Durable queue/worker** | Move the background pipeline to a job table + retrying worker/cron. | Strongest reliability; full retry + visibility | Architectural; overkill for launch; new infra | 🤖 code + 🧑 infra · **high** |
| **E. Honest success screen / early contact** | Don't show "analysis on its way" until sync confirmed, OR create a preliminary GHL contact at submit time (the two-stage sync the handoff doc notes as a future pattern) so a contact always exists. | A contact/record always exists even if PDF later fails | Changes UX timing or the single-sync model; more rework | 🤖 code · **med–high** |

**My read (not a decision):** **A + B** is the cheapest combination that removes the *silent* part before
launch (you'd see every failure and transient errors self-heal); add **C** (or **E**) post-launch for a
true no-lead-left-behind guarantee, ideally folded into S3/S4 so the fallback uses correct copy. Tell me
which and I'll produce the exact diffs.

---

*Plan only — awaiting your approval. On approval, I'll implement my-column items as reviewable diffs and
hand you the your-column checklist; nothing touches prod until you say go.*
</content>
