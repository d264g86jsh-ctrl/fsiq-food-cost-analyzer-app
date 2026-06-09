import { describe, it, expect } from 'vitest';
import { parseSpend } from '../qualification/spend-parser';

describe('parseSpend', () => {
  // ── Bare number heuristics ─────────────────────────────────────────────────

  it('bare "1" → $1,000,000 (1–99 = millions)', () => {
    const r = parseSpend('1');
    expect(r.annualSpend).toBe(1_000_000);
    expect(r.parseFallback).toBe(false);
  });

  it('bare "5" → $5,000,000', () => {
    const r = parseSpend('5');
    expect(r.annualSpend).toBe(5_000_000);
    expect(r.parseFallback).toBe(false);
  });

  it('bare "500" → $500 (exact — no thousands heuristic)', () => {
    const r = parseSpend('500');
    expect(r.annualSpend).toBe(500);
    expect(r.parseFallback).toBe(false);
  });

  it('bare "750" → $750 (exact)', () => {
    const r = parseSpend('750');
    expect(r.annualSpend).toBe(750);
    expect(r.parseFallback).toBe(false);
  });

  it('bare "50000" → $50,000 (exact dollars)', () => {
    const r = parseSpend('50000');
    expect(r.annualSpend).toBe(50_000);
    expect(r.parseFallback).toBe(false);
  });

  // ── K / M suffix ───────────────────────────────────────────────────────────

  it('"500k" → $500,000', () => {
    const r = parseSpend('500k');
    expect(r.annualSpend).toBe(500_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"750K" → $750,000 (uppercase K)', () => {
    const r = parseSpend('750K');
    expect(r.annualSpend).toBe(750_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"2M" → $2,000,000', () => {
    const r = parseSpend('2M');
    expect(r.annualSpend).toBe(2_000_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"1.5M" → $1,500,000', () => {
    const r = parseSpend('1.5M');
    expect(r.annualSpend).toBe(1_500_000);
    expect(r.parseFallback).toBe(false);
  });

  // ── Currency and comma stripping ───────────────────────────────────────────

  it('"$3,500,000" → $3,500,000', () => {
    const r = parseSpend('$3,500,000');
    expect(r.annualSpend).toBe(3_500_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"$1,000,000" → $1,000,000', () => {
    const r = parseSpend('$1,000,000');
    expect(r.annualSpend).toBe(1_000_000);
    expect(r.parseFallback).toBe(false);
  });

  // ── Range midpoint ─────────────────────────────────────────────────────────

  it('"1-2M" → $1,500,000 (range midpoint)', () => {
    const r = parseSpend('1-2M');
    expect(r.annualSpend).toBe(1_500_000);
    expect(r.parseFallback).toBe(false);
    expect(r.parseNotes).toContain('range_midpoint');
  });

  it('"$1M–$3M" → $2,000,000 (en-dash range)', () => {
    const r = parseSpend('$1M–$3M');
    expect(r.annualSpend).toBe(2_000_000);
    expect(r.parseFallback).toBe(false);
    expect(r.parseNotes).toContain('range_midpoint');
  });

  it('"500k to 800k" → $650,000 (word range)', () => {
    const r = parseSpend('500k to 800k');
    expect(r.annualSpend).toBe(650_000);
    expect(r.parseFallback).toBe(false);
    expect(r.parseNotes).toContain('range_midpoint');
  });

  // ── Word numbers ───────────────────────────────────────────────────────────

  it('"one million" → $1,000,000', () => {
    const r = parseSpend('one million');
    expect(r.annualSpend).toBe(1_000_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"two million" → $2,000,000', () => {
    const r = parseSpend('two million');
    expect(r.annualSpend).toBe(2_000_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"five million" → $5,000,000', () => {
    const r = parseSpend('five million');
    expect(r.annualSpend).toBe(5_000_000);
    expect(r.parseFallback).toBe(false);
  });

  // ── Special shorthand ──────────────────────────────────────────────────────

  it('"half million" → $500,000', () => {
    const r = parseSpend('half million');
    expect(r.annualSpend).toBe(500_000);
    expect(r.parseFallback).toBe(false);
    expect(r.parseNotes).toContain('half_million');
  });

  it('"half a million" → $500,000', () => {
    const r = parseSpend('half a million');
    expect(r.annualSpend).toBe(500_000);
    expect(r.parseFallback).toBe(false);
  });

  // ── Typo tolerance ─────────────────────────────────────────────────────────

  it('"on mllion" → $1,000,000 (typo: on=one, mllion=million)', () => {
    const r = parseSpend('on mllion');
    expect(r.annualSpend).toBe(1_000_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"tow million" → $2,000,000 (typo: tow=two)', () => {
    const r = parseSpend('tow million');
    expect(r.annualSpend).toBe(2_000_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"3 milion" → $3,000,000 (typo: milion=million)', () => {
    const r = parseSpend('3 milion');
    expect(r.annualSpend).toBe(3_000_000);
    expect(r.parseFallback).toBe(false);
  });

  // ── Fallback ───────────────────────────────────────────────────────────────

  it('"depends" → $2,000,000 with parseFallback=true', () => {
    const r = parseSpend('depends');
    expect(r.annualSpend).toBe(2_000_000);
    expect(r.parseFallback).toBe(true);
  });

  it('empty string → $2,000,000 with parseFallback=true', () => {
    const r = parseSpend('');
    expect(r.annualSpend).toBe(2_000_000);
    expect(r.parseFallback).toBe(true);
    expect(r.parseNotes).toContain('empty_input');
  });

  it('"unknown" → $2,000,000 with parseFallback=true', () => {
    const r = parseSpend('unknown');
    expect(r.annualSpend).toBe(2_000_000);
    expect(r.parseFallback).toBe(true);
  });

  it('"not sure" → $2,000,000 with parseFallback=true', () => {
    const r = parseSpend('not sure');
    expect(r.annualSpend).toBe(2_000_000);
    expect(r.parseFallback).toBe(true);
  });

  // ── rawInput preserved ─────────────────────────────────────────────────────

  it('rawInput is preserved exactly', () => {
    const r = parseSpend('  $1M  ');
    expect(r.rawInput).toBe('  $1M  ');
    expect(r.annualSpend).toBe(1_000_000);
  });

  // ── Decimal bare numbers ────────────────────────────────────────────────────
  it('"0.5" → $500,000 (decimal < 1 treated as millions)', () => {
    const r = parseSpend('0.5');
    expect(r.annualSpend).toBe(500_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"1.5" → $1,500,000 (decimal in 0<n<100 range → millions)', () => {
    const r = parseSpend('1.5');
    expect(r.annualSpend).toBe(1_500_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"99.9" → $99,000,000 (99.9 × 1M = $99.9M, capped to $99M)', () => {
    const r = parseSpend('99.9');
    expect(r.annualSpend).toBe(99_000_000);
    expect(r.parseFallback).toBe(false);
    expect(r.parseNotes).toContain('capped_at_99m');
  });

  // ── "N hundred thousand" ────────────────────────────────────────────────────
  it('"five hundred thousand" → $500,000', () => {
    const r = parseSpend('five hundred thousand');
    expect(r.annualSpend).toBe(500_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"three hundred thousand" → $300,000', () => {
    const r = parseSpend('three hundred thousand');
    expect(r.annualSpend).toBe(300_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"2.5 hundred thousand" → $250,000 (numeric N)', () => {
    const r = parseSpend('2.5 hundred thousand');
    expect(r.annualSpend).toBe(250_000);
    expect(r.parseFallback).toBe(false);
  });

  // ── "N thousand" word form ──────────────────────────────────────────────────
  it('"500 thousand" → $500,000', () => {
    const r = parseSpend('500 thousand');
    expect(r.annualSpend).toBe(500_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"2.5 thousand" → $2,500', () => {
    const r = parseSpend('2.5 thousand');
    expect(r.annualSpend).toBe(2_500);
    expect(r.parseFallback).toBe(false);
  });

  // ── Decimal ranges ──────────────────────────────────────────────────────────
  it('"1.5-2M" → $1,750,000 (decimal range)', () => {
    const r = parseSpend('1.5-2M');
    expect(r.annualSpend).toBe(1_750_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"0.5-1M" → $750,000 (decimal lo end)', () => {
    const r = parseSpend('0.5-1M');
    expect(r.annualSpend).toBe(750_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"$1.5M–$3M" → $2,250,000 (currency + decimal range)', () => {
    const r = parseSpend('$1.5M–$3M');
    expect(r.annualSpend).toBe(2_250_000);
    expect(r.parseFallback).toBe(false);
  });

  // ── Large bare numbers ──────────────────────────────────────────────────────
  it('"10" → $10,000,000 (bare 10 → millions)', () => {
    const r = parseSpend('10');
    expect(r.annualSpend).toBe(10_000_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"50" → $50,000,000 (bare 50 → millions)', () => {
    const r = parseSpend('50');
    expect(r.annualSpend).toBe(50_000_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"100" → $100 (exact — no thousands heuristic)', () => {
    const r = parseSpend('100');
    expect(r.annualSpend).toBe(100);
    expect(r.parseFallback).toBe(false);
  });

  // ── Adversarial bare-integer cases ─────────────────────────────────────────
  // These confirm the removed 100–9999 → thousands heuristic stays gone.

  it('"9999" → $9,999 (exact, below_minimum — not $9.999M)', () => {
    const r = parseSpend('9999');
    expect(r.annualSpend).toBe(9_999);
    expect(r.parseFallback).toBe(false);
    expect(r.parseNotes).toContain('bare_heuristic:exact');
  });

  it('"600000" → $600,000 (exact, qualifies at $600K–$800K bucket)', () => {
    const r = parseSpend('600000');
    expect(r.annualSpend).toBe(600_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"1000000" → $1,000,000 (exact, qualifies at $800K–$1M bucket)', () => {
    const r = parseSpend('1000000');
    expect(r.annualSpend).toBe(1_000_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"1500000" → $1,500,000 (exact, qualifies at $1M–$3M bucket)', () => {
    const r = parseSpend('1500000');
    expect(r.annualSpend).toBe(1_500_000);
    expect(r.parseFallback).toBe(false);
  });

  // ── Garbage input guard ────────────────────────────────────────────────────
  // Inputs with alphabetic characters that don't match any known suffix/unit
  // must not be promoted to millions via parseFloat's leading-digit extraction.

  it('"2 grazillion" → parseFallback: true, $2M fallback', () => {
    const r = parseSpend('2 grazillion');
    expect(r.parseFallback).toBe(true);
    expect(r.annualSpend).toBe(2_000_000);
    expect(r.parseNotes).toContain('unresolvable_input');
  });

  it('"5 bazillion" → parseFallback: true', () => {
    const r = parseSpend('5 bazillion');
    expect(r.parseFallback).toBe(true);
    expect(r.parseNotes).toContain('unresolvable_input');
  });

  // ── $99M cap ───────────────────────────────────────────────────────────────
  // Any parsed result strictly above $99M is capped. Exactly $99M is not capped.

  it('"200000000" → capped to $99M', () => {
    const r = parseSpend('200000000');
    expect(r.annualSpend).toBe(99_000_000);
    expect(r.parseFallback).toBe(false);
    expect(r.parseNotes).toContain('capped_at_99m');
  });

  it('"100000000" → capped to $99M', () => {
    const r = parseSpend('100000000');
    expect(r.annualSpend).toBe(99_000_000);
    expect(r.parseNotes).toContain('capped_at_99m');
  });

  it('"99000000" → $99M exact, NOT capped (boundary)', () => {
    const r = parseSpend('99000000');
    expect(r.annualSpend).toBe(99_000_000);
    expect(r.parseFallback).toBe(false);
    expect(r.parseNotes).not.toContain('capped_at_99m');
  });

  it('"99" → $99M via millions heuristic, NOT capped (at boundary)', () => {
    const r = parseSpend('99');
    expect(r.annualSpend).toBe(99_000_000);
    expect(r.parseNotes).toContain('bare_heuristic:millions');
    expect(r.parseNotes).not.toContain('capped_at_99m');
  });

  it('"100" → $100 exact, unchanged by cap', () => {
    const r = parseSpend('100');
    expect(r.annualSpend).toBe(100);
    expect(r.parseFallback).toBe(false);
    expect(r.parseNotes).not.toContain('capped_at_99m');
  });

  it('"600000" → $600,000 exact, unchanged by cap', () => {
    const r = parseSpend('600000');
    expect(r.annualSpend).toBe(600_000);
    expect(r.parseFallback).toBe(false);
    expect(r.parseNotes).not.toContain('capped_at_99m');
  });

  // ── Qualifier/hedging word stripping ─────────────────────────────────────
  // Leading words like "around", "roughly", "about", "approximately", "approx", "~"
  // are stripped before parsing so real inputs from restaurant owners resolve correctly.

  it('"around 1 million" → $1,000,000, parseFallback: false', () => {
    const r = parseSpend('around 1 million');
    expect(r.annualSpend).toBe(1_000_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"roughly 2M" → $2,000,000, parseFallback: false', () => {
    const r = parseSpend('roughly 2M');
    expect(r.annualSpend).toBe(2_000_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"about 800k" → $800,000, parseFallback: false', () => {
    const r = parseSpend('about 800k');
    expect(r.annualSpend).toBe(800_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"approximately 1.5M" → $1,500,000, parseFallback: false', () => {
    const r = parseSpend('approximately 1.5M');
    expect(r.annualSpend).toBe(1_500_000);
    expect(r.parseFallback).toBe(false);
  });

  it('"asdfghjkl" → parseFallback: true (pure gibberish)', () => {
    const r = parseSpend('asdfghjkl');
    expect(r.parseFallback).toBe(true);
  });

  it('"2 grazillion" → parseFallback: true (garbage with leading digit)', () => {
    const r = parseSpend('2 grazillion');
    expect(r.parseFallback).toBe(true);
  });

  it('"depends on the year" → parseFallback: true (no number present)', () => {
    const r = parseSpend('depends on the year');
    expect(r.parseFallback).toBe(true);
  });

  it('"not sure" → parseFallback: true', () => {
    const r = parseSpend('not sure');
    expect(r.parseFallback).toBe(true);
  });
});
