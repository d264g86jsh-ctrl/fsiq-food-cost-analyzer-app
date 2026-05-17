// Client-side form validation for the Phase 4 Analyzer Quiz.
// Rules: block only on missing required fields, malformed required inputs,
// invalid_website, and active checking state.
// Never block on eligibility decisions (national_chain, clear_non_fit, non_us, below_threshold).

import type { AnalyzerFormPayload } from './form-types';
import { STATE_OPTIONS } from './form-types';
import type { ValidationUIState } from '@/components/analyzer/WebsiteValidationStatus';

// ── Field format validators ───────────────────────────────────────────────────

export function isValidUsState(state: string): boolean {
  return STATE_OPTIONS.includes(state.trim().toUpperCase() as typeof STATE_OPTIONS[number]);
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

// ── Step advancement gates ────────────────────────────────────────────────────

export function canAdvanceFromStep1(
  formData: Partial<AnalyzerFormPayload>,
  validationState: ValidationUIState,
): boolean {
  if (!formData.restaurant_name?.trim()) return false;
  if (!formData.website?.trim()) return false;
  if (!formData.state?.trim() || !isValidUsState(formData.state)) return false;
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
  if (!formData.state?.trim() || !isValidUsState(formData.state)) {
    errors.state = 'Please select your state.';
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
  return errors;
}
