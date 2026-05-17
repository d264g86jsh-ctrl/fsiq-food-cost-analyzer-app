import type { CountryEligibility } from '../website/types';

export interface CountryEligibilityResult {
  countryEligibility: CountryEligibility;
  locationConfidenceScore: number; // 0–100
  locationReasons: string[];
  internalFlags: string[];
}

// State dropdown selection guarantees US eligibility — always returns us_verified.
export function computeCountryEligibility(): CountryEligibilityResult {
  return {
    countryEligibility: 'us_verified',
    locationConfidenceScore: 95,
    locationReasons: ['state_selection_us_confirmed'],
    internalFlags: ['us_state_selected'],
  };
}
