# FSIQ Food Cost Analyzer — Current Status

Last updated: 2026-06-03  
Production commit: `a72f610`  
Production URL: `https://fsiq-food-cost-analyzer-app.vercel.app`

---

## Formula ✅

| Item | Value | Source |
|---|---|---|
| Minimum qualifying spend | $600K | `qualify-lead.ts` |
| Global finalPct floor | 4.0% | `savings-formula.ts` |
| Global finalPct ceiling | 6.95% | `savings-formula.ts` |
| Bucket clamping | Per-bucket max applied before global clamp | `savings-formula.ts` |
| Peak savings bucket | $1M–$3M (base 4.95%, max 6.95%) | `savings-formula.ts` |
| 5-year inflation rate | 3.9% USDA | `savings-formula.ts` |

**Spend buckets:**

| Bucket | Base % | Max % | Midpoint |
|---|---|---|---|
| $600K–$800K | 2.00% | 4.00% | $700K |
| $800K–$1M | 3.60% | 5.60% | $900K |
| $1M–$3M | 4.95% | 6.95% | $2M |
| $3M–$7M | 3.15% | 5.15% | $5M |
| $7M+ | 3.66% | 5.66% | $8.5M |

See `docs/savings-formula.md` for full spec.

---

## Website Validation ✅

| Metric | Value |
|---|---|
| Benchmark accuracy (510 restaurants) | 97.92% |
| Verified restaurant rate | 48.24% |
| False positive rate | 3.0% (down from 99.2%) |
| Theoretical ceiling (no headless) | 90.98% |
| Headless rendering | Browserless.io (production) |

**Confidence scoring (0–100):**
- Website exists (HTTP ≠ 404): +20
- Logo found: +40
- Restaurant keyword in domain: +30
- Restaurant signals > 30: +20
- Negative signals < 40: +10

**Messaging tiers:**
- `plausible_unverified` + score ≥ 50 → "We're still working on verifying your website, you can continue."
- `plausible_unverified` + score < 50 → "We weren't able to fully verify this website, but you can still continue. Our team may follow up."

See `docs/website-validation-spec.md` (especially section G2).

---

## AI Narrative System ✅

| Item | Value |
|---|---|
| Model | `claude-sonnet-4-6` |
| Max tokens per call | 1000 |
| Calls per qualified submission | 2 (Researcher + Narrative) |
| Delay between calls | 1 second (enforced by orchestrator) |
| Cost per submission (est.) | ~$0.003–$0.005 |

**Active narrative angles (5 + 1 legacy):**

| Angle | Trigger | Tone |
|---|---|---|
| `captive_buyer` (~25%) | Broadliner + market_price_single | Urgent |
| `fragmented_buyer` (~20%) | market_price_multiple | Analytical |
| `optimized_buyer` (~7%) | negotiated_cost_plus | Mature |
| `premium_independent` (~10%) | local_specialty + fine dining | Respectful |
| `multi_unit_operator` (~30%) | 2+ locations (modifier) | Strategic |
| `gpo_member` (legacy) | GPO — no longer a form option | Sophisticated |

Selection is deterministic (`src/lib/ai/angle-selector.ts`). See `docs/ai-narrative.md`.

---

## Form Fields ✅

| Field | Current options |
|---|---|
| `locations` | Single location / 2-4 locations / 5-10 locations / 10+ locations |
| `annual_food_spend` | Under $600K / $600K–$800K / $800K–$1M / $1M–$3M / $3M–$7M / $7M+ |
| `procurement_strategy` | market_price_single / market_price_multiple / negotiated_cost_plus |
| `distributor_type` | national_broadliners / combination / regional / local_specialty |

GPO removed from form (2026-06-03). Legacy DB records with `procurementStrategy: 'gpo'` still handled correctly.

---

## Tests ✅

| Suite | Count |
|---|---|
| Total passing | 891 |
| Skipped (google-places, intentional) | 6 |
| Failed | 0 |
| Confidence scoring | 35 |
| Website validation | 47 |
| Narrative angles | 29 |
| Savings formula | 40+ |

---

## Production ✅

| Item | Value |
|---|---|
| URL | `https://fsiq-food-cost-analyzer-app.vercel.app` |
| Framework | Next.js 15.5.18 |
| Node | 24.x |
| Region | Washington D.C. (iad1) |
| Headless | Browserless.io (BROWSERLESS_API_KEY set) |
| Deploys | Automatic on git push to `main` |

---

## Documentation Index

| Doc | Purpose | Status |
|---|---|---|
| `savings-formula.md` | Formula source of truth | ✅ Current |
| `website-validation-spec.md` | Validation spec + section G2 (confidence) | ✅ Current |
| `ai-narrative.md` | Claude API, prompts, angles, fallback chain | ✅ Current |
| `architecture.md` | App architecture, request flow | ✅ Current |
| `database-schema.md` | Submission model field reference | ✅ Current |
| `scoring-algorithm.md` | Signal weights and decision thresholds | ✅ Current |
| `deployment.md` | Vercel setup, env vars, headless browser | ✅ Current |
| `environment.md` | All env vars with descriptions | ✅ Current |
| `pdf-generation.md` | PDFMonkey integration, narrative angles | ✅ Current |
| `ghl-email-handoff.md` | GHL custom fields, tags, lead status | ✅ Current |
| `analyzer-ux-flow.md` | Form field order and UX rules | ✅ Current |
| `qa-checklist.md` | Manual QA test cases | ✅ Current |
| `staging-checklist.md` | Pre-deploy verification checklist | ✅ Current |
| `hard-rules.md` | Browser compatibility constraints | ✅ Current |
| `brand-guidelines.md` | Colors, typography, styling | ✅ Current |
| `build-phases.md` | Implementation phase reference | ✅ Current |
| `FSIQ_SOP_v3.3.md` | Archive — original SOP (intentionally stale) | Archive |
