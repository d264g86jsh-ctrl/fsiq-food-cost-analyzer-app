'use server';

// Phase 4 stub — accepts the typed payload, returns success with no side effects.
// Phase 8 replaces the body with: DB persist → website re-validate → qualifyLead
// → AI pipeline → PDFMonkey → email → GHL sync → Meta CAPI event.

import type { AnalyzerFormPayload } from '@/lib/analyzer/form-types';

export interface SubmitAnalysisResult {
  success: boolean;
  submissionId: string | null;
  error: string | null;
}

export async function submitAnalysis(
  payload: AnalyzerFormPayload,
): Promise<SubmitAnalysisResult> {
  console.log('[submitAnalysis stub] received submission', {
    restaurant_name: payload.restaurant_name,
    website: payload.website,
    zip_code: payload.zip_code,
    concept_type: payload.concept_type,
    locations: payload.locations,
    annual_food_spend: payload.annual_food_spend,
    distributor_type: payload.distributor_type,
    procurement_strategy: payload.procurement_strategy,
    top_skus: payload.top_skus,
    full_name: payload.full_name,
    email: payload.email,
    phone: payload.phone ?? null,
    utm_source: payload.utm_source ?? null,
  });

  return { success: true, submissionId: null, error: null };
}
