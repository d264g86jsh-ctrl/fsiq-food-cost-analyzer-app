# Meta Tracking — Pixel, CAPI, and Attribution

**Related:** `docs/ghl-email-handoff.md` (GHL attribution fields) · `docs/database-schema.md` (Submission attribution columns) · `docs/environment.md` (env vars)  
**Source of truth for:** `src/lib/meta/`, `src/lib/meta/browser-events.ts`, `src/lib/meta/meta-events.ts`, `src/app/layout.tsx`

---

## Overview

Every submission fires events to two systems simultaneously:

1. **Browser Pixel** (`fbq()`) — fires on the client via `fbevents.js`. Meta deduplicates against CAPI using a shared `event_id`.
2. **Server CAPI** (`/graph.facebook.com/v19.0/{pixelId}/events`) — fires server-side via the Conversions API after form processing. Carries PII (SHA-256 hashed email/phone) + richer signal.

Both sides fire for the same event. Meta's deduplication algorithm keeps the best-matched signal, discards the duplicate. **This is intentional and correct — it provides redundancy if either side is blocked.**

**Pixel ID:** `1679245649839076` (hardcoded in `layout.tsx`; also set via `NEXT_PUBLIC_META_PIXEL_ID` env var for CAPI's `META_PIXEL_ID`).

---

## Events

### PageView (browser only)
- **When:** Every page load.
- **How:** `fbq('track', 'PageView')` fires from the `meta-pixel-init` script in `layout.tsx` (`afterInteractive`).
- **Server counterpart:** None. No dedup needed.

### Lead (browser + CAPI)
- **When:** User submits the form (Step 4).
- **Browser:** `fireBrowserLead(eventId, { email, phone, firstName })` — fires in `AnalyzerForm.tsx` immediately before `submitAnalysis()`. PII fields are passed unhashed; fbq.js hashes them client-side.
- **CAPI:** `buildLeadEvent()` fires inside `syncAndReturn()` for **ALL routes** (DQ + qualified + manual review). Email and phone are SHA-256 hashed server-side.
- **Dedup:** Both events carry the same `event_id` (UUID generated in `AnalyzerForm.tsx:257`). Meta deduplicates to 1 event.
- **`lead_type` custom_data:** `qualified` for qualified leads; `dqReason` value (e.g. `below_threshold`) for DQ leads; `disqualified` if `dqReason` is null.

### QualifiedLead (browser + CAPI)
- **When:** A submission qualifies AND a PDF is confirmed ready.
- **Browser:** `fireQualifiedLead({ eventId: 'ql-{eventId}', value: dollarEstimate, ... })` fires in `AnalyzerForm.tsx` immediately after `result.qualified === true`.
- **CAPI:** `buildQualifiedLeadEvent()` fires in the background pipeline (`waitUntil`) after `pdfStatus === 'complete'`.
- **Dedup:** Both events carry `event_id: 'ql-{eventId}'` — same `ql-` prefix, same UUID. Meta deduplicates to 1 event.
- **Value:** Both browser and CAPI events carry `value: dollarEstimate` (integer, whole dollars) and `currency: 'USD'`. This ensures Meta retains the value signal regardless of which event it keeps after deduplication.
- **Timing:** Browser fires in ~1 second; CAPI fires ~45–90 seconds later (after AI + PDF). Both are within Meta's 48-hour dedup window.

### AnalyzerStarted (browser only)
- **When:** User first interacts with any field in the analyzer form.
- **How:** `fireAnalyzerStarted()` fires once on first field interaction (`analyzerStartedFired` ref prevents re-firing).
- **Server counterpart:** None. No `event_id` needed.

---

## event_id Scheme

```
Lead:           {uuid}        — e.g. "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
QualifiedLead:  "ql-" + {uuid} — e.g. "ql-a1b2c3d4-e5f6-7890-abcd-ef1234567890"
```

The `ql-` prefix ensures `QualifiedLead` never accidentally deduplicates against the `Lead` event (different event names + different event IDs = two distinct signals).

---

## Attribution Capture

**Canonical rule:** `URLSearchParams.get()` is the single decode point. `+` → space, `%xx` → character. Every downstream hop (form state, server action, JSON to GHL) operates on the already-decoded string. No re-encoding anywhere.

### Capture pipeline

```
1. Page load (afterInteractive, layout.tsx):
   • URLSearchParams.get() for each param → stored as individual fsiq_* sessionStorage keys
   • document.referrer → fsiq_referrer (first-touch only)

2. AnalyzerForm mount (useEffect once):
   • persistTrackingParams() → writes all params to fsiq_tracking JSON
     (first-touch model — if fsiq_tracking already exists, does nothing)
   • readMetaCookies(fbclid) → reads _fbp, derives fbc from fbclid if _fbc absent
   • All values merged into form state as hidden fields

3. Form submit:
   • All hidden tracking fields included in AnalyzerFormPayload
   • event_id generated: crypto.randomUUID()
   • fireBrowserLead(eventId, pii) — browser pixel

4. submitAnalysis (server action):
   • deriveLeadSource(utm_source, fbclid) → 'meta' | 'google' | 'organic' | 'direct'
   • All attribution fields saved to Submission DB record
   • trackingContext assembled (fbp, fbc, eventId, clientIpAddress, landingPageUrl)
   • CAPI Lead event fired for all routes

5. Background pipeline (waitUntil — qualified path only):
   • CAPI QualifiedLead event fired after pdfStatus = 'complete'
```

### Params captured

| URL param | DB column | GHL custom field | Notes |
|-----------|-----------|-----------------|-------|
| `utm_source` | `utmSource` | `fsiq_utm_source` | |
| `utm_medium` | `utmMedium` | `fsiq_utm_medium` | `+` decoded as space |
| `utm_campaign` | `utmCampaign` | `fsiq_utm_campaign` | |
| `utm_content` | `utmContent` | `fsiq_utm_content` | `%2B` → literal `+` |
| `utm_term` | `utmTerm` | `fsiq_utm_term` | |
| `utm_id` | `utmId` | `fsiq_utm_id` | Meta/GA4 campaign numeric ID |
| `fbclid` | `fbclid` | `fsiq_fbclid` | Drives `deriveLeadSource → 'meta'` |
| `fbadid` | `fbadid` | `fsiq_fbadid` | Meta ad creative ID |
| `document.referrer` | `referrer` | `fsiq_referrer` | First-touch only; often empty from Meta in-app browser |
| `window.location.href` | `landingPageUrl` | `fsiq_landing_page_url` | Full URL — catch-all for all params |
| (derived) | `leadSource` | `fsiq_lead_source` | `'meta' \| 'google' \| 'organic' \| 'direct'` |
| `_fbp` cookie | `fbp` | — | Passed to CAPI `user_data`; not a GHL custom field |
| `_fbc` cookie | `fbc` | — | Passed to CAPI `user_data`; derived from fbclid if absent |

### `leadSource` derivation

```
fbclid present (any value)   → 'meta'   (checked first — any Meta-ad click has fbclid)
utm_source = facebook/instagram/meta/fb/ig  → 'meta'
utm_source = google/google-ads/googleads/adwords → 'google'
any other utm_source         → 'organic'
no utm_source + no fbclid    → 'direct'
```

Source: `src/lib/meta/lead-source.ts`

### GHL native attribution panel

The app also sends an `attributionSource` object in the GHL contact create body. This populates the native "Source of Traffic" section in the GHL contact's Activity view — the same panel GHL funnels fill automatically. Fields: `utmSource`, `utmMedium`, `utmCampaign`, `utmContent`, `utmTerm`, `url` (landing page), `clickId` (fbclid).

### FSIQ Meta Lead tag

Contacts from Meta-origin submissions (any submission where `leadSource === 'meta'`) receive the tag `FSIQ Meta Lead` in GHL. Applied on both the qualified and DQ paths.

---

## CAPI Technical Details

| Field | Value |
|-------|-------|
| Endpoint | `https://graph.facebook.com/v19.0/{pixelId}/events` |
| API version | v19.0 |
| Auth | `access_token` query param from `META_CONVERSIONS_API_TOKEN` |
| `action_source` | Always `"website"` |
| `event_source_url` | `landingPageUrl` from tracking context (first-touch landing URL) |
| PII hashing | SHA-256 of lowercase-trimmed email; SHA-256 of digits-only phone |
| Test mode | `test_event_code` body param — set via `META_TEST_EVENT_CODE` env var (**must be blank in production**) |

The app logs `console.error` if `META_TEST_EVENT_CODE` is set while `NODE_ENV === 'production'`.

---

## Verification Steps

1. Open Meta Events Manager → your pixel → **Test Events** tab
2. Set `META_TEST_EVENT_CODE` in Vercel Preview environment
3. Load the app — `PageView` should appear in real-time
4. Fill and submit the form — `Lead` (browser) + `Lead` (server) should appear sharing the same `event_id`
5. Submit a qualifying lead — `QualifiedLead` (browser) then `QualifiedLead` (server) should share `ql-{uuid}`
6. Check Event Details panel — confirm `event_source_url` is the landing URL
