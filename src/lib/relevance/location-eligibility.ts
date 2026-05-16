import type { CountryEligibility } from '../website/types';

// US ZIP: 5 digits or ZIP+4 (12345 or 12345-6789)
const US_ZIP_REGEX = /^\d{5}(-\d{4})?$/;

// Common non-US postal code patterns (Canadian, UK, etc.)
// Canadian: A1A 1A1 or A1A1A1
// UK: EC1A 1BB, W1A 0AX, etc.
const CANADIAN_POSTAL_REGEX = /^[A-Za-z]\d[A-Za-z]\s?\d[A-Za-z]\d$/;
const UK_POSTAL_REGEX = /^[A-Za-z]{1,2}\d[A-Za-z\d]?\s?\d[A-Za-z]{2}$/;

export type ZipStatus = 'valid_us' | 'non_us_format' | 'malformed' | 'empty';

export interface ZipValidationResult {
  status: ZipStatus;
  isValid: boolean;
  userFacingMessage: string | null;
  internalFlags: string[];
}

export function validateZipCode(zip: string): ZipValidationResult {
  const trimmed = zip.trim();

  if (!trimmed) {
    return {
      status: 'empty',
      isValid: false,
      userFacingMessage: 'ZIP code is required.',
      internalFlags: ['zip_empty'],
    };
  }

  if (US_ZIP_REGEX.test(trimmed)) {
    return {
      status: 'valid_us',
      isValid: true,
      userFacingMessage: null,
      internalFlags: ['us_zip_valid'],
    };
  }

  if (CANADIAN_POSTAL_REGEX.test(trimmed) || UK_POSTAL_REGEX.test(trimmed)) {
    return {
      status: 'non_us_format',
      isValid: false,
      userFacingMessage:
        'Our program is currently available for U.S.-based restaurants. Please enter a U.S. ZIP code.',
      internalFlags: ['non_us_postal_code'],
    };
  }

  // Heuristic: contains letters in a postal-code-like pattern → likely non-US
  if (/[A-Za-z]/.test(trimmed) && trimmed.length >= 5) {
    return {
      status: 'non_us_format',
      isValid: false,
      userFacingMessage:
        'Our program is currently available for U.S.-based restaurants. Please enter a U.S. ZIP code.',
      internalFlags: ['non_us_postal_code'],
    };
  }

  return {
    status: 'malformed',
    isValid: false,
    userFacingMessage: 'Please enter a valid U.S. ZIP code (e.g. 78704).',
    internalFlags: ['zip_malformed'],
  };
}

export interface CountryEligibilityResult {
  countryEligibility: CountryEligibility;
  locationConfidenceScore: number; // 0–100
  locationReasons: string[];
  internalFlags: string[];
}

export function computeCountryEligibility(options: {
  zipStatus: ZipStatus;
  placesCountry?: string | null; // ISO 3166-1 alpha-2, e.g. "US", "CA"
  googlePlacesQueried: boolean;
}): CountryEligibilityResult {
  const { zipStatus, placesCountry, googlePlacesQueried } = options;
  const reasons: string[] = [];
  const flags: string[] = [];

  const zipIsUsValid = zipStatus === 'valid_us';
  const zipIsNonUs = zipStatus === 'non_us_format';

  if (zipIsUsValid) reasons.push('us_zip_valid');
  if (zipIsNonUs) flags.push('non_us_postal_code');

  // Google Places result overrides ZIP-based assessment for country
  if (googlePlacesQueried && placesCountry) {
    if (placesCountry.toUpperCase() === 'US') {
      reasons.push('google_place_us_confirmed');
      return {
        countryEligibility: 'us_verified',
        locationConfidenceScore: 95,
        locationReasons: reasons,
        internalFlags: flags,
      };
    } else {
      flags.push('google_place_non_us');
      flags.push('non_us_ineligible');
      return {
        countryEligibility: 'non_us',
        locationConfidenceScore: 5,
        locationReasons: reasons,
        internalFlags: flags,
      };
    }
  }

  // Places not queried or returned no country
  if (zipIsNonUs) {
    flags.push('non_us_ineligible');
    return {
      countryEligibility: 'non_us',
      locationConfidenceScore: 5,
      locationReasons: reasons,
      internalFlags: flags,
    };
  }

  if (zipIsUsValid) {
    return {
      countryEligibility: 'likely_us',
      locationConfidenceScore: 60,
      locationReasons: reasons,
      internalFlags: flags,
    };
  }

  return {
    countryEligibility: 'unknown',
    locationConfidenceScore: 0,
    locationReasons: reasons,
    internalFlags: flags,
  };
}
