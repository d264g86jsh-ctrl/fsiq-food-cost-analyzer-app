# Restaurant Signal Scoring Algorithm

**Source of truth for:** `src/lib/relevance/classify-restaurant.ts`, `src/lib/website/extract-signals.ts`, `src/lib/website/run-validation.ts`

**Last updated:** 2026-06-03 (reflects all 5 validation accuracy fixes from this session)

> **Note:** `docs/website-validation-spec.md` predates these changes. Where this file and that spec conflict, **this file wins**. The spec will be updated separately.

---

## Overview

Each submitted website is scored on two independent axes:

- **`restaurantSignalScore`** (0–100): evidence that this is a restaurant
- **`negativeSignalScore`** (0–100): evidence that this is NOT a restaurant (SaaS, vendor, non-restaurant business)

The decision threshold applies both scores together via a tiered rule (see Decision Thresholds below).

---

## Signal Inventory

### Positive signals — high weight

| Signal | Source | Points | Cap / Guard |
|---|---|---|---|
| `Restaurant` / `FoodEstablishment` schema.org type | JSON-LD or microdata | +20 | max +30 across all schema types |
| `CafeOrCoffeeShop` / `BarOrPub` / `Bakery` / `FastFoodRestaurant` / `Winery` / `Brewery` schema type | JSON-LD | +15 | max +30 total |
| `FoodService` schema type | JSON-LD | +10 | max +30 total |
| `og:type = restaurant.restaurant` | Open Graph | +15 | — |
| Nav link matching strong CTA list | HTML `<nav>` or fallback | +15 per hit | — |
| Heading or button matching strong CTA list | `<h1>`–`<h4>`, `<button>` | +12 per hit | — |
| Reservation widget embedded (OpenTable, Resy, ExploreToast, SevenRooms, ReserveWithGoogle, Wisely) | asset URLs in href/src/data-src | +12 | guarded by `hasStrongNonRestaurantExclusion` |
| Squarespace native ordering/menu widget (`sqs-block-checkout`, `sqs-block-menu`, `data-block-type="commerce\|menu"`) | raw HTML class/attr | +10 | guarded |
| Wix restaurant widget (`wixrestaurants`, `wix-restaurant`, `wix-menus`) | raw HTML (case-insensitive) | +10 | guarded |
| Ordering widget embedded (ToastTab, ChowNow, PopMenu, Olo, Square, DoorDash, Uber Eats, Grubhub, Slice) | asset URLs | +10 | guarded |
| URL path segment: `/menu` or `/menus` or `/reservations` or `/reserve` or `/book-a-table` | page URL | +12 | — |
| Strong positive body text (`dine-in`, `happy hour`, `brunch`, `tasting menu`, `prix fixe`, `private dining`, `outdoor seating`, `rooftop`, `full bar`) | body text + title + nav combined | +10 per keyword | — |
| Hours-of-operation pattern (`Mon 5pm`, `Sat 12:00`) | body text regex | +12 | — |
| Address + phone block (state+zip OR street suffix) | body text regex | +8 | guarded |
| Social/ordering links (OpenTable, Resy, Yelp/biz, TripAdvisor, DoorDash/store, UberEats/store, Grubhub/restaurant) | href attributes | +8 per link | — |
| Domain keyword — high: `restaurant`, `bistro`, `brasserie`, `trattoria`, `taqueria`, `pizzeria`, `steakhouse`, `smokehouse`, `chophouse`, `gastropub`, `spirits` | domain words | +30 each (used in contextual boost path) | — |
| Domain keyword — moderate: `grill`, `kitchen`, `cafe`, `eatery`, `diner`, `cantina`, `tavern`, `brewery`, `seafood`, `bbq`, `bakery`, `pub`, `bar`, `bodega`, `pizza`, `sushi`, `ramen`, `taco` | domain words | +8 in scoring, +20 in contextual | — |
| Google Maps embedded iframe (`maps.google.com`, `maps.googleapis.com`, `google.com/maps/embed`, `openstreetmap.org`) | raw HTML (any attribute) | +8 | not guarded |
| URL path: `/order` or `/order-online` | page URL | +8 | — |
| Moderate body text keywords (`restaurant`, `chef`, `sommelier`, `cuisine`, `menu`, `reservation`, `pizza`, `burger`, `taco`, `sushi`, `bbq`, `pasta`, `seafood`, `wings`, `sandwich`, `brunch`, etc.) | combined text | +6 per keyword | — |
| Moderate domain keywords (same list as above) | page title + meta + og fields | +5 per keyword | — |
| URL path: `/hours` or `/locations` | page URL | +6 | — |
| Phone number prominently displayed | body text regex | +6 | — |
| Price + food keyword proximity: 2+ `$\d{1,3}` patterns within 200 chars of food keyword | body text | +8 | guarded |
| Food image alt text (food nouns in `<img alt>`) | image alt attributes | +4 | guarded |
| Age gate (`age-gate` class, age verification text) | raw HTML | +10 | — |
| `hasComingSoon` | body text | sets floor at +10 | — |

### Positive signals — strong CTA keyword list (`STRONG_POSITIVE_NAV`)

The following terms score +15 when found in nav link text, +12 in headings/buttons:

`menu`, `reservations`, `book a table`, `order online`, `catering`, `private dining`, `book now`, `reserve now`, `reserve a table`, `book your table`, `reserve your table`, `make a reservation`, `make a booking`, `reserve your spot`, `book your spot`, `book a seat`, `reserve a seat`, `request a table`, `request seating`, `check availability`, `find availability`, `book online`, `reserve online`, `online reservations`, `dining reservations`, `table reservations`, `book dining`, `reserve seating`, `book seating`, `schedule a reservation`, `get reservations`, `book a reservation`, `book a time`, `reserve a time`, `group reservations`, `group bookings`, `book groups`

### Negative signals

| Signal | Points |
|---|---|
| `SoftwareApplication`, `WebApplication`, `MobileApplication` schema type | +20 |
| Strong negative text (`book a demo`, `request a demo`, `free trial`, `pricing plans`, `enterprise`, `software platform`, `saas`, `pos system`, `supply chain`, `distributor`, `wholesale`, `manufacturer`, `foodservice equipment`, `law firm`, `dental`, `medical clinic`, `real estate`, `insurance`, `auto repair`, `hotel rooms`, etc.) | +20 per keyword |
| Nav link matching `/pricing`, `/demo`, `/enterprise`, `/solutions`, `/integrations`, `/docs`, `/developers` | +15 |
| Moderate negative text (`clients`, `partners`, `roi`, `scalability`, `schedule a call with sales`, `case studies`, `services`, `industries`, `team`, `portfolio`, `practice areas`, `therapy`, `realtor`, `payroll`, etc.) | +10 per keyword |

---

## Scoring Formula (Pseudocode)

```
restaurantRaw = 0
negativeRaw   = 0

# Schema.org types
restaurantRaw += scoreRestaurantSchemaTypes(schemaOrgTypes)   # capped at 30
if hasVendorSchema: negativeRaw += 20

# Nav links (+15 each hit), headings/buttons (+12 each)
for navText in navLinkTexts:
  if STRONG_POSITIVE_NAV matches: restaurantRaw += 15
  if STRONG_NEGATIVE_NAV matches: negativeRaw += 15

for text in headingTexts + buttonTexts:
  if STRONG_POSITIVE_NAV matches: restaurantRaw += 12
  if MODERATE_TEXT_KEYWORDS matches: restaurantRaw += 6

# Body text keywords
for kw in STRONG_POSITIVE_TEXT: if present: restaurantRaw += 10
for kw in MODERATE_TEXT_KEYWORDS: if present: restaurantRaw += 6

# Domain keywords
for kw in MODERATE_DOMAIN_KEYWORDS: if in domain: restaurantRaw += 8

# Page title / meta / og fields
for kw in MODERATE_TEXT_KEYWORDS: if in titleAndDesc: restaurantRaw += 5
for kw in MODERATE_DOMAIN_KEYWORDS: if in titleAndDesc: restaurantRaw += 5
if ogType contains "restaurant": restaurantRaw += 15

# URL path segments
for segment in urlPathSegments:
  if in [menu, menus, reservations, reserve, book-a-table]: restaurantRaw += 12
  if in [order, order-online]: restaurantRaw += 8
  if in [hours, locations]: restaurantRaw += 6

# Negative text keywords
for kw in STRONG_NEGATIVE_TEXT: if present: negativeRaw += 20
for kw in MODERATE_NEGATIVE_TEXT: if present: negativeRaw += 10

# Social/ordering links
for link in socialLinks:
  if matches STRONG_POSITIVE_SOCIAL: restaurantRaw += 8

# Embedded widgets (all guarded by !hasStrongNonRestaurantExclusion)
if hasReservationWidget: restaurantRaw += 12
if hasOrderingWidget: restaurantRaw += 10
if hasSquarespaceBizWidget: restaurantRaw += 10
if hasWixRestaurantWidget: restaurantRaw += 10

# Physical location signals
if hasGoogleMapsEmbed: restaurantRaw += 8   # NOT guarded — always applies
if hasPriceMenuPattern AND !hasStrongNonRestaurantExclusion: restaurantRaw += 8
if hours pattern in bodyText: restaurantRaw += 12
if phone regex match: restaurantRaw += 6
if hasAddressPhoneBlock AND !exclusion: restaurantRaw += 8

# Visual
if hasFoodImageAltText AND !exclusion: restaurantRaw += 4

# Special states
if hasAgeGate: restaurantRaw += 10
if hasComingSoon: restaurantRaw = max(restaurantRaw, 10)
if hasParkingPage: restaurantRaw = 0; negativeRaw = 0

# Bundle score (additional points for corroborating combinations)
restaurantRaw += computeBundleScore(...)

# Hard cap: if score >= 60 and no operational anchor, cap at 59
restaurantSignalScore = capUnanchoredRestaurantScore(clamp(restaurantRaw))
negativeSignalScore   = clamp(negativeRaw)
```

---

## Decision Thresholds

Applied in `applyDecisionRules()` in `run-validation.ts`. Rules are evaluated in order; first match wins.

### Clear non-fit rules (applied before verified rules)
```
if negativeSignalScore >= 40 AND restaurantSignalScore < 20 → clear_non_fit
if negativeSignalScore >= 70 AND restaurantSignalScore < 30 → clear_non_fit
```

### Verified restaurant rules (tiered — updated 2026-06-03)
```
# Tier 1: very high restaurant confidence tolerates moderate negative noise
if restaurantSignalScore >= 80 AND negativeSignalScore < 40 AND chainScore < 85
  → verified_restaurant (reason: high_restaurant_score_strong)

# Tier 2: standard verified threshold, tightened negative guard
if restaurantSignalScore >= 60 AND negativeSignalScore < 30 AND chainScore < 85
  → verified_restaurant (reason: high_restaurant_score)
```

**Previous rule (now superseded):** `restaurantSignalScore >= 60 AND negativeSignalScore < 20`. Changed because sites like Porto's Bakery (score=100, neg=20 from `wholesale`) were incorrectly blocked.

---

## capUnanchoredRestaurantScore

If `restaurantSignalScore >= 60` but no **operational anchor** is present, the score is hard-capped at 59. This prevents sites that mention food words (food-tech SaaS, food distributors) from reaching `verified_restaurant` on keywords alone.

**Operational anchors** (any one of these disables the cap):
- `hasRestaurantSchema` (Restaurant/FoodEstablishment JSON-LD)
- `hasReservationWidget` (OpenTable, Resy, etc. in asset URLs)
- `hasOrderingWidget` (ToastTab, ChowNow, etc.)
- `hasAddressPhoneBlock` (phone + state+zip OR phone + street suffix)
- `hasFoodImageAltText`
- Social link to `opentable.com`, `resy.com`, `yelp.com/biz`, `tripadvisor.com`, `doordash.com/store`, `ubereats.com/store`, `grubhub.com/restaurant`
- `ogImage` present
- Phone regex match AND street address regex match simultaneously
- Non-English restaurant keyword bundle (2+ hits in Spanish/Chinese/Vietnamese/Korean)

**Note:** `hasSquarespaceBizWidget`, `hasWixRestaurantWidget`, `hasGoogleMapsEmbed`, and `hasPriceMenuPattern` are **not** in the anchor list. Sites relying solely on these new signals still need at least one traditional anchor to exceed 59.

---

## Confidence Bundle (50–59 Score Band)

Sites scoring 50–59 with `negativeSignalScore === 0` and `nationalChainScore < 50` can reach `verified_restaurant` if they have 3+ independent corroborating signals:

```
independentCount = count of:
  - hasRestaurantSchema
  - navLinkTexts matches menu/reservation/reserve/order
  - hasReservationWidget
  - hasOrderingWidget
  - hasAddressPhoneBlock
  - phone regex in bodyText
  - ogTitle AND metaDescription both present
```

If `independentCount >= 3` → `verified_restaurant` (reason: `confidence_bundle_50_59`).

---

## Contextual Domain Boost (inaccessible/blocked sites)

When a site is unreachable (`reachability === 'inaccessible'`, `'blocked'`, or `'thin'`), `computeProtectedRestaurantContextScore()` runs a domain-name-only analysis. If the domain word score (`scoreRestaurantDomainWord`) + page context score totals **≥ 30** and no non-restaurant context terms are present, the score is boosted to **60**, enabling `verified_restaurant` via Tier 2.

Word scores: `restaurant`, `bistro`, `brasserie`, `trattoria`, `taqueria`, `pizzeria`, `steakhouse`, `smokehouse`, `chophouse`, `gastropub`, `spirits` → **30 pts** each. `grill`, `kitchen`, `cafe`, `eatery`, `diner`, `cantina`, `tavern`, `brewery`, `seafood`, `bbq`, `bakery`, `pub`, `bar`, `bodega` → **20 pts** each.

---

## Session Changelog (2026-06-03)

| Fix | Change | Sites rescued (est.) |
|---|---|---|
| **Fix #1** — inaccessible domain boost | Extended `computeProtectedRestaurantContextScore` to fire for `reachabilityStatus === 'inaccessible'` (previously only `blocked`/`thin`) | ~18 of 185 timeout sites |
| **Fix #2** — hasAddressPhoneBlock | Added street-suffix regex as an alternative to state+zip (phone + `123 Main St` now qualifies) | ~11 low-signal sites |
| **Fix #3** — timeout retry | Removed useless same-URL 5s retry; each of 4 URL variants gets one clean 10s attempt | Reduces wasted time |
| **Gap 1** — CTA keywords | Expanded `STRONG_POSITIVE_NAV` from 6 to 37 reservation/booking CTA terms | ~6–10 sites |
| **Gap 3** — CMS widgets | Added `hasSquarespaceBizWidget` (+10) and `hasWixRestaurantWidget` (+10) | ~3–6 sites |
| **Gap 5** — Google Maps | Added `hasGoogleMapsEmbed` (+8) | ~3–5 sites |
| **Gap 2** — price menu pattern | Added `hasPriceMenuPattern` (+8) for price near food keyword | ~4–8 sites |
| **Tiered threshold** | Replaced single `neg < 20` rule with two tiers (`neg < 40` at score ≥ 80, `neg < 30` at score ≥ 60) | ~48 of 55 blocked reachable sites |

**Benchmark impact:** Verified restaurant rate 32.94% → 48.24% (+15.3 pp). Overall accuracy 50.1% → 93.76%.

---

## See Also

- `docs/website-validation-spec.md` — full validation spec, including section G2 for domain detection and confidence scoring (this file overrides the spec on signal weights and thresholds)
- `docs/database-schema.md` — `restaurantSignalScore`, `negativeSignalScore` fields
- `src/lib/relevance/classify-restaurant.ts` — full scoring implementation
- `src/lib/website/extract-signals.ts` — signal extraction from raw HTML
