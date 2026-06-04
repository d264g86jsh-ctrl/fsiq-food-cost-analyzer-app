// Layer 1: static keyword matching (client-safe, synchronous, zero latency)
// Layer 2: AI validation — called via server endpoint (async, only on Layer 1 miss)

// Mirror the lists from savings-formula.ts so Layer 1 matches exactly what the
// qualification engine rewards. Kept in sync manually — if savings-formula.ts
// adds keywords, add them here too.
const PROTEIN_KEYWORDS = [
  'chicken', 'beef', 'pork', 'fish', 'seafood', 'brisket', 'ribs', 'steak',
  'lamb', 'salmon', 'shrimp', 'turkey', 'bacon', 'sausage',
];

const COMMODITY_KEYWORDS = [
  'oil', 'dairy', 'eggs', 'cheese', 'milk', 'butter', 'produce', 'lettuce',
  'tomato', 'onion', 'flour', 'sugar', 'potato', 'fries',
];

// Broader food/ingredient terms that the qualification engine doesn't score
// but should count as valid Layer 1 hits to reduce unnecessary AI calls.
const EXTENDED_FOOD_KEYWORDS = [
  'pasta', 'rice', 'beans', 'lentils', 'bread', 'wheat', 'corn', 'avocado',
  'pepper', 'garlic', 'vinegar', 'cream', 'yogurt', 'meat', 'poultry',
  'vegetables', 'fruit', 'herbs', 'spices', 'sauce', 'stock', 'broth',
  'dough', 'tortilla', 'chips', 'salad', 'greens', 'mushroom', 'tofu',
  'soy', 'protein', 'commodity', 'beverage', 'juice', 'coffee', 'tea',
  'alcohol', 'beer', 'wine', 'spirits', 'liquor', 'water', 'soda',
  'shortening', 'lard', 'yeast', 'salt', 'condiment', 'dressing',
  'wrap', 'bun', 'roll', 'pizza', 'taco', 'burger', 'sandwich',
  'shrimp', 'crab', 'lobster', 'clam', 'oyster', 'mussels',
  'ribeye', 'sirloin', 'tenderloin', 'brisket', 'wing', 'breast',
  'thigh', 'drumstick', 'filet', 'fillet', 'ground beef', 'ground pork',
];

const ALL_FOOD_KEYWORDS = [...new Set([
  ...PROTEIN_KEYWORDS,
  ...COMMODITY_KEYWORDS,
  ...EXTENDED_FOOD_KEYWORDS,
])];

/**
 * Layer 1 — Static keyword match.
 * Returns true if any known food keyword is present in the input.
 * Client-safe: no async, no network, zero latency.
 */
export function isKnownFoodItem(topSkus: string): boolean {
  if (!topSkus.trim()) return false;
  const lower = topSkus.toLowerCase();
  return ALL_FOOD_KEYWORDS.some((kw) => lower.includes(kw));
}

export type SkuValidationState = 'idle' | 'validating' | 'valid' | 'invalid' | 'unknown';

export interface SkuValidationResult {
  state: SkuValidationState;
}

/**
 * Layer 2 — AI validation via server endpoint.
 * Only called when Layer 1 returns false.
 * Returns 'valid', 'invalid', or 'unknown' (on timeout/error).
 */
export async function validateFoodItemsWithAI(topSkus: string): Promise<SkuValidationResult> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6_000);

    const res = await fetch('/api/validate-food-items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topSkus }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!res.ok) return { state: 'unknown' };

    const data = (await res.json()) as { isFood: boolean | null };
    if (data.isFood === true)  return { state: 'valid' };
    if (data.isFood === false) return { state: 'invalid' };
    return { state: 'unknown' };
  } catch {
    // Timeout, network error, or JSON parse failure → neutral, allow submit
    return { state: 'unknown' };
  }
}
