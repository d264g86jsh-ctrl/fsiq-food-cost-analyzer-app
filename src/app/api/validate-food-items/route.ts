// POST /api/validate-food-items — Layer 2 SKU validation via Claude.
// Called only when Layer 1 static matching finds no food keywords.
// Returns { isFood: boolean | null }. null means timeout or AI unavailable.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAnthropicClient, AI_MODEL } from '@/lib/ai/ai-client';

export const runtime = 'nodejs';

const SYSTEM_PROMPT =
  'You are a food procurement classifier. Answer only with "yes" or "no" and nothing else.';

function buildPrompt(topSkus: string): string {
  return `Is this a list of food, beverage, or food-service ingredient items that a restaurant or foodservice operation would purchase? Be lenient with misspellings, abbreviations, and regional names (e.g. "chikn" = chicken, "evoo" = olive oil). Answer only: "yes" or "no".

Input: "${topSkus.slice(0, 300)}"`;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: { topSkus?: string };
  try {
    body = (await req.json()) as { topSkus?: string };
  } catch {
    return NextResponse.json({ isFood: null, error: 'invalid_json' }, { status: 400 });
  }

  const topSkus = (body.topSkus ?? '').trim();
  if (!topSkus) {
    return NextResponse.json({ isFood: null, error: 'empty_input' }, { status: 400 });
  }

  const client = getAnthropicClient();
  if (!client) {
    // AI unavailable → neutral, do not block submission
    return NextResponse.json({ isFood: null, error: 'ai_unavailable' });
  }

  try {
    const response = await client.messages.create({
      model: AI_MODEL,
      max_tokens: 5,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildPrompt(topSkus) }],
    });

    const text = response.content[0]?.type === 'text'
      ? response.content[0].text.trim().toLowerCase()
      : '';

    const isFood = text.startsWith('yes') ? true : text.startsWith('no') ? false : null;
    return NextResponse.json({ isFood });
  } catch {
    return NextResponse.json({ isFood: null, error: 'ai_error' });
  }
}
