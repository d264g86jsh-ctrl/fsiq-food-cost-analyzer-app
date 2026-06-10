import { describe, it, expect } from 'vitest';
import { deriveLeadSource } from '../meta/lead-source';

describe('deriveLeadSource', () => {
  // fbclid always wins
  it('returns meta when fbclid is present, regardless of utm_source', () => {
    expect(deriveLeadSource(undefined,     'abc123')).toBe('meta');
    expect(deriveLeadSource('google',      'abc123')).toBe('meta');
    expect(deriveLeadSource('newsletter',  'abc123')).toBe('meta');
  });

  // Meta utm_source values
  it('returns meta for utm_source = facebook', () => expect(deriveLeadSource('facebook')).toBe('meta'));
  it('returns meta for utm_source = instagram', () => expect(deriveLeadSource('instagram')).toBe('meta'));
  it('returns meta for utm_source = meta', () => expect(deriveLeadSource('meta')).toBe('meta'));
  it('returns meta for utm_source = fb', () => expect(deriveLeadSource('fb')).toBe('meta'));
  it('returns meta for utm_source = ig', () => expect(deriveLeadSource('ig')).toBe('meta'));
  it('returns meta for utm_source case-insensitive (Facebook)', () => expect(deriveLeadSource('Facebook')).toBe('meta'));

  // Google utm_source values
  it('returns google for utm_source = google', () => expect(deriveLeadSource('google')).toBe('google'));
  it('returns google for utm_source = google-ads', () => expect(deriveLeadSource('google-ads')).toBe('google'));
  it('returns google for utm_source = adwords', () => expect(deriveLeadSource('adwords')).toBe('google'));

  // Organic — any other utm_source
  it('returns organic for any other utm_source', () => {
    expect(deriveLeadSource('email')).toBe('organic');
    expect(deriveLeadSource('linkedin')).toBe('organic');
    expect(deriveLeadSource('newsletter')).toBe('organic');
    expect(deriveLeadSource('partner')).toBe('organic');
  });

  // Direct — nothing at all
  it('returns direct when utm_source is absent', () => expect(deriveLeadSource()).toBe('direct'));
  it('returns direct when utm_source is null', () => expect(deriveLeadSource(null)).toBe('direct'));
  it('returns direct when utm_source is empty string', () => expect(deriveLeadSource('')).toBe('direct'));
  it('returns direct when both args are null/undefined', () => expect(deriveLeadSource(null, null)).toBe('direct'));
});
