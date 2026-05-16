// AI prompt builders for Phase 5.
// Separated from the caller modules so prompts can be reviewed and tested independently.
//
// Rules enforced in every prompt:
// - JSON output only (no prose outside the object)
// - No em-dashes or en-dashes
// - No fabricated URLs, prices, vendor names, or GPO names
// - Savings figures are explicitly labeled read-only — AI must not change them
// - Tone: premium, direct, operator-focused (per docs/brand-guidelines.md)

import type { AiResearchInput } from './ai-types';

// ── Researcher prompts ────────────────────────────────────────────────────────

export function buildResearcherSystemPrompt(): string {
  return `You are an AI assistant for FoodServiceIQ, a food cost optimization platform for independent and regional restaurant operators. Your task is to generate structured research data about a restaurant submission. Return valid JSON only — no prose, no markdown, no code fences. Do not invent or fabricate information not supplied in the inputs. Do not modify, recalculate, or reinterpret any savings figures — those are computed by deterministic code and are read-only. Do not use em-dashes or en-dashes in any output.`;
}

export function buildResearcherUserPrompt(input: AiResearchInput): string {
  const logoHintsList =
    input.websiteLogoHints.length > 0
      ? input.websiteLogoHints.map((u, i) => `  ${i + 1}. ${u}`).join('\n')
      : '  (none provided)';

  return `Generate structured research for this restaurant submission.

RESTAURANT CONTEXT:
- Name: ${input.restaurantName}
- Concept type: ${input.conceptType}
- Locations: ${input.locations}
- Annual food spend: ${input.annualFoodSpend}
- Website: ${input.finalUrl || input.normalizedUrl}
- Validation status: ${input.finalDecision}
- Restaurant signal score (0-100): ${input.restaurantSignalScore}

LOGO CANDIDATES (verbatim URLs from the restaurant's website):
${logoHintsList}

OUTPUT REQUIREMENTS:
Return exactly this JSON structure — no other text:
{
  "logoUrl": "<one URL from the candidate list above verbatim, or null if none are suitable>",
  "businessSummary": "<1-2 sentences, max 120 words. Describe the restaurant based only on the name, concept type, and location count. Do not invent cuisine specifics, founding dates, awards, or details not supplied.>",
  "conceptSignals": ["<tag>", ...]
}

Rules:
- logoUrl: must be verbatim from the candidate list, or null. Never invent or modify a URL.
- businessSummary: factual, operator-focused, confident tone. No em-dashes or en-dashes.
- conceptSignals: 2-6 short descriptive tags (e.g. "casual dining", "multi-unit", "family style"). No invented specifics.
- Return JSON only. No text outside the JSON object.`;
}

// ── Narrative prompts ─────────────────────────────────────────────────────────

export function buildNarrativeSystemPrompt(): string {
  return `You are an AI assistant for FoodServiceIQ, a food cost optimization platform for independent and regional restaurant operators. Your task is to write three short narrative sections for a food cost analysis report. Return valid JSON only — no prose, no markdown, no code fences. The savings figures provided are already calculated by deterministic code — you must never recalculate, reinterpret, or override them. Write in a premium, direct, operator-focused tone. Do not use em-dashes or en-dashes in any output.`;
}

export function buildNarrativeUserPrompt(input: AiResearchInput): string {
  const skuContext = input.topSkus
    ? `User-identified spend categories / key items: "${input.topSkus}"`
    : 'User did not specify key items (use general food cost categories).';

  // Savings figures are read-only — AI sees them as context but must not alter them
  const savingsContext =
    input.qualified && input.dollarEstimate !== null && input.finalPct !== null
      ? `READ-ONLY savings estimate (already calculated by deterministic code, do not change): $${input.dollarEstimate.toLocaleString('en-US')}/year at ${input.finalPct}% of food spend. Use "estimated," "potential," "based on your profile," or "conservative estimate" if referencing this figure.`
      : 'No savings estimate available (lead not yet qualified or spend below threshold).';

  return `Write three narrative sections for a food cost analysis report for the following restaurant.

RESTAURANT CONTEXT:
- Name: ${input.restaurantName}
- Concept type: ${input.conceptType}
- Locations: ${input.locations}
- Annual food spend: ${input.annualFoodSpend}
- Distributor type: ${input.distributorType}
- Procurement strategy: ${input.procurementStrategy}
- ${skuContext}
- ${savingsContext}

OUTPUT REQUIREMENTS:
Return exactly this JSON structure — no other text:
{
  "narrativeDistributor": "<50-80 word section>",
  "narrativeProcurement": "<50-80 word section>",
  "narrativeSku": "<50-80 word section>"
}

Rules for each section:
- 50-80 words, plain prose only.
- No em-dashes or en-dashes. Use commas or periods instead.
- No guaranteed savings claims. Use hedged language: "estimated," "typically," "likely," "based on your profile," "conservative estimate."
- narrativeDistributor: mention the distributor type naturally; describe what it means for cost exposure.
- narrativeProcurement: mention the procurement approach naturally; describe the opportunity.
- narrativeSku: mention the user's identified items or categories naturally if provided; do not imply invoice-level review occurred; do not invent specific prices or brands.
- Do not invent vendor names, GPO names, contract terms, specific prices, or brands not supplied.
- Do not change or restate the savings figure in a new calculation.
- Tone: premium, direct, useful for restaurant operators. Not hype-heavy.
- Return JSON only. No text outside the JSON object.`;
}
