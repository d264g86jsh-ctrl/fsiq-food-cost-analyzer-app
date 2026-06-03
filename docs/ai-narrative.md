# AI Narrative Pipeline

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
  finalPct: number | null;       // 4.0–8.0
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
