import type { CountryEligibility } from '../website/types';

export interface CountryEligibilityResult {
  countryEligibility: CountryEligibility;
  locationConfidenceScore: number; // 0–100
  locationReasons: string[];
  internalFlags: string[];
}

// User attestation of U.S. business operation guarantees eligibility — always returns us_verified.
export function computeCountryEligibility(): CountryEligibilityResult {
  return {
    countryEligibility: 'us_verified',
    locationConfidenceScore: 99,
    locationReasons: ['user_attested_us'],
    internalFlags: ['user_attested_us'],
  };
}
