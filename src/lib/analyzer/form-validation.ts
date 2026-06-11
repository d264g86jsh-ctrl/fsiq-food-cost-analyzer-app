// Client-side form validation for the Phase 4 Analyzer Quiz.
// Rules: block only on missing required fields, malformed required inputs,
// invalid_website, and active checking state.
// Never block on eligibility decisions (national_chain, clear_non_fit, non_us, below_threshold).

import type { AnalyzerFormPayload } from './form-types';
import type { ValidationUIState } from '@/components/analyzer/WebsiteValidationStatus';

// ── Field format validators ───────────────────────────────────────────────────

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// Phone validation — light format check that accepts all common international formats.
// Strips formatting characters ( ) - . and spaces, then requires an optional leading +
// followed by 7–15 digits (ITU-T E.164 range; Mexico +52 numbers are 12 digits).
// Returns true when the stripped value looks like a real phone number.
// Returns false for plain text, SQL strings, empty-after-strip, or extreme lengths.
export function isValidPhone(phone: string): boolean {
  const stripped = phone.trim().replace(/[\s()\-.]/g, '');
  if (!/^\+?\d+$/.test(stripped)) return false;          // non-digit/non-+ chars remain
  const digitCount = stripped.replace(/^\+/, '').length;
  return digitCount >= 7 && digitCount <= 15;
}

// Server-side normalization — produce a GHL-safe phone string or null.
// Exported so submitAnalysis can import it without duplicating the logic.
// When normalization returns null, callers must OMIT phone from the GHL payload
// (never send an unnormalized string to GHL).
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw?.trim()) return null;
  const stripped = raw.trim().replace(/[\s()\-.]/g, '');
  if (!/^\+?\d+$/.test(stripped)) return null;
  const digitCount = stripped.replace(/^\+/, '').length;
  if (digitCount < 7 || digitCount > 15) return null;
  return stripped;
}

// ── Step advancement gates ────────────────────────────────────────────────────

export function canAdvanceFromStep1(
  formData: Partial<AnalyzerFormPayload>,
  validationState: ValidationUIState,
): boolean {
  if (!formData.restaurant_name?.trim()) return false;
  if (!formData.website?.trim()) return false;
  if (!formData.us_business_confirmed) return false;
  // Block on active check (race condition guard) and confirmed invalid website
  if (validationState === 'checking') return false;
  if (validationState === 'invalid_website') return false;
  return true;
}

export function canAdvanceFromStep2(formData: Partial<AnalyzerFormPayload>): boolean {
  return !!(formData.concept_type && formData.locations && formData.annual_food_spend);
}

export function canAdvanceFromStep3(formData: Partial<AnalyzerFormPayload>): boolean {
  return !!(
    formData.distributor_type &&
    formData.procurement_strategy &&
    formData.top_skus?.trim()
  );
}

export function canSubmitStep4(formData: Partial<AnalyzerFormPayload>): boolean {
  if (!formData.full_name?.trim()) return false;
  if (!formData.email?.trim() || !isValidEmail(formData.email)) return false;
  if (!formData.phone?.trim()) return false;                        // required
  if (!isValidPhone(formData.phone)) return false;                  // format check
  return true;
}

// ── Error message generators ──────────────────────────────────────────────────

export function getStep1Errors(
  formData: Partial<AnalyzerFormPayload>,
  validationState: ValidationUIState,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!formData.restaurant_name?.trim()) {
    errors.restaurant_name = 'Restaurant name is required.';
  }
  if (!formData.website?.trim()) {
    errors.website = 'Website is required.';
  } else if (validationState === 'invalid_website') {
    errors.website = 'Please check the website URL and try again.';
  }
  if (!formData.us_business_confirmed) {
    errors.us_business_confirmed = 'Please confirm your business operates in the U.S. to continue.';
  }
  return errors;
}

export function getStep4Errors(formData: Partial<AnalyzerFormPayload>): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!formData.full_name?.trim()) {
    errors.full_name = 'Full name is required.';
  }
  if (!formData.email?.trim()) {
    errors.email = 'Email address is required.';
  } else if (!isValidEmail(formData.email)) {
    errors.email = 'Please enter a valid email address.';
  }
  if (!formData.phone?.trim()) {
    errors.phone = 'Phone number is required.';
  } else if (!isValidPhone(formData.phone)) {
    errors.phone = 'Please enter a valid phone number (e.g. +1 555 123 4567).';
  }
  return errors;
}
