// AI Narrative Builder — generates narrativeDistributor, narrativeProcurement, narrativeSku.
// Model: claude-sonnet-4-6, max 1000 tokens.
//
// Phase 8 note: the 1-second delay between AI calls is the orchestrator's responsibility.
// This function does not enforce any delay.
//
// Post-processing safety nets applied here regardless of call path:
// - Em-dashes (—) and en-dashes (–) are stripped from all narrative output
// - Each narrative is truncated to 600 chars

import { getAnthropicClient, AI_MODEL, AI_MAX_TOKENS } from './ai-client';
import { buildNarrativeSystemPrompt, buildNarrativeUserPrompt } from './prompts';
import { buildFallbackNarrative } from './fallback-narrative';
import type { AiResearchInput, AiNarrativeResult } from './ai-types';

const NARRATIVE_MAX = 600;

// Strip em-dashes (U+2014), en-dashes (U+2013), horizontal bars (U+2015),
// and their HTML entity equivalents, replacing with a comma for readability.
function stripDashes(text: string): string {
  return text
    .replace(/[–—―]/g, ',')
    .replace(/&mdash;|&ndash;/gi, ',')
    .replace(/\s,/g, ',')
    .trim();
}

export async function generateAiNarrative(input: AiResearchInput): Promise<AiNarrativeResult> {
  const generatedAt = new Date().toISOString();
  const client = getAnthropicClient();

  if (!client) {
    const fallback = buildFallbackNarrative(input);
    return {
      narrativeDistributor: stripDashes(fallback.narrativeDistributor),
      narrativeProcurement: stripDashes(fallback.narrativeProcurement),
      narrativeSku: stripDashes(fallback.narrativeSku),
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
      system: buildNarrativeSystemPrompt(),
      messages: [{ role: 'user', content: buildNarrativeUserPrompt(input) }],
    });

    const rawText =
      response.content[0]?.type === 'text' ? response.content[0].text : '';

    const parsed = parseNarrativeResponse(rawText);

    if (!parsed) {
      const fallback = buildFallbackNarrative(input);
      return {
        narrativeDistributor: stripDashes(fallback.narrativeDistributor),
        narrativeProcurement: stripDashes(fallback.narrativeProcurement),
        narrativeSku: stripDashes(fallback.narrativeSku),
        aiUsed: true,
        aiFallbackUsed: true,
        aiModel: AI_MODEL,
        aiError: 'Invalid or incomplete JSON response from AI',
        generatedAt,
      };
    }

    return {
      ...parsed,
      aiUsed: true,
      aiFallbackUsed: false,
      aiModel: AI_MODEL,
      aiError: null,
      generatedAt,
    };
  } catch (err) {
    const fallback = buildFallbackNarrative(input);
    return {
      narrativeDistributor: stripDashes(fallback.narrativeDistributor),
      narrativeProcurement: stripDashes(fallback.narrativeProcurement),
      narrativeSku: stripDashes(fallback.narrativeSku),
      aiUsed: false,
      aiFallbackUsed: true,
      aiModel: AI_MODEL,
      aiError: err instanceof Error ? err.message : String(err),
      generatedAt,
    };
  }
}

// ── Response parser/validator ─────────────────────────────────────────────────

type NarrativeFields = Pick<AiNarrativeResult, 'narrativeDistributor' | 'narrativeProcurement' | 'narrativeSku'>;

function parseNarrativeResponse(raw: string): NarrativeFields | null {
  try {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return null;

    const parsed = JSON.parse(match[0]) as Record<string, unknown>;
    if (typeof parsed !== 'object' || parsed === null) return null;

    const nd = typeof parsed.narrativeDistributor === 'string' ? parsed.narrativeDistributor.trim() : '';
    const np = typeof parsed.narrativeProcurement === 'string' ? parsed.narrativeProcurement.trim() : '';
    const ns = typeof parsed.narrativeSku === 'string' ? parsed.narrativeSku.trim() : '';

    // All three sections are required — fall back entirely if any is missing
    if (!nd || !np || !ns) return null;

    return {
      narrativeDistributor: stripDashes(nd.slice(0, NARRATIVE_MAX)),
      narrativeProcurement: stripDashes(np.slice(0, NARRATIVE_MAX)),
      narrativeSku: stripDashes(ns.slice(0, NARRATIVE_MAX)),
    };
  } catch {
    return null;
  }
}
