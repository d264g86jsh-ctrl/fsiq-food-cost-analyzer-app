import { describe, it, expect } from 'vitest';
import { determinePdfMode } from '../pdf/pdf-mode';

describe('determinePdfMode — full PDF', () => {
  it('verified_restaurant + us_verified + qualified → full', () => {
    const r = determinePdfMode('verified_restaurant', 'us_verified', true);
    expect(r.mode).toBe('full');
    expect(r.reason).toBe('verified_restaurant');
  });

  it('verified_restaurant + likely_us + qualified → full', () => {
    const r = determinePdfMode('verified_restaurant', 'likely_us', true);
    expect(r.mode).toBe('full');
  });
});

describe('determinePdfMode — conservative PDF', () => {
  it('plausible_unverified + likely_us + qualified → conservative', () => {
    const r = determinePdfMode('plausible_unverified', 'likely_us', true);
    expect(r.mode).toBe('conservative');
    expect(r.reason).toBe('plausible_unverified');
  });

  it('plausible_unverified + unknown + qualified → conservative', () => {
    const r = determinePdfMode('plausible_unverified', 'unknown', true);
    expect(r.mode).toBe('conservative');
  });
});

describe('determinePdfMode — skip: DQ decisions', () => {
  it('national_chain + qualified → skip', () => {
    const r = determinePdfMode('national_chain', 'us_verified', true);
    expect(r.mode).toBe('skip');
    expect(r.reason).toBe('national_chain');
  });

  it('invalid_website + qualified → skip', () => {
    const r = determinePdfMode('invalid_website', 'us_verified', true);
    expect(r.mode).toBe('skip');
    expect(r.reason).toBe('invalid_website');
  });

  it('clear_non_fit + qualified → skip', () => {
    const r = determinePdfMode('clear_non_fit', 'us_verified', true);
    expect(r.mode).toBe('skip');
    expect(r.reason).toBe('clear_non_fit');
  });
});

describe('determinePdfMode — skip: non-US', () => {
  it('verified_restaurant + non_us → skip', () => {
    const r = determinePdfMode('verified_restaurant', 'non_us', true);
    expect(r.mode).toBe('skip');
    expect(r.reason).toBe('non_us');
  });

  it('plausible_unverified + non_us → skip', () => {
    const r = determinePdfMode('plausible_unverified', 'non_us', true);
    expect(r.mode).toBe('skip');
    expect(r.reason).toBe('non_us');
  });
});

describe('determinePdfMode — skip: not qualified', () => {
  it('verified_restaurant + us_verified + NOT qualified → skip', () => {
    const r = determinePdfMode('verified_restaurant', 'us_verified', false);
    expect(r.mode).toBe('skip');
    expect(r.reason).toBe('not_qualified');
  });

  it('plausible_unverified + likely_us + NOT qualified → skip', () => {
    const r = determinePdfMode('plausible_unverified', 'likely_us', false);
    expect(r.mode).toBe('skip');
    expect(r.reason).toBe('not_qualified');
  });
});

describe('determinePdfMode — skip: unrecognized combinations', () => {
  it('plausible_unverified + us_verified → skip (us_verified requires verified_restaurant)', () => {
    const r = determinePdfMode('plausible_unverified', 'us_verified', true);
    expect(r.mode).toBe('skip');
  });

  it('unknown finalDecision + us_verified → skip', () => {
    const r = determinePdfMode('something_new', 'us_verified', true);
    expect(r.mode).toBe('skip');
  });
});
