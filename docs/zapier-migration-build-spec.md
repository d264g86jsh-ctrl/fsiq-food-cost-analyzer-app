# Zapier Email-Send Migration — Build-Ready Spec (single-webhook + tags + Paths)

**Status:** Build-ready. Reflects the **verified** live GHL workflow "Webhook (Analyzer) V3".
**Created / rewritten:** 2026-06-23. Supersedes the earlier per-branch `email_type` model.
**Authoritative sources:** the live GHL workflow (confirmed in the workflow builder) for routing;
`docs/email-templates.md` for canonical email HTML + the reconciled Tag → Email table;
`docs/email-migration-data-contract.md` for the app → GHL data contract; `src/lib/crm/*` for tag
strings and sync timing. Tag strings here are **verbatim app strings** (`src/lib/crm/ghl-tags.ts`).

---

## 1. Architecture recap (verified)

The app → GHL sync is **unchanged**: the analyzer writes its `fsiq_*` custom fields and applies its
exact tags to the GHL contact in a single sync (`syncToGhl` in `src/lib/crm/ghl.ts`). The live GHL
workflow **"Webhook (Analyzer) V3"** enrolls on a single trigger — **Contact Tag added =
`FSIQ Analyzer Submitted`** (every synced contact gets this tag, so every contact enrolls). It then has
one Condition node feeding **9 parallel, ordered branches**, each gated *"if Tags includes &lt;tag&gt;"*,
left-to-right (precedence order in §3). Each branch is **Email → Internal Notification → END**.

**Migration model:** migrate **only the 9 lead-facing Email steps** to Zapier (sent via Microsoft
Outlook from `rob@foodserviceiq.com`, which removes the "on behalf of" display). The **Internal
Notification steps stay in GHL** (internal-only; unaffected by the Outlook issue). In GHL we add **one
Webhook action near the top of the workflow** — right after the trigger, independent of the Condition —
that fires for **every enrolled contact** and POSTs all fields + the full tag list to a **Zapier Catch
Hook**. We do **not** replicate the branching in GHL for the webhook. Zapier does the routing: Catch
Hook → token filter → **Paths** that reproduce the 9 branches by filtering on the **tag strings in the
payload** (no `email_type` field; "None" is the negative/else path).

---

## 2. The single GHL Webhook payload (exact JSON)

One outbound GHL Webhook action (POST, `Content-Type: application/json`). Values are GHL contact merge
tokens. **`tags` is the routing key** — the full contact tag list. `token` is a static shared secret
Zapier verifies first.

> **GHL merge field for the full tag list:** use **`{{contact.tags}}`**. GHL renders it as a
> comma-separated list of the contact's tag names (e.g. `FSIQ Analyzer Submitted, FSIQ Qualified,
> FSIQ Full PDF Ready`). Zapier filters match exact tag strings against this list with "contains" (§3).

### 2.1 Payload template

```json
{
  "token": "REPLACE_WITH_SHARED_SECRET",
  "email": "{{contact.email}}",
  "first_name": "{{contact.first_name}}",
  "last_name": "{{contact.last_name}}",
  "restaurant_name": "{{contact.fsiq_restaurant_name}}",
  "pdf_url": "{{contact.fsiq_pdf_url}}",
  "final_pct": "{{contact.fsiq_final_pct}}",
  "estimated_savings": "{{contact.fsiq_estimated_savings}}",
  "tags": "{{contact.tags}}"
}
```

**Field notes:**
- `email` = recipient / Outlook **To:** (GHL native contact email; identical to the app's `fsiq_email`).
- `first_name` / `last_name` = GHL native name fields. The app sends `fsiq_full_name` and splits it into
  GHL `firstName`/`lastName` at create time (`ghl.ts:51–53`). Email bodies only use `first_name`.
- `pdf_url`, `final_pct`, `estimated_savings` are populated only for qualified leads; **empty string for
  DQ/Fail/None** (data-contract §2d/§2e). Only the two qualified emails read them.
- `tags` drives routing (§3). No `email_type` discriminator is sent.
- Optional: additional `fsiq_*` fields (e.g. `fsiq_submission_id`, attribution keys) may be appended for
  logging/analytics, but are **not needed** to render the 9 emails.

### 2.2 Filled example — qualified (full PDF, Meta lead)

```json
{
  "token": "REPLACE_WITH_SHARED_SECRET",
  "email": "roberto@casaroberto.com",
  "first_name": "Roberto",
  "last_name": "Sanchez",
  "restaurant_name": "Casa Roberto",
  "pdf_url": "https://app.foodserviceiq.com/report/clx2a9f0b0000abcd1234efgh",
  "final_pct": "5.8%",
  "estimated_savings": "$147,000",
  "tags": "FSIQ Analyzer Submitted, FSIQ Qualified, FSIQ Full PDF Ready, FSIQ Meta Lead"
}
```

### 2.3 Filled example — DQ (below threshold)

```json
{
  "token": "REPLACE_WITH_SHARED_SECRET",
  "email": "owner@tinytaco.com",
  "first_name": "Mia",
  "last_name": "Tran",
  "restaurant_name": "Tiny Taco",
  "pdf_url": "",
  "final_pct": "",
  "estimated_savings": "",
  "tags": "FSIQ Analyzer Submitted, FSIQ DQ Below Threshold"
}
```

---

## 3. The 9 Zapier Paths (precedence order)

Catch Hook → **Filter** (only continue if `token` equals the shared secret) → **Paths**. Paths in the
same left-to-right order as the live GHL workflow. "Positive filter" = the tag that selects the path;
"Precedence guard" replicates GHL first-match (see §4 — required because tags can accumulate on repeat
submitters). All filters match against the `tags` string with **Text → (does) contain**.

| # | Path name | Positive filter: `tags` contains | Precedence guard: `tags` does NOT contain | Email (body) | Subject |
|---|---|---|---|---|---|
| 1 | Full PDF Ready | `FSIQ Full PDF Ready` | — (highest precedence) | `email-templates.md` §2.1 | Your FoodServiceIQ Food Cost Analysis is ready |
| 2 | Conservative PDF Ready | `FSIQ Conservative PDF Ready` | `FSIQ Full PDF Ready` | §2.2 | Your FoodServiceIQ Food Cost Analysis is ready |
| 3 | DQ: Below Threshold | `FSIQ DQ Below Threshold` | any of tags 1–2 | §2.3 | Quick check on your FoodServiceIQ submission |
| 4 | DQ: Clear Non-Fit | `FSIQ DQ Clear Non Fit` | any of tags 1–3 | §2.4 | Thanks for using FoodServiceIQ's Food Cost Analyzer |
| 5 | DQ: Non-US | `FSIQ Non US` | any of tags 1–4 | §2.5 | Thanks for your interest in FoodServiceIQ |
| 6 | DQ: National Chain | `FSIQ DQ National Chain` | any of tags 1–5 | §2.6 | About your FoodServiceIQ submission |
| 7 | DQ: Invalid Website | `FSIQ DQ Invalid Website` | any of tags 1–6 | §2.7 | About your FoodServiceIQ submission |
| 8 | Fail | `FSIQ Workflow Failed` | any of tags 1–7 | §2.8 | Thanks for using FoodServiceIQ's Food Cost Analyzer |
| 9 | None | _(else)_ — does **not** contain any of the 8 strings above | — | §2.9 | Thanks for using FoodServiceIQ's Food Cost Analyzer |

The 8 routing strings (for the None negative filter): `FSIQ Full PDF Ready`, `FSIQ Conservative PDF Ready`,
`FSIQ DQ Below Threshold`, `FSIQ DQ Clear Non Fit`, `FSIQ Non US`, `FSIQ DQ National Chain`,
`FSIQ DQ Invalid Website`, `FSIQ Workflow Failed`.

> ⚠️ **Fail = `FSIQ Workflow Failed` sends an email.** This contradicts `docs/ghl-email-handoff.md`
> (which called it a no-email hold route). The **live workflow is authoritative** and sends the Fail
> email on this tag. The contradiction is flagged in `email-templates.md` §1, `email-migration-data-contract.md`
> §5, and `ghl-email-handoff.md` itself.
>
> **Substring-safety note:** matching `FSIQ Non US` with "contains" is safe — no other tag contains that
> string (`FSIQ DQ Clear Non Fit` contains "Non Fit", not "Non US"). Always filter on the **full** tag
> string, never a fragment like "PDF Ready" (which would match both qualified tags).

---

## 4. Precedence / mutual-exclusivity finding

**Per single sync: mutually exclusive — yes.** `src/lib/crm/assign-lead-status.ts` returns exactly one
result object per contact, carrying exactly one routing tag from the set (plus `FSIQ Analyzer Submitted`,
optionally `FSIQ Qualified`, and optionally `FSIQ Meta Lead`). A given submission therefore produces
exactly one of the 8 routing tags (or none → None).

**Per contact lifetime: NOT guaranteed exclusive.** The app always tries to **create a new contact**;
if GHL blocks it as a duplicate (same email), it **applies tags to the existing contact without removing
prior tags** (`ghl.ts:88–113`). A repeat submitter can therefore **accumulate** multiple routing tags
over time (e.g. a first DQ submission then a later qualified one → contact has both `FSIQ DQ Below
Threshold` and `FSIQ Full PDF Ready`). The live GHL workflow resolves this by **first-match precedence**
(left-to-right branch order). Zapier Paths, by contrast, evaluate independently and **can fire multiple
paths**, so simple positive filters are **not** sufficient.

**Conclusion: use the precedence guards in §3** (each path requires its own tag AND the absence of every
higher-precedence tag). This reproduces GHL's first-match behavior and prevents a multi-tagged contact
from receiving two emails. In the common single-sync case only one routing tag is present, so the guards
are no-ops; they matter only for accumulated/repeat contacts.

Also note (see §7): a **qualified-but-PDF-failed** contact carries `FSIQ Qualified` + `FSIQ PDF Failed`
(no PDF-ready tag). `FSIQ PDF Failed` is **not** one of the 8 routing strings, so it matches no positive
path and falls to **None** (Path 9).

---

## 5. Zapier field mapping (replaces GHL merge tokens)

> **Critical:** the email HTML in `docs/email-templates.md` uses GHL tokens like `{{contact.first_name}}`
> and `{{contact.fsiq_pdf_url}}`. **These do NOT resolve in Outlook / Zapier** — GHL only renders them in
> its own send step. In each Zapier Outlook step you must paste the canonical HTML and **replace every
> `{{contact.X}}` token with the corresponding Catch Hook payload field** (Zapier "Insert Data").

| GHL token in email HTML | Catch Hook payload field | Used by |
|---|---|---|
| `{{contact.first_name}}` | `first_name` | all 9 |
| `{{contact.fsiq_restaurant_name}}` | `restaurant_name` | all 9 |
| `{{contact.fsiq_pdf_url}}` | `pdf_url` | Full PDF Ready, Conservative PDF Ready |
| `{{contact.fsiq_final_pct}}` | `final_pct` | Full PDF Ready, Conservative PDF Ready |
| `{{contact.fsiq_estimated_savings}}` | `estimated_savings` | Full PDF Ready, Conservative PDF Ready |
| _recipient (To:)_ | `email` | all 9 |

No other `{{contact.*}}` tokens appear in the email bodies. After pasting each template, search the body
for a leftover `{{contact.` and confirm zero before saving.

---

## 6. Outlook send config (per path)

Apply to all 9 paths unless noted:

- **From:** `rob@foodserviceiq.com` (Microsoft 365 mailbox; fixes "on behalf of").
- **From name:** `Robert Ferreira`.
- **To:** payload `email`.
- **Reply-To:** **TODO — decide** between the native `rob@foodserviceiq.com` inbox vs. the
  `foodservice-iq.com` forwarder. (Related: the email signature/`mailto:` reads `robert@foodserviceiq.com`,
  which differs from the `rob@` From — `email-templates.md` §4.2; resolve together.)
- **BCC (optional):** the GHL inbound/Conversations address, so replies/sent history keep logging in GHL
  Conversations after the send leaves GHL. Confirm the address before enabling.
- **Subject:** per path (§3).
- **Body (HTML):** the exact template from `docs/email-templates.md` §2.x for that path, tokens swapped
  per §5. **Do not duplicate the HTML here** — `email-templates.md` is the single source of truth.
- **Body type:** HTML.

| Path | Body source | Subject |
|---|---|---|
| 1 Full PDF Ready | `email-templates.md` §2.1 | Your FoodServiceIQ Food Cost Analysis is ready |
| 2 Conservative PDF Ready | §2.2 | Your FoodServiceIQ Food Cost Analysis is ready |
| 3 DQ: Below Threshold | §2.3 | Quick check on your FoodServiceIQ submission |
| 4 DQ: Clear Non-Fit | §2.4 | Thanks for using FoodServiceIQ's Food Cost Analyzer |
| 5 DQ: Non-US | §2.5 | Thanks for your interest in FoodServiceIQ |
| 6 DQ: National Chain | §2.6 | About your FoodServiceIQ submission |
| 7 DQ: Invalid Website | §2.7 | About your FoodServiceIQ submission |
| 8 Fail | §2.8 | Thanks for using FoodServiceIQ's Food Cost Analyzer |
| 9 None | §2.9 | Thanks for using FoodServiceIQ's Food Cost Analyzer |

---

## 7. Timing — is one webhook on `FSIQ Analyzer Submitted` always complete?

**Question:** will a single webhook fired at enrollment (`FSIQ Analyzer Submitted` added) always carry
complete routing data — all routing tags AND `fsiq_pdf_url`?

**Findings from the code (`src/actions/submitAnalysis.ts`, `src/lib/crm/ghl.ts`):**

1. **One GHL sync per submission — no early "submitted" sync.**
   - DQ / manual-review / clear-non-fit path: early exit → `syncAndReturn()` calls `syncToGhl` **once**
     with the final DQ tags.
   - Qualified path: the action returns to the client immediately, then runs AI + PDF in the background
     (`waitUntil`), and calls `syncToGhl` **once at the end** (step 10, ~`submitAnalysis.ts:476`) using
     the **final** status (PDF result already known). The preliminary `QUALIFIED_PDF_PENDING` status is
     computed only for the client response — **it is never synced to GHL.**

2. **All tags land in one API call, at one instant.** `syncToGhl` does `POST /contacts` with
   `customFields` (incl. `fsiq_pdf_url`) **first** (`ghl.ts:58`), then `POST /contacts/{id}/tags` with the
   **entire** tags array — `FSIQ Analyzer Submitted` **and** the routing tag together (`ghl.ts:108`). So
   `FSIQ Analyzer Submitted` is added in the same call as the routing tag, and the custom fields
   (including `fsiq_pdf_url`) were already written moments earlier in the same `syncToGhl` invocation.

3. **Qualified leads: `fsiq_pdf_url` + the PDF-ready tag are guaranteed present at that instant.** The
   payload is built from a DB record re-fetched **after** PDF generation (`fresh`, ~`submitAnalysis.ts:467`),
   so `fsiq_pdf_url` is already set when the same sync applies `FSIQ Full PDF Ready` /
   `FSIQ Conservative PDF Ready` alongside `FSIQ Analyzer Submitted`.

**Conclusion: SAFE to fire one webhook on `FSIQ Analyzer Submitted`.** Because the app performs a single
final sync and applies the enrollment tag, the routing tag, and the custom fields in the same `syncToGhl`
call, the contact is fully populated the moment `FSIQ Analyzer Submitted` is added. The new Webhook
action sits at the **same enrollment point** as the existing Email branches, so it **inherits their
timing** — and those branches already read the routing tags and `fsiq_pdf_url` successfully today, which
empirically confirms the data is present. **No Wait step or alternate trigger is needed** for the
qualified path.

**Caveats to be aware of (not blockers):**
- A qualified lead whose **PDF failed** is synced with `FSIQ Qualified` + `FSIQ PDF Failed` and an empty
  `fsiq_pdf_url`; it matches no positive path and routes to **None** (§4). Expected, given `FSIQ PDF
  Failed` is not a branch.
- GHL **dedup** can accumulate tags on repeat contacts (§4) — handled by the precedence guards, not a
  timing issue.

---

## 8. Pre-launch test & cutover

**The app is NOT live yet — no production traffic, so there is no duplicate-email risk** during testing.
This is a pre-launch verification, not a live cutover.

**Pre-flight**
- [ ] Catch Hook URL stored; one GHL Webhook action added near the top of "Webhook (Analyzer) V3" (after the trigger, independent of the Condition); `Content-Type: application/json`; payload per §2.
- [ ] Confirm `{{contact.tags}}` renders the full tag list in a test webhook capture (check delimiter/format).
- [ ] Zapier: token Filter as the first step (reject any payload whose `token` ≠ shared secret).
- [ ] 9 Paths built in precedence order with positive filters **and** precedence guards (§3/§4); None = negative filter on all 8 strings.
- [ ] Each Outlook step: canonical HTML pasted, all `{{contact.X}}` tokens replaced with Catch Hook fields (§5); grep each body for a leftover `{{contact.` = 0.

**Seed tests (internal/seed contacts — no real leads)**
- [ ] Fire one contact per path (set tags to match each branch) and confirm delivery to **Outlook, Gmail, and Yahoo**.
- [ ] Confirm From shows `Robert Ferreira <rob@foodserviceiq.com>` with **no "on behalf of"** in Outlook.
- [ ] Qualified paths: confirm `pdf_url` renders and the link **resolves at `https://app.foodserviceiq.com/report/{id}`**; confirm `final_pct` and `estimated_savings` populate (not blank/literal tokens).
- [ ] DQ/Fail/None paths: confirm no savings/PDF tokens print (empty fields render empty).
- [ ] Confirm an accumulated multi-tag test contact triggers only the highest-precedence path (guards working).
- [ ] Spot-check rendering on mobile Outlook/Gmail.

**Cutover (pre-launch)**
- [ ] With Zapier verified, **disable the 9 GHL Email steps** in "Webhook (Analyzer) V3" before launch (leave the Internal Notification steps enabled).
- [ ] Keep the 9 GHL Email steps **disabled, not deleted**, so re-enabling them (and pausing the Zapier Paths) is an instant rollback.

**Open decisions to close before launch**
- [ ] Reply-To target (native inbox vs. `foodservice-iq.com` forwarder) + the `rob@` vs `robert@` signature mismatch (`email-templates.md` §4.2).
- [ ] Whether to consolidate the near-duplicate Fail/None templates (`email-templates.md` §4.3).
</content>
