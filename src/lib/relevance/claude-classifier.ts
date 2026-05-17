// Claude AI tiebreaker — invoked only for ambiguous cases.
// Returns verified_restaurant, plausible_unverified, or clear_non_fit only.
// Cannot return national_chain or invalid_website (those are rule-only decisions).

import Anthropic from '@anthropic-ai/sdk';
import type { FinalDecision } from '../website/types';
import type { RestaurantScores } from './classify-restaurant';

type TiebreakerDecision = Extract<FinalDecision, 'verified_restaurant' | 'plausible_unverified' | 'clear_non_fit'>;

export interface ClaudeClassifierInput {
  restaurantName: string;
  domain: string;
  pageTitle: string;
  schemaOrgTypes: string[];
  topPositiveSignals: string[];
  topNegativeSignals: string[];
  scores: RestaurantScores;
  reachabilityStatus: string;
}

export interface ClaudeClassifierResult {
  decision: TiebreakerDecision;
  claudeAiUsed: boolean;
  reasoning?: string;
}

const SYSTEM_PROMPT = `You are a restaurant classification assistant for a U.S. food-cost analyzer tool.
Your task: given signals extracted from a website, determine if it belongs to an independent restaurant, foodservice operator, or food-related business that might be a customer.

Return a JSON object with this exact shape:
{"decision": "verified_restaurant" | "plausible_unverified" | "clear_non_fit", "reasoning": "one sentence"}

Rules:
- verified_restaurant: strong evidence this is an independent restaurant or foodservice operator (includes: cafes, bars, catering businesses, food trucks, ghost kitchens, bakeries)
- plausible_unverified: unclear, blocked, thin, or mixed signals — could be a restaurant
- clear_non_fit: clearly NOT a restaurant (SaaS company, food tech vendor, supplier, marketing agency, etc.)
- Never return national_chain or invalid_website
- When in doubt, return plausible_unverified`;

export async function classifyWithClaude(input: ClaudeClassifierInput): Promise<ClaudeClassifierResult> {
  const fallback: ClaudeClassifierResult = {
    decision: 'plausible_unverified',
    claudeAiUsed: false,
  };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallback;

  try {
    const client = new Anthropic({ apiKey });

    const userMessage = `Restaurant name: ${input.restaurantName}
Domain: ${input.domain}
Page title: ${input.pageTitle}
Schema.org types: ${input.schemaOrgTypes.join(', ') || 'none detected'}
Restaurant signal score: ${input.scores.restaurantSignalScore}/100
Negative signal score: ${input.scores.negativeSignalScore}/100
Reachability: ${input.reachabilityStatus}
Top positive signals: ${input.topPositiveSignals.slice(0, 5).join(', ') || 'none'}
Top negative signals: ${input.topNegativeSignals.slice(0, 5).join(', ') || 'none'}

Is this an independent restaurant, foodservice operator, or clear non-fit?`;

    const response = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 200,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '';
    const parsed = parseClaudeResponse(text);
    if (!parsed) return fallback;

    return { decision: parsed.decision, claudeAiUsed: true, reasoning: parsed.reasoning };
  } catch {
    return fallback;
  }
}

function parseClaudeResponse(text: string): { decision: TiebreakerDecision; reasoning: string } | null {
  try {
    // Extract JSON from response (may be wrapped in markdown)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[0]) as { decision?: string; reasoning?: string };
    const VALID: TiebreakerDecision[] = ['verified_restaurant', 'plausible_unverified', 'clear_non_fit'];

    if (!parsed.decision || !VALID.includes(parsed.decision as TiebreakerDecision)) return null;

    return {
      decision: parsed.decision as TiebreakerDecision,
      reasoning: parsed.reasoning ?? '',
    };
  } catch {
    return null;
  }
}

// Determine whether to invoke Claude tiebreaker based on score ambiguity
export function isAmbiguous(options: {
  restaurantSignalScore: number;
  negativeSignalScore: number;
  nationalChainScore: number;
  reachabilityStatus: string;
}): boolean {
  const { restaurantSignalScore, negativeSignalScore, nationalChainScore, reachabilityStatus } = options;
  // googlePlacesScore hardcoded to 0 — Google Places removed; state dropdown guarantees US.
  const googlePlacesScore = 0;

  // Already decided by rules — not ambiguous
  if (nationalChainScore >= 85) return false;
  if (reachabilityStatus === 'invalid') return false;

  // Clear non-fit threshold met
  if (negativeSignalScore >= 70 && restaurantSignalScore < 30 && googlePlacesScore < 30) return false;

  // Clear verified threshold met
  if (restaurantSignalScore >= 60 && negativeSignalScore < 40 && nationalChainScore < 50) return false;
  if (googlePlacesScore >= 80 && nationalChainScore < 50 && negativeSignalScore < 60) return false;

  // Ambiguous: scores don't clearly meet any threshold
  return true;
}
