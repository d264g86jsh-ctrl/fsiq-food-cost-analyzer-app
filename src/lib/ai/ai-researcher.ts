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
//
// Decision is made per dash site in a single pass — never touches existing commas:
//   '. ' when the next word starts [A-Z][a-z] and the preceding char is not [.!?]
//   ', ' otherwise
//
// Exported for unit testing.
export function sanitizeEmDashes(text: string): string {
  return text
    .replace(
      /\s*(?:[—–―]|&mdash;|&ndash;)\s*/gi,
      (match: string, offset: number, str: string) => {
        // \s* consumed any surrounding spaces, so str[offset - 1] is the last
        // non-space character before the dash site.
        const charBefore = offset > 0 ? str[offset - 1] : '';
        // str[offset + match.length] is the first character of the word that
        // follows (trailing \s* already consumed any spaces after the dash).
        const nextIdx   = offset + match.length;
        const charAfter  = nextIdx < str.length     ? str[nextIdx]     : '';
        const charAfter2 = nextIdx + 1 < str.length ? str[nextIdx + 1] : '';
        // Emit '. ' when next word starts [A-Z][a-z] and the preceding char is
        // not already sentence-ending punctuation; ', ' otherwise.
        if (/[A-Z]/.test(charAfter) && /[a-z]/.test(charAfter2) && !/[.!?]/.test(charBefore)) {
          return '. ';
        }
        return ', ';
      },
    )
    .replace(/  +/g, ' ')
    .trim();
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
