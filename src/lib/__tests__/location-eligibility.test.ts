import { describe, it, expect } from 'vitest';
import { computeCountryEligibility } from '../relevance/location-eligibility';

describe('computeCountryEligibility always returns us_verified', () => {
  it('returns us_verified with user_attested_us reason', () => {
    const r = computeCountryEligibility();
    expect(r.countryEligibility).toBe('us_verified');
    expect(r.locationReasons).toContain('user_attested_us');
  });

  it('returns high confidence score', () => {
    const r = computeCountryEligibility();
    expect(r.locationConfidenceScore).toBeGreaterThanOrEqual(90);
  });

  it('includes user_attested_us internal flag', () => {
    const r = computeCountryEligibility();
    expect(r.internalFlags).toContain('user_attested_us');
  });
});
