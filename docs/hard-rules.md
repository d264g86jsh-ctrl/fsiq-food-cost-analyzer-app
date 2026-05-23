# Hard Rules

Non-negotiable constraints derived from production incidents. Never override without explicit approval.

---

## PDF Delivery

**PDFs must NEVER be downloaded by the user. All PDF delivery must be web-view only.**

- The `/report/[id]` page must display the PDF inline in the browser — never trigger a download.
- No link, redirect, or response may have `Content-Disposition: attachment` or cause a file download.
- Using a raw S3/CDN `download_url` directly as an iframe `src` causes Chrome to download the file — never do this.
- The only correct approach: proxy PDF bytes through `src/app/api/report/[id]/route.ts`, which fetches bytes server-side and returns them with `Content-Type: application/pdf` and `Content-Disposition: inline`.
- The iframe `src` must always point to `/api/report/[id]`, never to a raw PDFMonkey or S3 URL.

---

## Calendly CTA Links (PDF Annotation Clicks)

**CTA buttons inside the PDF must open in a new browser tab.**

- Chrome's native PDF viewer opens annotation links in new tabs by default — no sandbox or CSP manipulation is required or acceptable.
- `target="_blank"` on the CTA anchor in the PDFMonkey template handles new-tab behavior at the source. See `src/lib/pdf/pdfmonkey-template.ts`.
- Do NOT add a `sandbox` attribute to the report iframe. Reason: `allow-scripts + allow-same-origin` together in a sandbox directive is a known sandbox escape vector — Chrome blocks the page entirely with "This page has been blocked by Chrome."
- Do NOT add `Content-Security-Policy: sandbox ...` to the proxy route response. Reason: CSP is not applied to binary PDF content; it is processed as a navigation-level policy and causes Chrome blocks.

---

## Browser Compatibility

**The report page and proxy route must work without browser security blocks in Chrome, Safari, and Firefox.**

- Never add security headers to the proxy route or report page without testing in Chrome first.
- The combination `sandbox="allow-scripts allow-same-origin"` on an iframe (or as a CSP directive) is blocked by Chrome as a sandbox escape. Never use it.
- If a new security header is proposed for the proxy route or report page, verify it does not apply to the parent navigation context in Chrome.

---

## AI Constraints

**AI must never determine savings math or qualification outcomes.**

- `finalPct`, `spendBucket`, `dollarEstimate`, `caseStudy`, and DQ status are computed by deterministic code only.
- AI pipeline scope: `logoUrl`, `businessSummary`, `conceptSignals`, `narrative_distributor`, `narrative_procurement`, `narrative_sku`.

---

## No Zapier

The app backend calls PDFMonkey, GHL, and Outlook directly. No Zapier middleware. See `docs/architecture.md`.
