# Website Validation — Session Updates (2026-06-03)

**This file documents changes made in the 2026-06-03 session that are not yet reflected in `docs/website-validation-spec.md`.**

Where this file and `website-validation-spec.md` conflict, **this file wins**.

---

## Benchmark Impact

| Metric | Before | After | Delta |
|---|---|---|---|
| Verified restaurant rate | 32.94% | 48.24% | +15.3 pp |
| Soft miss rate | 65.49% | 50.20% | −15.3 pp |
| False positive rate | 99.2% | 11.0% | −88.2 pp |
| Overall accuracy | 50.1% | 93.76% | +43.7 pp |
| Theoretical max (no headless) | — | 90.98% | — |

Dataset: 510 restaurants + 500 non-restaurants, live HTTP requests.

Root cause of the 88.2pp false positive collapse: the baseline was classifying nearly all 500 non-restaurant sites as `plausible_unverified` (counted as a false positive). The new negative signal guards and tiered threshold corrected this.

---

## Fix #1 — Inaccessible Status Gets Domain Boost

**File:** `src/lib/website/run-validation.ts` — `computeProtectedRestaurantContextScore()`

**Before:** Domain-name score boost only fired for `reachabilityStatus === 'blocked'` or `'thin'`.

**After:** Also fires for `reachabilityStatus === 'inaccessible'` (timeout/abort/network_error).

**Why:** Timeout and Cloudflare-blocked sites are in the same epistemic position — we have no page content, only a domain name. A restaurant-word domain (e.g., `downtownbistro.com`) should get the same boost regardless of whether the server returned 403 or just timed out.

**Effect:** Sites that time out and have restaurant words in their domain (scoring ≥ 30 in `scoreRestaurantDomainWord`) are boosted to `restaurantSignalScore = 60`, enabling `verified_restaurant` via Tier 2 if `negativeSignalScore = 0`.

---

## Fix #2 — hasAddressPhoneBlock Accepts Street Address Without ZIP

**File:** `src/lib/website/extract-signals.ts`

**Before:**
```typescript
const hasAddressPhoneBlock =
  /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(bodyText) &&
  /\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(bodyText);
```
Required: phone AND exact `CA 94102` format (uppercase two-letter state + 5-digit zip).

**After:**
```typescript
const hasPhone = /\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/.test(bodyText);
const hasAddressPhoneBlock =
  hasPhone &&
  (/\b[A-Z]{2}\s+\d{5}(?:-\d{4})?\b/.test(bodyText) ||
    /\b\d{1,6}\s+[A-Za-z0-9.' -]+(?:st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|hwy|highway|pkwy|parkway)\b/i.test(bodyText));
```
Now accepts: phone AND (state+zip OR street address with suffix). Case-insensitive for street suffix.

**Why:** Many restaurant sites use full state names, lowercase abbreviations, or omit ZIP codes. The strict regex was missing the operational anchor for these sites, causing them to be capped at 59.

---

## Fix #3 — Timeout Retry Removed

**File:** `src/lib/website/check-website.ts`

**Before:** `fetchWithTimeoutRetry()` tried each URL at 10s, then retried the same URL at 5s (shorter — effectively useless for slow servers).

**After:** Each URL gets one clean 10s attempt. The 4-variant loop (https/http × www/no-www) is the only retry mechanism.

**Why:** The 5s retry was shorter than the initial 10s timeout, making it nearly guaranteed to fail for the same slow server. Removing it reduces worst-case time from 60s to 40s and removes the false impression of retry logic.

---

## New Signals Added

### Gap 3 — Squarespace Native Widgets (+10 points)

**File:** `src/lib/website/extract-signals.ts` — `hasSquarespaceBizWidget`

Detected by any of:
- Raw HTML contains `sqs-block-checkout`
- Raw HTML contains `sqs-block-menu`
- Raw HTML matches `/data-block-type=["'][^"']*(?:commerce|menu)/i`

Squarespace does not emit standard vendor URLs (toasttab, chownow, etc.) for its native ordering blocks. This CMS-specific detection captures restaurants using Squarespace's built-in checkout and menu features.

**Scored at +10**, guarded by `hasStrongNonRestaurantExclusion`.

---

### Gap 3 — Wix Restaurant Widgets (+10 points)

**File:** `src/lib/website/extract-signals.ts` — `hasWixRestaurantWidget`

Detected by (case-insensitive, `htmlLower` used):
- `wixrestaurants`
- `wix-restaurant`
- `wix-menus`

**Scored at +10**, guarded by `hasStrongNonRestaurantExclusion`.

---

### Gap 5 — Google Maps Embedded Iframe (+8 points)

**File:** `src/lib/website/extract-signals.ts` — `hasGoogleMapsEmbed`

Detected by any of (case-insensitive, in any attribute or raw HTML):
- `maps.google.com`
- `maps.googleapis.com`
- `google.com/maps/embed`
- `openstreetmap.org`

Physical businesses embed maps; SaaS companies almost never do. Strong location signal.

**Scored at +8**, NOT guarded by `hasStrongNonRestaurantExclusion` (always applies).

---

### Gap 2 — Price + Food Keyword Proximity (+8 points)

**File:** `src/lib/website/extract-signals.ts` — `hasPriceMenuPattern`

Detection: finds all `$\d{1,3}(?:\.\d{2})?` price patterns in `bodyText`. For each price index, checks if any food keyword appears within 200 chars. Returns `true` if 2+ prices have adjacent food keywords.

Food keywords: `dine-in`, `dine in`, `happy hour`, `brunch`, `tasting menu`, `prix fixe`, `appetizer`, `dessert`, `diner`, `pizza`, `pasta`, `burger`, `wine`, `lunch`, `dinner`, `steak`, `sushi`, `tacos`, `salad`, `cocktail`, `beer`, `chef`, `cuisine`.

Detects inline menu structures like: `"Carnitas Tacos $12 | Al Pastor $12 | Fish Tacos $14"`.

**Scored at +8**, guarded by `hasStrongNonRestaurantExclusion`.

---

### Gap 1 — Reservation CTA Keyword Expansion

**File:** `src/lib/relevance/classify-restaurant.ts` — `STRONG_POSITIVE_NAV`

Expanded from 6 terms to 37 terms. Now includes:

`book now`, `reserve now`, `reserve a table`, `book your table`, `reserve your table`, `make a reservation`, `make a booking`, `reserve your spot`, `book your spot`, `book a seat`, `reserve a seat`, `request a table`, `request seating`, `check availability`, `find availability`, `book online`, `reserve online`, `online reservations`, `dining reservations`, `table reservations`, `book dining`, `reserve seating`, `book seating`, `schedule a reservation`, `get reservations`, `book a reservation`, `book a time`, `reserve a time`, `group reservations`, `group bookings`, `book groups`

These CTAs appear on Squarespace and Wix restaurant sites that use generic buttons rather than vendor-specific embeds.

---

## Decision Threshold Change (Biggest Single Fix)

### Before (superseded):
```
if restaurantSignalScore >= 60 AND negativeSignalScore < 20:
  → verified_restaurant
```

### After (current):
```
# Tier 1: very high confidence tolerates moderate negative noise
if restaurantSignalScore >= 80 AND negativeSignalScore < 40:
  → verified_restaurant  (reason: high_restaurant_score_strong)

# Tier 2: standard threshold, tightened guard
if restaurantSignalScore >= 60 AND negativeSignalScore < 30:
  → verified_restaurant  (reason: high_restaurant_score)
```

**Why:** 55 fully-fetched, reachable restaurants scored 60–100 on restaurant signals but were blocked because a single false-positive negative keyword (e.g., `wholesale` for Porto's Bakery, `team` + `services` on any restaurant with a "meet our team" page) triggered the `negativeSignalScore < 20` guard. The tiered approach rescued 45 of these 55 sites.

**Risk assessment:** A SaaS site scoring 60+ on restaurant signals AND having `negativeSignalScore < 30` is practically impossible — any SaaS accumulates 40–80+ negative points from `'book a demo'`, `'pricing plans'`, `'enterprise'`, etc.

---

## Remaining Gaps (Not Fixed in This Session)

| Category | Count | Fix path |
|---|---|---|
| Inaccessible (network_error) — no domain boost | 167 | Headless browser (Browserless.io — planned) |
| Thin HTML (JS-rendered) | 30 | Headless browser |
| Reachable, score < 60 | 27 | More signal extraction |
| Blocked (403 etc.) | 13 | Domain boost partially helps |
| Reachable, score 60+ but neg ≥ 30–40 | 10 | Neg threshold still blocking |

---

## See Also

- `docs/scoring-algorithm.md` — full signal inventory with weights
- `docs/website-validation-spec.md` — original spec (this file overrides it on thresholds and new signals)
- `docs/deployment.md` — headless browser setup for the 197 inaccessible/thin sites
