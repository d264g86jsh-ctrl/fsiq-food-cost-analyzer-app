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

// Belt-and-suspenders em/en-dash sanitizer for businessSummary.
// The prompt already instructs "no em-dashes", but this catches any edge cases.
// Mirrors the logic in ai-narrative.ts stripDashes(), extended with sentence-boundary
// detection: a dash between two clauses (lowercase → Capital) becomes ". " not ", ".
function sanitizeEmDashes(text: string): string {
  let s = text
    .replace(/\s*[—–―]\s*/g, ', ')   // em dash, en dash, horizontal bar → comma
    .replace(/&mdash;|&ndash;/gi, ', ')
    .replace(/\s,/g, ',')              // trailing space before comma
    .replace(/,\s*,/g, ',')            // deduplicate commas
    .replace(/  +/g, ' ')
    .trim();
  // Where replacement produced ", Capital" after a lowercase char → sentence break → ". Capital"
  s = s.replace(/([a-z0-9]),\s+([A-Z][a-z])/g, '$1. $2');
  return s;
}

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

    const parsed = parseResearchResponse(rawText);

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
      logoUrl: input.logoUrl,  // waterfall-validated — AI does not pick from hints
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
): Pick<AiResearchResult, 'businessSummary' | 'conceptSignals'> | null {
  try {
    // Extract JSON object — handles optional markdown code fences
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null) return null;

    // businessSummary: required non-empty string, sanitized, truncated to max
    const rawSummary = typeof parsed.businessSummary === 'string' ? parsed.businessSummary.trim() : '';
    if (!rawSummary) return null;
    const businessSummary = sanitizeEmDashes(rawSummary.slice(0, BUSINESS_SUMMARY_MAX));

    // conceptSignals: array of strings, limited in count, non-strings filtered out
    const rawSignals = Array.isArray(parsed.conceptSignals) ? parsed.conceptSignals : [];
    const conceptSignals = rawSignals
      .filter((s): s is string => typeof s === 'string')
      .slice(0, CONCEPT_SIGNALS_MAX);

    return { businessSummary, conceptSignals };
  } catch {
    return null;
  }
}
