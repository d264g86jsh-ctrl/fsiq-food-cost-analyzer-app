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

  it('bare "500" → $500,000 (100–9999 = thousands)', () => {
    const r = parseSpend('500');
    expect(r.annualSpend).toBe(500_000);
    expect(r.parseFallback).toBe(false);
  });

  it('bare "750" → $750,000', () => {
    const r = parseSpend('750');
    expect(r.annualSpend).toBe(750_000);
    expect(r.parseFallback).toBe(false);
  });

  it('bare "50000" → $50,000 (>= 10,000 = exact)', () => {
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
});
