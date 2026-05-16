// AI Researcher — generates logo URL, business summary, and concept signals.
// Model: claude-sonnet-4-6, max 1000 tokens.
//
// Phase 8 note: the 1-second delay between AI calls is the orchestrator's responsibility.
// This function does not enforce any delay.
//
// Fallback behavior:
// - ANTHROPIC_API_KEY missing → deterministic fallback, aiUsed=false
// - Claude returns invalid JSON → fallback, aiUsed=true (call was made)
// - Claude throws (timeout, rate limit, etc.) → fallback, aiUsed=false

import { getAnthropicClient, AI_MODEL, AI_MAX_TOKENS } from './ai-client';
import { buildResearcherSystemPrompt, buildResearcherUserPrompt } from './prompts';
import { buildFallbackResearch } from './fallback-narrative';
import type { AiResearchInput, AiResearchResult } from './ai-types';

const BUSINESS_SUMMARY_MAX = 500;
const CONCEPT_SIGNALS_MAX = 10;

export async function runAiResearch(input: AiResearchInput): Promise<AiResearchResult> {
  const generatedAt = new Date().toISOString();
  const client = getAnthropicClient();

  if (!client) {
    return {
      ...buildFallbackResearch(input),
      aiUsed: false,
      aiFallbackUsed: true,
      aiModel: null,
      aiError: 'ANTHROPIC_API_KEY not configured',
      generatedAt,
    };
  }

  try {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: AI_MAX_TOKENS,
      system: buildResearcherSystemPrompt(),
      messages: [{ role: 'user', content: buildResearcherUserPrompt(input) }],
    });

    const rawText =
      response.content[0]?.type === 'text' ? response.content[0].text : '';

    const parsed = parseResearchResponse(rawText, input);

    if (!parsed) {
      return {
        ...buildFallbackResearch(input),
        aiUsed: true,
        aiFallbackUsed: true,
        aiModel: AI_MODEL,
        aiError: 'Invalid or incomplete JSON response from AI',
        generatedAt,
      };
    }

    return {
      ...parsed,
      scrapeStatus: input.scrapeStatus,
      aiUsed: true,
      aiFallbackUsed: false,
      aiModel: AI_MODEL,
      aiError: null,
      generatedAt,
    };
  } catch (err) {
    return {
      ...buildFallbackResearch(input),
      aiUsed: false,
      aiFallbackUsed: true,
      aiModel: AI_MODEL,
      aiError: err instanceof Error ? err.message : String(err),
      generatedAt,
    };
  }
}

// ── Response parser/validator ─────────────────────────────────────────────────

function parseResearchResponse(
  raw: string,
  input: AiResearchInput,
): Pick<AiResearchResult, 'logoUrl' | 'businessSummary' | 'conceptSignals'> | null {
  try {
    // Extract JSON object — handles optional markdown code fences
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null) return null;

    // logoUrl: must be verbatim from the hint list — never accept a fabricated URL
    const logoUrl =
      typeof parsed.logoUrl === 'string' && input.websiteLogoHints.includes(parsed.logoUrl)
        ? parsed.logoUrl
        : null;

    // businessSummary: required non-empty string, truncated to max
    const rawSummary = typeof parsed.businessSummary === 'string' ? parsed.businessSummary.trim() : '';
    if (!rawSummary) return null;
    const businessSummary = rawSummary.slice(0, BUSINESS_SUMMARY_MAX);

    // conceptSignals: array of strings, limited in count, non-strings filtered out
    const rawSignals = Array.isArray(parsed.conceptSignals) ? parsed.conceptSignals : [];
    const conceptSignals = rawSignals
      .filter((s): s is string => typeof s === 'string')
      .slice(0, CONCEPT_SIGNALS_MAX);

    return { logoUrl, businessSummary, conceptSignals };
  } catch {
    return null;
  }
}
