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

// Text normalization for common spend-input typos.
// Handles million, billion, thousand variants and the "kk" double-tap typo.
function normalizeMillion(s: string): string {
  // million typos: mllion, mlion, milion, millon → million
  s = s.replace(/m(?:ll|l|il|ill)i?o?n/gi, 'million');
  // billion/billions (and typos bilion, bilions) → billion
  // "2 billion" will parse as 2 × 1B, exceed the $99M cap, and DQ.
  s = s.replace(/b(?:ill?|l)i?o?ns?/gi, 'billion');
  // thousand typos: thou, thous, thousnd, thousan → thousand
  // Enumerated longest-first to prevent partial replacement (thousnd before thous before thou).
  s = s.replace(/\b(?:thousnd|thousan|thous|thou)\b/gi, 'thousand');
  // kk double-tap: "800kk" → "800k"
  // \bkk\b won't match "800kk" (no word boundary between digit and k),
  // so match kk at a word boundary on the right only.
  s = s.replace(/kk\b/gi, 'k');
  return s;
}

const MAX_SPEND = 99_000_000;

// Public export — thin wrapper that applies the $99M cap after all parsing.
// Any branch producing > $99M (e.g. bare "200000000", bare "99" × 1M = $99M boundary)
// is silently capped. Exactly $99M is not capped (condition is strictly greater-than).
export function parseSpend(rawInput: string): SpendParseResult {
  const r = _parseSpend(rawInput);
  if (r.annualSpend > MAX_SPEND) {
    return { ...r, annualSpend: MAX_SPEND, parseNotes: [...r.parseNotes, 'capped_at_99m'] };
  }
  return r;
}

function _parseSpend(rawInput: string): SpendParseResult {
  const notes: string[] = [];
  const trimmed = rawInput.trim();

  if (!trimmed) {
    return { rawInput, annualSpend: FALLBACK_AMOUNT, parseFallback: true, parseNotes: ['empty_input'] };
  }

  // Strip leading qualifier/hedging words — "around 1 million" → "1 million"
  // Only stripped from the start of the string to avoid corrupting mid-string values.
  const stripped = trimmed.replace(
    /^(?:around|arond|aound|arround|roughly|roughyl|roughy|rougly|about|abut|abot|abotu|approximately|aproximately|aproximatly|approx|~)\s+/i,
    '',
  );

  // Normalize million typos first
  let s = normalizeMillion(stripped);

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

  // "N hundred thousand" — must come before the word-number loop so "five hundred thousand"
  // is not misread as "five × thousand" (= $5,000 instead of $500,000).
  const hundredThousandMatch = s.match(/^(.+?)\s+hundred\s+thousand$/);
  if (hundredThousandMatch) {
    const part = hundredThousandMatch[1].trim();
    const wordNum = WORD_NUMBERS[part];
    if (wordNum !== undefined) {
      notes.push('word_hundred_thousand');
      return Math.round(wordNum * 100_000);
    }
    const n = parseFloat(part);
    if (!isNaN(n)) {
      notes.push('n_hundred_thousand');
      return Math.round(n * 100_000);
    }
  }

  // Check word numbers — try each in descending length order to avoid partial matches
  for (const [word, num] of Object.entries(WORD_NUMBERS).sort((a, b) => b[0].length - a[0].length)) {
    const wordRegex = new RegExp(`(?:^|\\s)${escapeRegex(word)}(?:\\s|$)`);
    if (!wordRegex.test(s) && s !== word) continue;

    // "X billion" — produces a value > $99M, will be capped and DQ'd
    if (/\bbillions?\b/.test(s)) {
      notes.push(`word_number:${word}×billion`);
      return Math.round(num * 1_000_000_000);
    }
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

  // "X.Y billion" / "X billion" — numeric form; will exceed $99M cap and DQ
  const billionMatch = s.match(/^([\d.]+)\s*billions?$/);
  if (billionMatch) {
    const n = parseFloat(billionMatch[1]);
    if (!isNaN(n)) {
      notes.push('n_billion');
      return Math.round(n * 1_000_000_000);
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

  // "500 thousand", "2.5 thousand"
  const thousandWordMatch = s.match(/^([\d.]+)\s*thousand$/);
  if (thousandWordMatch) {
    const n = parseFloat(thousandWordMatch[1]);
    if (!isNaN(n)) {
      notes.push('n_thousand');
      return Math.round(n * 1_000);
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

  // Bare number — guard against garbage like "2 grazillion" where parseFloat
  // would extract the leading digit and applyBareHeuristic would promote it to millions.
  // If the string still contains any letter at this point, none of the earlier
  // suffix/word branches matched it, so it is not a recognizable format — return null.
  if (/[a-z]/.test(s)) return null;
  const bareNum = parseFloat(s);
  if (!isNaN(bareNum) && isFinite(bareNum)) {
    return applyBareHeuristic(bareNum, notes);
  }

  return null;
}

function applyBareHeuristic(n: number, notes: string[]): number {
  // 1–99: shorthand for millions ("5" → $5M, "1" → $1M)
  if (n > 0 && n < 100) {
    notes.push('bare_heuristic:millions');
    return Math.round(n * 1_000_000);
  }
  // ≥100 without a K/M suffix is treated as an exact dollar amount.
  // "9999" → $9,999  "600000" → $600,000  "1000000" → $1,000,000
  // The old 100–9999 → thousands heuristic caused "9999" to parse as $9.999M.
  notes.push('bare_heuristic:exact');
  return Math.round(n);
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
