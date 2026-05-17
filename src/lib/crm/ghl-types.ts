// Phase 7 — GHL custom field payload type.
// Source of truth: docs/ghl-email-handoff.md §GHL Custom Fields
//
// This type describes the object the app sends to GHL at sync time.
// All fields are prefixed fsiq_ to avoid collisions with other GHL integrations.
// Phase 8 (ghl.ts) will map a Submission record onto this shape before calling the GHL API.

import type { LeadStatus, CommunicationRoute } from './lead-status';
import type { GhlTag } from './ghl-tags';

export interface GhlHandoffPayload {
  // Identity / contact
  fsiq_submission_id:         string;
  fsiq_full_name:             string;
  fsiq_email:                 string;
  fsiq_phone:                 string | null;

  // Restaurant profile (all visible form answers — available for GHL email personalization)
  fsiq_restaurant_name:       string;
  fsiq_website:               string;
  fsiq_state:                 string;
  fsiq_concept_type:          string;
  fsiq_locations:             string;
  fsiq_annual_food_spend:     string; // raw dropdown value e.g. "$1M–$3M"
  fsiq_distributor_type:      string;
  fsiq_procurement_strategy:  string;
  fsiq_top_skus:              string;

  // Qualification and routing
  fsiq_lead_status:           LeadStatus;
  fsiq_communication_route:   CommunicationRoute;
  fsiq_qualified:             boolean;
  fsiq_final_decision:        string;
  fsiq_country_eligibility:   string;
  fsiq_dq_reason:             string | null;

  // Savings estimates (populated for qualified leads; empty string otherwise)
  fsiq_estimated_savings:     string; // e.g. "$147,000" or ""
  fsiq_final_pct:             string; // e.g. "7.4%" or ""
  fsiq_spend_bucket:          string; // e.g. "$1M–$3M" or ""

  // PDF
  fsiq_pdf_mode:              'full' | 'conservative' | null;
  fsiq_pdf_status:            string; // "complete" | "error" | "skipped" | "pending"
  fsiq_pdf_url:               string | null; // non-null only when pdfStatus = "complete"
  fsiq_pdf_ready_at:          string | null; // ISO timestamp when pdfDownloadUrl confirmed

  // Workflow
  fsiq_manual_review_required: boolean;
  fsiq_workflow_status:        string;
  fsiq_workflow_stage:         string;

  // Tags applied at sync time (assembled by Phase 8 before calling GHL API)
  tags: GhlTag[];
}
