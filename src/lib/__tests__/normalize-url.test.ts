import { describe, it, expect } from 'vitest';
import { normalizeUrl } from '../website/normalize-url';

describe('normalizeUrl', () => {
  it('adds https:// when scheme is missing', () => {
    const r = normalizeUrl('example.com');
    expect(r.normalizedUrl).toBe('https://example.com/');
    expect(r.isValid).toBe(true);
  });

  it('lowercases the domain', () => {
    const r = normalizeUrl('HTTPS://Example.Com/');
    expect(r.normalizedUrl).toContain('example.com');
  });

  it('removes trailing slash from pathname', () => {
    const r = normalizeUrl('https://example.com/menu/');
    expect(r.normalizedUrl).toBe('https://example.com/menu');
  });

  it('keeps root slash as-is', () => {
    const r = normalizeUrl('https://example.com/');
    expect(r.normalizedUrl).toBe('https://example.com/');
  });

  it('trims whitespace before processing', () => {
    const r = normalizeUrl('  https://example.com  ');
    expect(r.isValid).toBe(true);
    expect(r.normalizedUrl).toContain('example.com');
  });

  it('collapses internal spaces', () => {
    const r = normalizeUrl('https://example .com');
    expect(r.isValid).toBe(true);
  });

  it('returns isValid=false for empty input', () => {
    const r = normalizeUrl('');
    expect(r.isValid).toBe(false);
  });

  it('returns isValid=false for input with no domain structure', () => {
    const r = normalizeUrl('notaurl');
    expect(r.isValid).toBe(false);
  });

  it('detects toasttab platform', () => {
    const r = normalizeUrl('https://order.toasttab.com/casaroberto');
    expect(r.platform).toBe('toasttab');
    expect(r.isValid).toBe(true);
  });

  it('detects instagram platform', () => {
    const r = normalizeUrl('https://instagram.com/casaroberto');
    expect(r.platform).toBe('instagram');
  });

  it('detects doordash platform', () => {
    const r = normalizeUrl('https://doordash.com/store/casa-roberto');
    expect(r.platform).toBe('doordash');
  });

  it('detects squareup platform', () => {
    const r = normalizeUrl('https://squareup.com/store/casaroberto');
    expect(r.platform).toBe('squareup');
  });

  it('detects resy platform', () => {
    const r = normalizeUrl('https://resy.com/cities/nyc/casaroberto');
    expect(r.platform).toBe('resy');
  });

  it('detects opentable platform', () => {
    const r = normalizeUrl('https://opentable.com/r/casaroberto');
    expect(r.platform).toBe('opentable');
  });

  it('returns null platform for a regular restaurant domain', () => {
    const r = normalizeUrl('https://casaroberto.com');
    expect(r.platform).toBeNull();
  });

  it('flags known vendor domain sysco.com', () => {
    const r = normalizeUrl('https://sysco.com');
    expect(r.isKnownVendor).toBe(true);
  });

  it('does not flag regular restaurant as vendor', () => {
    const r = normalizeUrl('https://casaroberto.com');
    expect(r.isKnownVendor).toBe(false);
  });
});
