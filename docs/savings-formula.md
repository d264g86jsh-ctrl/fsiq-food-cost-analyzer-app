# Savings Formula — FSIQ Food Cost Analyzer

**This document is the source of truth for how estimated food cost savings are calculated.**

SOP reference: `docs/FSIQ_SOP_v3.3.md` §10 (primary) / `docs/FSIQ_SOP_v3.3.pdf` (archive) — clamp updated per approved product decision.  
Implemented in: `src/lib/qualification/savings-formula.ts`, `src/lib/qualification/spend-parser.ts`, `src/lib/qualification/qualify-lead.ts`

---

## Approved Product Decision

The approved `finalPct` clamp is **4.0%–8.0%**.  
This intentionally overrides the SOP's prior 5.0%–8.0% clamp.  
Any future change requires explicit approval and updated tests.

---

## AI Boundary (non-negotiable)

AI (Claude) generates narrative text only. AI must never determine:
- `finalPct`
- `spendBucket`
- `dollarEstimate`
- `caseStudy`
- DQ status or any qualifying/disqualifying decision

These are computed deterministically by the qualification engine.

---

## 1. Required Inputs

| Field | Source | Notes |
|---|---|---|
| `restaurantName` | Form | Used for national chain check |
| `annualFoodSpend` | Form | Text/dropdown — parsed by spend parser |
| `conceptType` | Form | Used for benchmark display |
| `locations` | Form | Modifier input |
| `distributorType` | Form | Modifier input |
| `procurementStrategy` | Form | Modifier input |
| `topSkus` | Form | Modifier input |
| `websiteStatus` | Validator | Used for `invalid_website` DQ check |

---

## 2. DQ Priority Order

Check in this exact order. First match wins.

1. `national_chain` — restaurant name matches NATIONAL_CHAINS list
2. `invalid_website` — `websiteStatus === 404` (only HTTP 404; not 403, 503, 0, or timeout)
3. `below_threshold` — `annualSpend < $500,000`
4. `below_minimum` — `annualSpend < $50,000` (sub-case of below_threshold)

If none match → `qualified = true`, proceed to scoring.

---

## 3. Spend Parsing Rules

File: `src/lib/qualification/spend-parser.ts`

- Strip `$`, `,`, currency symbols before parsing
- Detect range (e.g. `$1M–$3M`) → use midpoint of range
- Detect multiplier suffixes: `k`/`K` = ×1,000; `m`/`M`/`million` = ×1,000,000
- Bare number heuristic:
  - 1–99 → interpret as millions
  - 100–9,999 → interpret as thousands
- Word numbers: `one`, `two`, … `ten`, `half` supported
- Typo tolerance: `mllion`, `milion`, `millon` → million
- Unresolvable input → fallback to `$2,000,000` with `parseFallback: true`

---

## 4. Spend Buckets and Midpoints

| Bucket | Range | Midpoint |
|---|---|---|
| `$500K–$800K` | $500,000–$799,999 | $650,000 |
| `$800K–$1M` | $800,000–$999,999 | $900,000 |
| `$1M–$3M` | $1,000,000–$2,999,999 | $2,000,000 |
| `$3M–$7M` | $3,000,000–$6,999,999 | $5,000,000 |
| `$7M+` | $7,000,000+ | $8,500,000 |

Spend below $500K → DQ (`below_threshold`). No bucket assigned.

---

## 5. Base Percentage by Spend Bucket

| Bucket | Base % |
|---|---|
| `$500K–$800K` | 5.00% |
| `$800K–$1M` | 5.25% |
| `$1M–$3M` | 5.50% |
| `$3M–$7M` | 5.75% |
| `$7M+` | 6.00% |

---

## 6. Distributor Modifiers

| Distributor Type | Modifier |
|---|---|
| National broadliners (Sysco, US Foods) | +0.70% |
| Combination | +0.35% |
| Regional distributor | +0.35% |
| Local/specialty only | +0.00% |

---

## 7. Procurement Strategy Modifiers

| Procurement Strategy | Modifier |
|---|---|
| Market price, single distributor | +0.70% |
| Market price, multiple distributors | +0.35% |
| GPO or Group Purchasing Organization | +0.20% |
| Negotiated cost-plus agreement | +0.00% |

---

## 8. SKU Modifiers

Detected by keyword match against `topSkus` free-text field.

**Protein keywords:** chicken, beef, pork, fish, seafood, brisket, ribs, steak, lamb, salmon, shrimp, turkey, bacon, sausage

**Commodity keywords:** oil, dairy, eggs, cheese, milk, butter, produce, lettuce, tomato, onion, flour, sugar, potato, fries

| Condition | Modifier |
|---|---|
| Protein AND commodity both detected | +0.30% |
| Protein OR commodity (not both) | +0.15% |
| Neither detected | +0.00% |

---

## 9. Location Count Modifiers

| Locations | Modifier |
|---|---|
| 5+ locations | +0.30% |
| 2–4 locations | +0.15% |
| Single location | +0.00% |

---

## 10. finalPct Calculation and Clamp

```
rawTotal = basePct + distributorMod + procurementMod + skuMod + locationsMod
finalPct = max(4.0, min(8.0, rawTotal))
```

**Approved clamp: 4.0%–8.0%.**  
Do not change floor or ceiling without explicit product approval.  
`finalPct` is rounded to one decimal for display (e.g. `6.4%`).

---

## 11. dollarEstimate Calculation

```
dollarEstimate = round(finalPct / 100 × bucketMidpoint)
```

Uses the bucket midpoint, not the submitted spend value.  
No other formula. AI must not modify or override this value.

---

## 12. 5-Year Projection Calculation

Applies cumulative USDA food-away-from-home inflation at **3.9% annually**.

```
year1 = dollarEstimate
year2 = year1 + year1 × (1 + 0.039)^1
year3 = year2 + year1 × (1 + 0.039)^2
year4 = year3 + year1 × (1 + 0.039)^3
year5 = year4 + year1 × (1 + 0.039)^4
```

Bar chart heights: each year's height as a percentage of `year5` (always 100%). Minimum bar height: 8%.

Do not change the inflation rate without approval.

---

## 13. Case Study Selection

File: `src/lib/qualification/savings-formula.ts` (or inline in `qualify-lead.ts`)

| Bucket | Single location | 2–4 locations | 5+ locations |
|---|---|---|---|
| `$500K–$800K` | Black's BBQ | MaryAnn's Diner | MaryAnn's Diner |
| `$800K–$1M` | Black's BBQ | MaryAnn's Diner | MaryAnn's Diner |
| `$1M–$3M` | Spirits | MaryAnn's Diner | MaryAnn's Diner |
| `$3M–$7M` | The Oasis | Dish Society | Thunderdome |
| `$7M+` | The Oasis | Dish Society | Thunderdome |

Default fallback: Black's BBQ.

---

## 14. Required Tests

File: `src/lib/__tests__/savings-formula.test.ts`

### Spend Parser
- `1` → $1,000,000 (`$1M–$3M` bucket)
- `500` → $500,000 (`$500K–$800K` bucket)
- `500k` → $500,000 (`$500K–$800K` bucket)
- `1-2M` → $1,500,000 midpoint (`$1M–$3M` bucket)
- `one million` → $1,000,000
- `depends` → $2,000,000 fallback, `parseFallback: true`
- `on mllion` → $1,000,000 (typo tolerance)
- `$3,500,000` → $3,500,000 (`$3M–$7M` bucket)

### DQ Priority
- National chain name → `national_chain` regardless of spend or website
- 404 website + valid spend → `invalid_website` (only after chain check)
- 403/503/0/timeout website + valid spend → not `invalid_website`; proceed to spend check
- Spend $499,999 → `below_threshold`
- Spend $500,000 → `qualified = true`

### Bucket Boundaries
- $499,999 → `below_threshold`
- $500,000 → `$500K–$800K`
- $799,999 → `$500K–$800K`
- $800,000 → `$800K–$1M`
- $999,999 → `$800K–$1M`
- $1,000,000 → `$1M–$3M`
- $2,999,999 → `$1M–$3M`
- $3,000,000 → `$3M–$7M`
- $6,999,999 → `$3M–$7M`
- $7,000,000 → `$7M+`

### finalPct Clamp
- `rawTotal` = 3.5 → `finalPct` = 4.0 (floor applied)
- `rawTotal` = 4.0 → `finalPct` = 4.0 (at floor, no clamp)
- `rawTotal` = 6.5 → `finalPct` = 6.5 (no clamp)
- `rawTotal` = 8.0 → `finalPct` = 8.0 (at ceiling, no clamp)
- `rawTotal` = 9.1 → `finalPct` = 8.0 (ceiling applied)

### dollarEstimate
- `$1M–$3M` bucket, `finalPct` 5.5% → `round(0.055 × 2,000,000)` = `$110,000`
- `$500K–$800K` bucket, `finalPct` 4.0% → `round(0.04 × 650,000)` = `$26,000`
- `$7M+` bucket, `finalPct` 8.0% → `round(0.08 × 8,500,000)` = `$680,000`

### 5-Year Projections
- Year 1 = `dollarEstimate`
- Year 5 is always the largest value
- `year5HeightPct` = 100; all other heights are proportional
- Minimum bar height = 8%
- Inflation rate = 3.9% annually, cumulative

### Case Study Selection
- `$500K–$800K` + single → Black's BBQ
- `$500K–$800K` + 2–4 → MaryAnn's Diner
- `$1M–$3M` + single → Spirits
- `$3M–$7M` + 2–4 → Dish Society
- `$7M+` + 5+ → Thunderdome
- `$3M–$7M` + single → The Oasis
