# AI Narrative Pipeline

**Related:** `docs/architecture.md` (AI pipeline position in request flow) · `docs/pdf-generation.md` (how narrative flows into PDF) · `docs/savings-formula.md` (AI boundary — AI never touches math)  
**Source of truth for:** `src/lib/ai/ai-narrative.ts`, `src/lib/ai/ai-researcher.ts`, `src/lib/ai/prompts.ts`

## Overview

The AI pipeline runs two sequential Claude calls per qualified submission: **AI Researcher** (generates logo URL, business summary, concept signals) followed by **AI Narrative** (generates the three narrative paragraphs for the PDF). Both run in the background via `waitUntil` after the form response is returned to the user. A 1-second delay between the two calls is enforced by the orchestrator (`submitAnalysis.ts`), not by the functions themselves.

**When called:** Qualified path only — submissions that pass website validation and spend qualification. DQ, manual-review, and `clear_non_fit` paths skip both AI steps.

**Model:** `claude-sonnet-4-6` (`AI_MODEL` constant in `ai-client.ts`), `max_tokens: 1000`.

---

## Call Flow

```
submitAnalysis.ts (Phase 8)
  │
  ├─ buildResearchInput()          → assembles AiResearchInput from form + Phase 2 + Phase 3
  │
  └─ waitUntil(async () => {
       ├─ runAiResearch(aiInput)   → Step 7: logo, businessSummary, conceptSignals
       │    └─ 1-second delay (enforced by orchestrator)
       ├─ generateAiNarrative(aiInput) → Step 8: narrativeDistributor/Procurement/Sku
       │
       ├─ generatePdf(...)         → Step 9: PDFMonkey
       └─ syncToGhl(...)           → Step 10: GHL + Meta CAPI
     })
```

---

## Input Schema (`AiResearchInput`)

Both AI functions receive the same input object. It is built once by `buildResearchInput()` and reused.

```typescript
interface AiResearchInput {
  // ── Form fields (operator-provided) ──────────────────────────────────────
  restaurantName: string;        // e.g. "Black's BBQ"
  website: string;               // as entered
  conceptType: string;           // e.g. "Full Service Restaurant"
  locations: string;             // e.g. "3–5 locations"
  annualFoodSpend: string;       // raw dropdown, e.g. "$1M–$3M"
  distributorType: string;       // e.g. "Broadline (e.g. Sysco, US Foods)"
  procurementStrategy: string;   // e.g. "We buy what the distributor recommends"
  topSkus: string;               // free text, max 200 chars used in prompt

  // ── Phase 2: validation summary (no raw HTML) ─────────────────────────────
  normalizedUrl: string;
  finalUrl: string;
  finalDecision: string;         // e.g. "verified_restaurant"
  countryEligibility: string;
  websiteReachabilityStatus: string;
  restaurantSignalScore: number; // 0–100
  websiteLogoHints: string[];    // verbatim from Phase 2 extraction waterfall
  logoUrl: string | null;        // pre-validated URL — AI does NOT select from hints

  // ── Phase 3: deterministic outputs (read-only) ────────────────────────────
  // AI must never recalculate, reinterpret, or override these values.
  qualified: boolean;
  spendBucket: string | null;    // e.g. "$1M–$3M"
  dollarEstimate: number | null; // whole dollars, e.g. 110000
  finalPct: number | null;       // 4.0–6.95 (global ceiling; per-bucket max applies first)
  year1: number | null;
  year5: number | null;
  caseStudy: string | null;
  scrapeStatus: 'phase2_signals' | 'unavailable';
}
```

**What is excluded:** Raw HTML, scraped body text, full validation result JSON. The input is a curated summary — never passes sensitive or voluminous data to Claude.

---

## AI Researcher

**File:** `src/lib/ai/ai-researcher.ts`

**System prompt:**
> You are an AI assistant for FoodServiceIQ, a food cost optimization platform for independent and regional restaurant operators. Your task is to generate structured research data about a restaurant submission. Return valid JSON only — no prose, no markdown, no code fences. Do not invent or fabricate information not supplied in the inputs. Do not modify, recalculate, or reinterpret any savings figures — those are computed by deterministic code and are read-only. Do not use em-dashes or en-dashes in any output.

**Output schema:**
```json
{
  "businessSummary": "1–2 sentences, max 120 words. Based only on name, concept, location count.",
  "conceptSignals": ["casual dining", "multi-unit", "family style"]
}
```

**Post-processing:** `businessSummary` truncated to 500 chars. `conceptSignals` limited to 10 items. Non-strings filtered. Missing `businessSummary` → full fallback.

**`logoUrl` note:** AI Researcher does NOT select a logo URL. The waterfall-validated `logoUrl` from Phase 2 (extraction → HEAD validation) is passed through directly. AI never reads or picks from `websiteLogoHints`.

---

## Narrative Angle System: Angle-Guided Generation

Before the AI Narrative Builder is called, a **deterministic angle is selected** from the submission's
form inputs (`procurementStrategy`, `distributorType`, `conceptType`, `locations`) via
`src/lib/ai/angle-selector.ts`.

**Important:** Narratives are **Claude-generated prose, not templates.** The angle shapes the prompt context:

1. **Angle is selected** (deterministically from form inputs)
2. **Angle context is computed** — `angle.distributorGuidance`, `angle.procurementGuidance`,
   `angle.skuGuidance`, `angle.avoidance[]` are injected into the Claude prompt
3. **Claude receives angle context** — tone, emphasis, guidance, and avoidances
4. **Claude generates original prose** — not filling in template blanks, but guided by angle constraints
5. **Result:** 5 active angle profiles produce 5 different tones, each genuinely written by Claude

| Angle | Trigger | Prose Tone |
|---|---|---|
| `captive_buyer` | Broadliner + market_price_single | Urgent, direct |
| `fragmented_buyer` | market_price_multiple (any distributor) | Analytical |
| `optimized_buyer` | negotiated_cost_plus | Sophisticated, mature |
| `premium_independent` | Local/specialty distributor + fine dining | Respectful |
| `multi_unit_operator` | 2+ locations (modifier on top of primary angle) | Strategic |

**See also:** `src/lib/ai/narrative-angles.ts` (angle definitions), `src/lib/ai/angle-selector.ts` (selection logic)

---

## Active Angle Definitions

Each angle definition has three prose guidance strings (injected directly into the Claude prompt)
and two arrays (`avoidance`, `talkingPoints`). `distributorGuidance`, `procurementGuidance`,
and `skuGuidance` are paragraph strings, not bullet lists — Claude receives them as natural-language
instructions rather than enumerated rules.

**`gpo_member`** is a legacy angle (GPO removed from the form 2026-06-03); it activates for any
existing DB record where `procurementStrategy = 'gpo'`. All five current form options map to
one of the five active angles below.

---

### 1. The Captive Buyer (`captive_buyer`)

**Triggers:** `distributorType` = national_broadliners + `procurementStrategy` = market_price_single  
**Estimated coverage:** ~25% of qualified submissions  
**Core message:** "Your distributor is setting your food cost — you are not."

**distributorGuidance**  
Frame broadline dependence as controllable risk, not permanent condition. Avoid implying naivety — frame as "where most operators start." The goal is to show that the relationship can be renegotiated from the same distributor.

**procurementGuidance**  
Market price buying is the entry point, not a locked-in fate. Emphasize understanding what "market price" actually means on their invoice. The first step is visibility, not switching.

**skuGuidance**  
Proteins (chicken, beef, seafood) and dairy are where broadliner markup is highest. Frame these as the first benchmark targets because the gap between market and invoice price is most visible here.

**avoidance**
- Sophisticated portfolio analysis language
- Multi-vendor consolidation strategy
- Implication the operator is naive for using a single broadliner

**talkingPoints**
- A single broadline distributor without a cost-plus or bid contract sets its own margin — typically 18–28% above landed cost on proteins and staples
- Operators in this position have the most to gain from a benchmarking engagement because the baseline comparison is clear
- No switching required — the first win is usually better pricing from the incumbent distributor

---

### 2. The Fragmented Buyer (`fragmented_buyer`)

**Triggers:** `procurementStrategy` = market_price_multiple (any distributor type, any size); also default for combination/regional distributors  
**Estimated coverage:** ~20% of qualified submissions  
**Core message:** "Multiple distributors means multiple markups — and no single point of leverage."

**distributorGuidance**  
Do not criticize the multi-vendor approach — it often reflects intentional quality sourcing. Frame consolidation of information (not vendors) as the opportunity. The goal is a consolidated view, not fewer vendors.

**procurementGuidance**  
Market price across multiple distributors means each relationship is priced separately with no competitive tension between them. Benchmarking surfaces the gaps without requiring vendor changes.

**skuGuidance**  
Focus on the specific items the operator named as their key spend. Those specific items are the benchmark targets — not everything at once. Price consistency across vendors on the same item is the first finding.

**avoidance**
- Suggestion to consolidate to one vendor
- Implication the multi-vendor approach is inefficient
- Language suggesting quality sourcing is the problem

**talkingPoints**
- Multi-vendor purchasing creates price inconsistency — the same item may cost 12–22% more from one vendor than another in the same month
- Without a consolidated view, operators cannot negotiate from volume or use one vendor's pricing as leverage against another
- The opportunity is intelligence: knowing what you are paying across vendors before you go back to negotiate

---

### 3. The Optimized Buyer (`optimized_buyer`)

**Triggers:** `procurementStrategy` = negotiated_cost_plus (highest priority — fires before all other checks)  
**Estimated coverage:** ~7% of qualified submissions  
**Core message:** "You have negotiated well — the opportunity is in execution, SKU discipline, and competitive benchmarking as markets shift."

**distributorGuidance**  
Acknowledge their sophistication and existing cost-plus agreements. Focus on execution risk and ongoing optimization, not renegotiation. This is a mature operator.

**procurementGuidance**  
Lean into operational discipline: invoice audits, substitution detection, competitive benchmarking. Position FSIQ as the ongoing verification layer for a well-built procurement program.

**skuGuidance**  
Focus on SKU rationalization and volume optimization within their existing agreements. Commodity markets move — even a cost-plus agreement can drift from fair market over 12–24 months.

**avoidance**
- Suggestion their negotiation was insufficient
- Implication they are significantly overpaying
- High-drama savings projections
- Recommendation to fundamentally change their procurement approach

**talkingPoints**
- Cost-plus agreements are sophisticated, but execution risk remains: invoice errors, substitutions, and specification drift add up
- Competitive benchmarking on commodities identifies where market has moved since your contract was signed
- SKU rationalization and volume concentration within your existing contract can unlock an additional 1–2% without renegotiation

---

### 4. The Premium Independent (`premium_independent`)

**Triggers:** `distributorType` = local_specialty AND `conceptType` contains fine dining / full-service / farm / premium (both conditions required)  
**Estimated coverage:** ~10% of qualified submissions  
**Core message:** "Premium sourcing and cost discipline are not opposites — most premium operators overpay 15–20% above true market on specialty items."

**distributorGuidance**  
Affirm the sourcing philosophy. Do not challenge why they use specialty distributors. Frame FSIQ as understanding what their relationship actually costs relative to an equivalent quality benchmark.

**procurementGuidance**  
Informal buying from trusted relationships is the most common context for specialty operators. Frame this as a vulnerability in market awareness, not a failure in buying strategy.

**skuGuidance**  
Whatever premium items the operator named are the focal point. Those exact items are the benchmark targets — frame the analysis as quality-preserving, not cost-cutting.

**avoidance**
- Any suggestion to switch to a broadliner
- Implication that quality could be maintained with cheaper sourcing
- Cost-first framing — these operators are quality-first
- Skepticism about the value of their sourcing relationships

**talkingPoints**
- Local and specialty distributors rarely compete on price — they price to the relationship, not to a market benchmark
- Premium operators often accept higher per-unit costs as "the cost of quality" without knowing what true market looks like for their actual items
- Benchmarking specialty sourcing does not mean switching to a broadliner — it means knowing what fair market looks like for your specific ingredients

---

### 5. The Multi-Unit Operator (`multi_unit_operator`) — Modifier

**Triggers:** `locations` ≠ "Single location" (any multi-unit value: 2-4, 5-10, or 10+ locations)  
**Estimated coverage:** ~30% overlap with other angles  
**Core message:** "Every location you add increases your purchasing leverage — most multi-unit groups are not using it systematically."

**Note:** This angle acts as a **modifier on top of a primary angle** (1–3 above). When `hasMultiUnitModifier` is true, an additional multi-unit paragraph is appended to the prompt instructing Claude to weave in portfolio-level framing.

**distributorGuidance**  
Emphasize the leverage multiplier of their location count. Frame consolidated buying as the unlock — the same distributor relationship looks different at two locations vs. five.

**procurementGuidance**  
Frame procurement maturity as proportional to scale. Bigger groups can negotiate harder — but most independent multi-unit operators buy as if they are still single-unit. That gap is the opportunity.

**skuGuidance**  
High-volume items are where consolidated buying pays. What they spend across all units on a single SKU is the real benchmark figure, not what any single location spends.

**avoidance**
- Single-unit framing or individual location tactics
- Language implying scale does not matter
- Treating each location as a separate business

**talkingPoints**
- 2–4 locations creates natural purchasing volume, but only if buying is centralized or at least coordinated
- 5+ units creates leverage comparable to small regional chains, but most independents do not negotiate like chains
- SKU rationalization across units is the highest-ROI action for established multi-unit groups

---

### Legacy: The GPO Member (`gpo_member`)

**Triggers:** `procurementStrategy` = 'gpo' (no longer a form option — legacy DB records only)  
**Core message:** "GPO membership is a floor, not a ceiling — most operators leave 2–4% on the table beyond what their contract covers."

**distributorGuidance**  
Acknowledge the GPO relationship as a smart foundation. Frame the FSIQ engagement as extending that discipline to the uncovered 20–40% of spend outside the contract.

**procurementGuidance**  
GPO members are cost-aware — use analytical language. Avoid suggesting their GPO is not working. Position FSIQ as identifying what the GPO does not reach, not replacing it.

**skuGuidance**  
If the operator named proteins, those are likely outside full GPO coverage and fluctuate at market. If commodities, those move regardless of contract. Focus the narrative on the gap category.

**avoidance**
- "You are probably paying too much" framing
- Suggestion their GPO is ineffective
- Skeptical tone about GPO value
- Implication they should exit their GPO

**talkingPoints**
- GPO contracts typically cover 60–80% of a restaurant's spend — the gap is where markup hides
- Non-contract items (specialty proteins, seasonal produce, local sourcing) are often bought at market price on top of the GPO base
- Even on GPO-contracted items, audits frequently find the distributor applied the wrong price tier or substituted non-contracted equivalents

---

## AI Narrative

**File:** `src/lib/ai/ai-narrative.ts`

**System prompt:**
> You are an AI assistant for FoodServiceIQ, a food cost optimization platform for independent and regional restaurant operators. Your task is to write three short narrative sections for a food cost analysis report. Return valid JSON only — no prose, no markdown, no code fences. The savings figures provided are already calculated by deterministic code — you must never recalculate, reinterpret, or override them. Write in a premium, direct, operator-focused tone. Do not use em-dashes or en-dashes in any output.

**User prompt structure:**
```
Write three narrative sections for a food cost analysis report for the following restaurant.

RESTAURANT CONTEXT:
- Name: {restaurantName}
- Concept type: {conceptType}
- Locations: {locations}
- Annual food spend: {annualFoodSpend}
- Distributor type: {distributorType}
- Procurement strategy: {procurementStrategy}
- User-identified spend categories: "{topSkus}" (max 200 chars)
- READ-ONLY savings estimate: ${dollarEstimate}/year at {finalPct}% of food spend
  (or "No savings estimate available" if not qualified)

OUTPUT REQUIREMENTS:
Return exactly this JSON structure — no other text:
{
  "narrativeDistributor": "<50-80 word section>",
  "narrativeProcurement": "<50-80 word section>",
  "narrativeSku": "<50-80 word section>"
}

Rules: ...
```

**Output schema:**
```json
{
  "narrativeDistributor": "50–80 words. Describes distributor type and cost exposure.",
  "narrativeProcurement": "50–80 words. Describes procurement approach and opportunity.",
  "narrativeSku": "50–80 words. References user's identified items naturally."
}
```

**Hard output rules (enforced in prompts AND in post-processing code):**
- No em-dashes (`—`) or en-dashes (`–`) — stripped by `stripDashes()` and replaced with commas
- No guaranteed savings claims — hedged language required ("estimated," "typically," "likely")
- No invented vendor names, GPO names, contract terms, specific prices, or brands
- Savings figure must not be recalculated or restated differently
- All three sections required — if any is missing, full fallback applied

**Post-processing:**
1. `stripDashes()` replaces `—`, `–`, `―` and HTML entities `&mdash;` / `&ndash;` with `,`
2. Each field truncated to 600 chars
3. Three-field completeness check: if any is empty, all three are replaced by fallback

---

## Error Handling (Three-Layer Fallback)

All three layers set `aiFallbackUsed: true` and `aiUsed` correctly. The function never throws.

| Trigger | `aiUsed` | `aiFallbackUsed` | Behavior |
|---|---|---|---|
| `ANTHROPIC_API_KEY` not set | `false` | `true` | Immediate fallback, no API call |
| API throws (timeout, rate limit) | `false` | `true` | Fallback, error logged to DB |
| Valid JSON but any field empty | `true` | `true` | Fallback, `aiError` set |
| Parse fails (no JSON in response) | `true` | `true` | Fallback, `aiError` set |
| Success | `true` | `false` | Narrative used in PDF |

**Fallback source:** `buildFallbackNarrative()` in `src/lib/ai/fallback-narrative.ts` — generates static, generic narrative from form fields without any Claude call.

The orchestrator (`submitAnalysis.ts`) wraps each AI call in its own try-catch and pushes failures into `workflowErrors` — neither AI failure blocks PDF generation, which runs next with whatever narratives are available.

---

## Token Cost Estimate

| Component | Approx. tokens |
|---|---|
| Researcher system prompt | ~75 |
| Researcher user prompt | ~250 |
| Researcher output | ~80 |
| **Researcher total** | **~405** |
| Narrative system prompt | ~95 |
| Narrative user prompt | ~380 |
| Narrative output | ~250 |
| **Narrative total** | **~725** |
| **Per qualified submission** | **~1,130 tokens** |

At Claude Sonnet pricing (~$3/MTok input, ~$15/MTok output), cost per submission is approximately **$0.003–$0.005**.

---

## Rate Limiting

- **No concurrent calls within one submission.** The 1-second delay between AI Researcher and AI Narrative is enforced in `submitAnalysis.ts` before calling `generateAiNarrative`.
- **Across submissions:** No global rate limiter exists. Vercel `waitUntil` runs per-request. Under high load, concurrent submissions will make concurrent API calls. Anthropic's default rate limits (currently 4,000 RPM for Sonnet) are unlikely to be hit at expected submission volume.
- **Timeout:** None explicitly set in the Claude client call. Anthropic SDK uses its own internal timeout (~10 minutes). For production safety, the orchestrator's `waitUntil` budget (Vercel Pro: up to 5 minutes for background work) acts as the de facto ceiling.

---

## See Also

- `docs/deployment.md` — `ANTHROPIC_API_KEY` setup, Vercel function timeout budget
- `docs/database-schema.md` — `narrativeDistributor`, `narrativeProcurement`, `narrativeSku`, `aiFallbackUsed` fields
- `docs/pdf-generation.md` — how narrative fields flow into the PDFMonkey payload
- `src/lib/ai/prompts.ts` — full verbatim prompts
- `src/lib/ai/fallback-narrative.ts` — fallback content when Claude is unavailable
