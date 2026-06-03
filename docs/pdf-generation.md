# PDF Generation

**Source of truth for:** `src/lib/pdf/pdfmonkey.ts`, `src/lib/pdf/build-pdf-payload.ts`, `src/lib/pdf/pdf-mode.ts`, `src/app/api/report/[id]/route.ts`

**See also:** `docs/hard-rules.md` — browser compatibility constraints that apply to the report page and proxy route.

---

## Overview

Qualified submissions receive a personalized PDF report generated via the PDFMonkey API. The app calls PDFMonkey directly — no Zapier, no intermediate service. The PDF is never downloaded by the user; it is served inline through a server-side proxy.

---

## PDF Modes

| Mode | When | Description |
|---|---|---|
| `full` | `verified_restaurant` + `us_verified`/`likely_us` + qualified spend | Fully personalized with restaurant logo, business summary, narratives |
| `conservative` | `plausible_unverified` + `likely_us`/`unknown` + qualified spend | No restaurant logo; generic business name; same savings math |
| `skipped` | DQ, `clear_non_fit`, `non_us`, below threshold | No PDF created; `pdfStatus = "skipped"` |

Mode is determined by `determinePdfMode()` in `src/lib/pdf/pdf-mode.ts` based on `finalDecision` and `countryEligibility`.

---

## Template

**Template ID:** Set via `PDFMONKEY_TEMPLATE_ID` environment variable. Never hardcoded.

**Template safety patch:** Before creating any document, `patchPdfMonkeyTemplateHtml()` (`src/lib/pdf/pdfmonkey-template.ts`) ensures all Calendly CTA links in the template have `target="_blank"`. This is idempotent and cached per template ID + patch version. Re-runs on version bump (`PATCH_VERSION` constant in `pdfmonkey.ts`).

---

## Payload Fields

All fields sent to PDFMonkey in the document payload:

| Field | Source | Notes |
|---|---|---|
| `restaurantName` | Form input | Used in PDF header |
| `fullName` | Form input | Addressee on cover |
| `conceptType` | Form input | Shown in report context |
| `locations` | Form input | Shown in report context |
| `annualSpend` | Qualification | Dollar string |
| `spendBucket` | Qualification | e.g. "$1M–$3M" |
| `finalPctDisplay` | Qualification | e.g. "5.75%" |
| `dollarEstimateDisplay` | Qualification | e.g. "$115,000" |
| `dollarEstimate` | Qualification | Integer for chart |
| `caseStudy` | Qualification | Case study name |
| `year1`…`year5` | Qualification | 5-year projections |
| `projectionHeights` | Qualification | Bar chart heights as % of year5 |
| `logoUrl` | AI Researcher → logo validation | `null` for conservative mode |
| `businessSummary` | AI Researcher | Max 500 chars |
| `narrativeDistributor` | AI Narrative | Max 600 chars, no em/en-dashes |
| `narrativeProcurement` | AI Narrative | Max 600 chars, no em/en-dashes |
| `narrativeSku` | AI Narrative | Max 600 chars, no em/en-dashes |
| `mode` | `determinePdfMode()` | `"full"` or `"conservative"` |

---

## Logo Validation

Before including a logo URL in the payload, `validateLogoForPdf()` performs a HEAD request with a 5-second timeout. The logo is **rejected** (set to null) if:

1. URL is null or non-HTTP
2. URL contains a private IP (`127.0.0.1`, `localhost`, `192.168.*`, `10.0.*`, `172.16.*`)
3. HEAD returns non-OK status
4. `Content-Type` is not `image/*`
5. `Content-Type` is `image/x-icon` or `image/vnd.microsoft.icon` (ICO files — poor PDF quality)
6. Image is too small: `Content-Length` < 5 KB (likely a placeholder or favicon)
7. `apple-touch-icon` or PNG icon with declared size < 100×100 px

If validation passes, the image is fetched and embedded as a base64 data URI to avoid a second network fetch from PDFMonkey's renderer (which is where broken image boxes can appear even after URL validation succeeds).

**Conservative PDF:** Logo is always null — `validateLogoForPdf()` returns null immediately without any network request.

---

## Generation Flow

```
generatePdf(input)
  │
  ├─ determinePdfMode() → mode: 'full' | 'conservative' | 'skip'
  │
  ├─ [if 'skip'] → return { pdfStatus: 'skipped' }
  │
  ├─ ensureTemplateSafe()    → patches template CTA links (idempotent)
  │
  ├─ validateLogoForPdf()   → HEAD request + data URI embed (5s timeout)
  │
  ├─ buildPdfPayload()      → assembles PDFMonkey document payload
  │
  ├─ POST https://api.pdfmonkey.io/api/v1/documents
  │     Authorization: Bearer $PDFMONKEY_API_KEY
  │     Body: { document: { document_template_id, payload, status: "pending" } }
  │
  ├─ Poll for document completion (PDFMonkey generates async)
  │     → returns download_url when complete
  │
  └─ Return { pdfStatus: 'complete', pdfDownloadUrl, pdfMonkeyDocumentId, ... }
```

---

## Hard Rules — PDF Delivery

These rules are non-negotiable. Violating them breaks Chrome PDF display. See `docs/hard-rules.md` for full context.

**1. PDFs must NEVER trigger a download.**
All PDF delivery must be web-view only, served inline in the browser.

**2. The `/report/[id]` page must proxy through `/api/report/[id]`.**
The iframe `src` on the report page must always point to `/api/report/[id]`. The raw PDFMonkey `download_url` must never be used directly as an iframe src or redirect — Chrome downloads it instead of displaying it.

**3. The proxy route must set `Content-Disposition: inline`.**
`src/app/api/report/[id]/route.ts` fetches PDF bytes server-side and returns them with:
```
Content-Type: application/pdf
Content-Disposition: inline; filename="Food-Cost-Analyzer.pdf"
```

**4. The `/report/[id]` iframe must NOT have a `sandbox` attribute.**
Sandbox restricts the native PDF viewer. `allow-scripts` + `allow-same-origin` together causes Chrome to block the page entirely.

**5. The proxy route must NOT set `Content-Security-Policy: sandbox`.**
CSP sandbox on a binary PDF response is ignored by browsers and causes Chrome blocks.

---

## Error Handling

`generatePdf()` never throws. All error paths return a `GeneratePdfResult` with appropriate status:

| Condition | `pdfStatus` | Notes |
|---|---|---|
| `PDFMONKEY_API_KEY` or `PDFMONKEY_TEMPLATE_ID` missing | `"skipped"` | Safe dev behavior |
| Template patch fails | `"error"` | Generates anyway — patch is best-effort in some retry paths |
| PDFMonkey API returns error | `"error"` | Error message stored in `pdfError` |
| PDFMonkey timeout | `"error"` | Poll timeout exceeded |

Failed PDF → `pdfStatus: "error"` → stored in DB → lead proceeds with GHL sync anyway (PDF error is non-fatal).

---

## Local Testing

PDFMonkey generates real PDFs — there is no mock mode. To test locally:

1. Set `PDFMONKEY_API_KEY` and `PDFMONKEY_TEMPLATE_ID` in `.env.local`
2. Submit a test form with a qualified spend range
3. Check the DB record for `pdfStatus`, `pdfDownloadUrl`
4. Visit `/report/[submissionId]` to verify inline display

Use a separate staging/test template in PDFMonkey to avoid consuming production quota.

---

## See Also

- `docs/hard-rules.md` — browser compatibility rules for report page
- `docs/database-schema.md` — `pdfMode`, `pdfStatus`, `pdfDownloadUrl` fields
- `docs/ai-narrative.md` — narrative fields that flow into PDF payload
- `docs/deployment.md` — `PDFMONKEY_API_KEY`, `PDFMONKEY_TEMPLATE_ID` setup
