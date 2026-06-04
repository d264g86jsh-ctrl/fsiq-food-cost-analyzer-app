// POST /api/validate-food-items — Layer 2 SKU validation via Claude.
// Called only when Layer 1 static matching finds no food keywords.
// Returns { isFood: boolean | null, error?: string }.
// null + error = "timeout_assumed_valid" means callers should treat as valid (lenient).

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getAnthropicClient, AI_MODEL } from '@/lib/ai/ai-client';
import { checkRateLimit } from '@/lib/api/rate-limiter';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `You are a food & beverage procurement validator for restaurant operators.
Determine if the input is a list of food, beverage, or food-service ingredients that a restaurant would purchase.

Be lenient with:
- Typos: "chikn" = chicken, "diry" = dairy, "beaf" = beef, "talapia" = tilapia
- Abbreviations: "evoo" = olive oil, "F&B" = food & beverage, "COGS items" = valid
- Regional or specialty names: "wagyu" = beef, "burrata" = cheese, "paneer" = dairy
- Generic categories: "proteins", "commodities", "produce", "dry goods" = valid

Reject only clear non-food items: cleaning supplies, napkins, office supplies, equipment, software.

Respond with ONLY "yes" or "no". No explanation, no punctuation, nothing else.`;

function buildUserPrompt(topSkus: string): string {
  return `Is this a list of food & beverage items a restaurant would purchase?\n\nInput: ${topSkus.slice(0, 400)}`;
}

function parseAiResponse(text: string): boolean | null {
  const lower = text.trim().toLowerCase();
  if (/\byes\b|\byeah\b|\byep\b|\baffirmative\b/.test(lower)) return true;
  if (/\bno\b|\bnope\b|\bnegative\b/.test(lower)) return false;
  // Fallback: first word
  if (lower.startsWith('y')) return true;
  if (lower.startsWith('n')) return false;
  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Rate limiting — per IP, in-memory
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';

  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { isFood: null, error: 'rate_limit_exceeded' },
      { status: 429 },
    );
  }

  // Parse body
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

  // AI client
  const client = getAnthropicClient();
  if (!client) {
    return NextResponse.json({ isFood: null, error: 'ai_unavailable' });
  }

  // Claude call with server-side timeout
  try {
    const aiPromise = client.messages.create({
      model: AI_MODEL,
      max_tokens: 20,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt(topSkus) }],
    });

    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('server_timeout')), 7_000),
    );

    const response = await Promise.race([aiPromise, timeoutPromise]);

    const rawText =
      response.content[0]?.type === 'text' ? response.content[0].text : '';
    const isFood = parseAiResponse(rawText);

    return NextResponse.json({ isFood });
  } catch (err) {
    if (err instanceof Error && err.message === 'server_timeout') {
      // Lenient: if AI times out, assume the user's input is valid food items.
      return NextResponse.json({ isFood: true, error: 'timeout_assumed_valid' });
    }
    return NextResponse.json({ isFood: null, error: 'ai_error' });
  }
}
