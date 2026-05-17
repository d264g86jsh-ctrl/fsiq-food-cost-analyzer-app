// Assembles the GhlHandoffPayload from a Prisma Submission record.
// Called by Phase 8 immediately before syncToGhl().
// Source of truth: docs/ghl-email-handoff.md §GHL Custom Fields.

import type { Submission } from '@prisma/client';
import type { GhlHandoffPayload } from './ghl-types';
import type { LeadStatus, CommunicationRoute } from './lead-status';
import type { GhlTag } from './ghl-tags';

export function buildGhlPayload(
  submission: Submission,
  leadStatus: LeadStatus,
  communicationRoute: CommunicationRoute,
  tags: GhlTag[],
): GhlHandoffPayload {
  const qualified = submission.qualified === true;

  return {
    // Identity / contact
    fsiq_submission_id:         submission.id,
    fsiq_full_name:             submission.fullName,
    fsiq_email:                 submission.email,
    fsiq_phone:                 submission.phone ?? null,

    // Restaurant profile
    fsiq_restaurant_name:       submission.restaurantName,
    fsiq_website:               submission.website,
    fsiq_zip_code:              submission.zipCode,
    fsiq_concept_type:          submission.conceptType,
    fsiq_locations:             submission.locations,
    fsiq_annual_food_spend:     submission.annualFoodSpend,
    fsiq_distributor_type:      submission.distributorType,
    fsiq_procurement_strategy:  submission.procurementStrategy,
    fsiq_top_skus:              submission.topSkus,

    // Qualification and routing
    fsiq_lead_status:           leadStatus,
    fsiq_communication_route:   communicationRoute,
    fsiq_qualified:             qualified,
    fsiq_final_decision:        submission.finalDecision ?? '',
    fsiq_country_eligibility:   submission.countryEligibility ?? '',
    fsiq_dq_reason:             submission.dqReason ?? null,

    // Savings estimates — empty string for DQ leads
    fsiq_estimated_savings:     qualified && submission.dollarEstimate !== null
                                  ? formatDollars(submission.dollarEstimate)
                                  : '',
    fsiq_final_pct:             qualified && submission.finalPct !== null
                                  ? `${(Math.round(submission.finalPct * 10) / 10).toFixed(1)}%`
                                  : '',
    fsiq_spend_bucket:          submission.spendBucket ?? '',

    // PDF
    fsiq_pdf_mode:              submission.pdfMode ?? null,
    fsiq_pdf_status:            submission.pdfStatus ?? 'pending',
    fsiq_pdf_url:               submission.pdfDownloadUrl ?? null,
    fsiq_pdf_ready_at:          submission.pdfDownloadUrl !== null
                                  ? submission.updatedAt.toISOString()
                                  : null,

    // Workflow
    fsiq_manual_review_required: submission.manualReviewRequired,
    fsiq_workflow_status:        submission.workflowStatus ?? 'pending',
    fsiq_workflow_stage:         submission.workflowStage ?? '',

    // Tags assembled by assignLeadStatus — applied at sync time
    tags,
  };
}

function formatDollars(amount: number): string {
  return '$' + amount.toLocaleString('en-US');
}
