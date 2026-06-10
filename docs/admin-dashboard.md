# Admin Dashboard

**Related:** `docs/ghl-email-handoff.md` · `docs/launch-blockers.md` (known gaps in retry workers)  
**Routes:** `/admin` (login) · `/admin/submissions` (list) · `/admin/submissions/[id]` (detail)  
**Auth:** Cookie-based. Login posts to `adminLogin()` server action; password validated against `ADMIN_ACCESS_TOKEN` env var using `crypto.timingSafeEqual`. Session stored as an HttpOnly cookie.

---

## Purpose

The admin dashboard is an internal tool for:
1. **Viewing all submissions** — searchable, filterable list with workflow status
2. **Manual review queue** — reviewing flagged submissions before any email fires
3. **Retrying failed GHL syncs** — requeue a contact sync without re-running the full pipeline

It is not customer-facing and is protected by `ADMIN_ACCESS_TOKEN`.

---

## Routes

### `/admin` — Login
Simple form. Password validated against `ADMIN_ACCESS_TOKEN`. On success, sets an HttpOnly session cookie. No brute-force protection beyond the env-var secret strength.

### `/admin/submissions` — Submission List
Lists all `Submission` records in reverse-chronological order. Shows:
- Restaurant name, email, created date
- `workflowStatus` badge (`complete` / `partial` / `failed` / `in_progress`)
- `qualified` / DQ reason
- `pdfStatus`
- `crmSyncStatus`
- `manualReviewRequired` flag

### `/admin/submissions/[id]` — Submission Detail
Full record view showing every field. Key actions available:

| Action | Implementation | Status |
|--------|---------------|--------|
| **Approve manual review** | `updateManualReview('approved', notes)` server action → updates `manualReviewStatus`, `manualReviewedAt`, `manualReviewNotes` | ✅ Implemented |
| **Reject manual review** | `updateManualReview('rejected', notes)` | ✅ Implemented |
| **Retry GHL sync** | `retryGhlSync(submissionId)` — rebuilds GHL payload from current DB state, calls `syncToGhl()`, upgrades `workflowStatus` from `partial` → `complete` on success | ✅ Implemented |
| **Retry PDF** | Button exists in UI | ⚠️ **Placeholder — not implemented.** Button visible but does nothing. Manual retry requires PDFMonkey dashboard or a one-off script. |

---

## Manual Review Flow

Submissions flagged `manualReviewRequired = true` arrive in GHL with `fsiq_communication_route = manual_review_hold` — **no email automation fires**.

The admin reviews the submission in the dashboard:
- **Approve** → `manualReviewStatus = 'approved'`; re-triggers the qualified pipeline (PDF + GHL final sync) if the submission qualifies. *Note: in v1, approval does not automatically re-trigger the pipeline — it only updates the DB status. Follow up manually if the lead needs a PDF.*
- **Reject** → `manualReviewStatus = 'rejected'`; records notes. GHL is not updated automatically.

---

## Security Notes

- `sanitizeErrorString()` is called before displaying any error text in the UI to prevent leaking API tokens or bearer credentials from workflow error logs.
- Admin cookie is HttpOnly — not accessible to client JavaScript.
- `ADMIN_ACCESS_TOKEN` must be a strong random string (32+ chars). Generate with `openssl rand -hex 32`.

---

## Known Gaps (v1)

- **PDF retry worker not implemented** — the "Retry PDF" button in the detail view is a placeholder. No server action exists behind it.
- **Manual review approval does not auto-re-trigger the pipeline** — approving a review updates DB status but does not fire PDF generation or a follow-up GHL sync.
- **No pagination** — the submissions list loads all records. Will need pagination before volume grows.
