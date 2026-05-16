// Parses the annualFoodSpend free-text / dropdown value into a dollar amount.
// Source of truth: docs/savings-formula.md §3

export interface SpendParseResult {
  rawInput: string;
  annualSpend: number;
  parseFallback: boolean;
  parseNotes: string[];
}

const FALLBACK_AMOUNT = 2_000_000;

// Word-to-number map including typo synonyms
const WORD_NUMBERS: Record<string, number> = {
  zero: 0,
  half: 0.5,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  // Typo synonyms
  on: 1,   // "on million" → "one million"
  oen: 1,
  tow: 2,
  thrre: 3,
  foru: 4,
  fo: 4,
};

// Range separators
const RANGE_PATTERN = /^(.+?)\s*(?:[-–—]|to|thru|through)\s*(.+)$/i;

// Million typo normalization: mllion, mlion, milion, millon → million
function normalizeMillion(s: string): string {
  return s.replace(/m(?:ll|l|il|ill)i?o?n/gi, 'million');
}

export function parseSpend(rawInput: string): SpendParseResult {
  const notes: string[] = [];
  const trimmed = rawInput.trim();

  if (!trimmed) {
    return { rawInput, annualSpend: FALLBACK_AMOUNT, parseFallback: true, parseNotes: ['empty_input'] };
  }

  // Normalize million typos first
  let s = normalizeMillion(trimmed);

  // Strip currency symbols and commas
  s = s.replace(/[$€£¥]/g, '').replace(/,/g, '').trim();

  // Detect range: "1-2M", "$1M–$3M", "500k to 800k"
  const rangeMatch = s.match(RANGE_PATTERN);
  if (rangeMatch) {
    const lo = parseSingleToken(rangeMatch[1].trim(), notes);
    const hi = parseSingleToken(rangeMatch[2].trim(), notes);
    if (lo !== null && hi !== null && lo > 0 && hi > 0) {
      const midpoint = Math.round((lo + hi) / 2);
      notes.push('range_midpoint');
      return { rawInput, annualSpend: midpoint, parseFallback: false, parseNotes: notes };
    }
  }

  // Single value
  const value = parseSingleToken(s, notes);
  if (value !== null) {
    return { rawInput, annualSpend: value, parseFallback: false, parseNotes: notes };
  }

  // Fallback
  notes.push('unresolvable_input');
  return { rawInput, annualSpend: FALLBACK_AMOUNT, parseFallback: true, parseNotes: notes };
}

function parseSingleToken(s: string, notes: string[]): number | null {
  s = s.trim().toLowerCase();
  if (!s) return null;

  // "half million" / "half a million" shorthand
  if (/^half\s*(?:a\s*)?million$/.test(s)) {
    notes.push('half_million');
    return 500_000;
  }

  // Check word numbers — try each in descending length order to avoid partial matches
  for (const [word, num] of Object.entries(WORD_NUMBERS).sort((a, b) => b[0].length - a[0].length)) {
    const wordRegex = new RegExp(`(?:^|\\s)${escapeRegex(word)}(?:\\s|$)`);
    if (!wordRegex.test(s) && s !== word) continue;

    // "X million"
    if (/\bmillion\b/.test(s)) {
      notes.push(`word_number:${word}×million`);
      return Math.round(num * 1_000_000);
    }
    // "X thousand" or "X k"
    if (/\bthousand\b/.test(s) || /\bk\b/.test(s)) {
      notes.push(`word_number:${word}×thousand`);
      return Math.round(num * 1_000);
    }
    // Bare word number (the whole token is just a word number)
    if (s === word || s.trim() === word) {
      notes.push(`word_number:${word}`);
      return applyBareHeuristic(num, notes);
    }
  }

  // "X.Y million"
  const millionMatch = s.match(/^([\d.]+)\s*million$/);
  if (millionMatch) {
    const n = parseFloat(millionMatch[1]);
    if (!isNaN(n)) {
      notes.push('n_million');
      return Math.round(n * 1_000_000);
    }
  }

  // M suffix: "2M", "1.5M"
  const mMatch = s.match(/^([\d.]+)\s*m$/);
  if (mMatch) {
    const n = parseFloat(mMatch[1]);
    if (!isNaN(n)) {
      notes.push('m_suffix');
      return Math.round(n * 1_000_000);
    }
  }

  // K suffix: "500k", "750K"
  const kMatch = s.match(/^([\d.]+)\s*k$/);
  if (kMatch) {
    const n = parseFloat(kMatch[1]);
    if (!isNaN(n)) {
      notes.push('k_suffix');
      return Math.round(n * 1_000);
    }
  }

  // Bare number
  const bareNum = parseFloat(s);
  if (!isNaN(bareNum) && isFinite(bareNum)) {
    return applyBareHeuristic(bareNum, notes);
  }

  return null;
}

function applyBareHeuristic(n: number, notes: string[]): number {
  if (n >= 1 && n <= 99) {
    notes.push('bare_heuristic:millions');
    return Math.round(n * 1_000_000);
  }
  if (n >= 100 && n <= 9_999) {
    notes.push('bare_heuristic:thousands');
    return Math.round(n * 1_000);
  }
  // >= 10,000 treated as exact dollar amount
  notes.push('bare_heuristic:exact');
  return Math.round(n);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
