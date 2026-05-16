import { describe, it, expect } from 'vitest';
import { validateZipCode, computeCountryEligibility } from '../relevance/location-eligibility';

describe('validateZipCode', () => {
  it('78704 → valid US ZIP', () => {
    const r = validateZipCode('78704');
    expect(r.status).toBe('valid_us');
    expect(r.isValid).toBe(true);
    expect(r.userFacingMessage).toBeNull();
    expect(r.internalFlags).toContain('us_zip_valid');
  });

  it('78704-1234 → valid ZIP+4', () => {
    const r = validateZipCode('78704-1234');
    expect(r.status).toBe('valid_us');
    expect(r.isValid).toBe(true);
  });

  it('00501 → valid US ZIP (edge: Holtsville NY)', () => {
    const r = validateZipCode('00501');
    expect(r.status).toBe('valid_us');
    expect(r.isValid).toBe(true);
  });

  it('H2X 1Y4 → non-US format (Canadian)', () => {
    const r = validateZipCode('H2X 1Y4');
    expect(r.status).toBe('non_us_format');
    expect(r.isValid).toBe(false);
    expect(r.internalFlags).toContain('non_us_postal_code');
    expect(r.userFacingMessage).toContain('U.S.');
  });

  it('H2X1Y4 (no space) → non-US format', () => {
    const r = validateZipCode('H2X1Y4');
    expect(r.status).toBe('non_us_format');
    expect(r.isValid).toBe(false);
  });

  it('EC1A 1BB → non-US format (UK)', () => {
    const r = validateZipCode('EC1A 1BB');
    expect(r.status).toBe('non_us_format');
    expect(r.isValid).toBe(false);
  });

  it('abc → malformed', () => {
    const r = validateZipCode('abc');
    expect(r.status).toBe('malformed');
    expect(r.isValid).toBe(false);
    expect(r.userFacingMessage).toContain('valid U.S. ZIP code');
  });

  it('1234 (only 4 digits) → malformed', () => {
    const r = validateZipCode('1234');
    expect(r.status).toBe('malformed');
    expect(r.isValid).toBe(false);
  });

  it('empty → required error', () => {
    const r = validateZipCode('');
    expect(r.status).toBe('empty');
    expect(r.isValid).toBe(false);
    expect(r.userFacingMessage).toContain('required');
  });

  it('whitespace only → required error', () => {
    const r = validateZipCode('   ');
    expect(r.status).toBe('empty');
    expect(r.isValid).toBe(false);
  });
});

describe('computeCountryEligibility', () => {
  it('valid US ZIP, no Places query → likely_us', () => {
    const r = computeCountryEligibility({ zipStatus: 'valid_us', googlePlacesQueried: false });
    expect(r.countryEligibility).toBe('likely_us');
    expect(r.locationReasons).toContain('us_zip_valid');
  });

  it('valid US ZIP + Places returns US → us_verified', () => {
    const r = computeCountryEligibility({
      zipStatus: 'valid_us',
      placesCountry: 'US',
      googlePlacesQueried: true,
    });
    expect(r.countryEligibility).toBe('us_verified');
    expect(r.locationReasons).toContain('google_place_us_confirmed');
    expect(r.locationConfidenceScore).toBeGreaterThan(90);
  });

  it('valid US ZIP + Places returns CA (Canada) → non_us', () => {
    const r = computeCountryEligibility({
      zipStatus: 'valid_us',
      placesCountry: 'CA',
      googlePlacesQueried: true,
    });
    expect(r.countryEligibility).toBe('non_us');
    expect(r.internalFlags).toContain('google_place_non_us');
    expect(r.internalFlags).toContain('non_us_ineligible');
  });

  it('non_us_format ZIP → non_us regardless of Places', () => {
    const r = computeCountryEligibility({ zipStatus: 'non_us_format', googlePlacesQueried: false });
    expect(r.countryEligibility).toBe('non_us');
    expect(r.internalFlags).toContain('non_us_ineligible');
  });

  it('Google Places API unavailable (not queried) → falls back to likely_us for valid US ZIP', () => {
    const r = computeCountryEligibility({
      zipStatus: 'valid_us',
      placesCountry: null,
      googlePlacesQueried: false,
    });
    expect(r.countryEligibility).toBe('likely_us');
  });

  it('malformed ZIP, no Places → unknown', () => {
    const r = computeCountryEligibility({ zipStatus: 'malformed', googlePlacesQueried: false });
    expect(r.countryEligibility).toBe('unknown');
  });
});
