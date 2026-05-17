import { describe, it, expect } from 'vitest';
import { computeCountryEligibility } from '../relevance/location-eligibility';

describe('computeCountryEligibility always returns us_verified', () => {
  it('returns us_verified with state_selection_us_confirmed reason', () => {
    const r = computeCountryEligibility();
    expect(r.countryEligibility).toBe('us_verified');
    expect(r.locationReasons).toContain('state_selection_us_confirmed');
  });

  it('returns high confidence score', () => {
    const r = computeCountryEligibility();
    expect(r.locationConfidenceScore).toBeGreaterThanOrEqual(90);
  });

  it('includes us_state_selected internal flag', () => {
    const r = computeCountryEligibility();
    expect(r.internalFlags).toContain('us_state_selected');
  });
});
