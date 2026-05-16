'use server';

// Server action wrapper for website validation.
// Used on form submit and as the pre-PDF gate inside submitAnalysis.ts (Phase 8).
// Does not write to the database — that is Phase 8's responsibility.

import { runValidation } from '@/app/api/validate-website/route';
import type { ValidationResult, ValidateWebsiteRequest } from '@/lib/website/types';

export interface ValidateWebsiteActionResult {
  success: boolean;
  result: ValidationResult | null;
  error: string | null;
}

export async function validateWebsite(
  input: ValidateWebsiteRequest,
): Promise<ValidateWebsiteActionResult> {
  try {
    const result = await runValidation(input);
    return { success: true, result, error: null };
  } catch (err) {
    console.error('[validateWebsite action] Error:', err);
    return {
      success: false,
      result: null,
      error: 'Validation failed. Please try again.',
    };
  }
}
