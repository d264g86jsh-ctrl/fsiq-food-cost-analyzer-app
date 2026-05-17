// Pure routing layer — maps pipeline state to lead status, communication route, and GHL tags.
// Source of truth: docs/ghl-email-handoff.md, docs/build-phases.md §Phase 7.
//
// Key rules enforced here:
// - clear_non_fit (any reason, including non_us) is always DQ regardless of spend qualification.
//   This check uses finalDecision from the validator — not dqReason from the qualification engine,
//   because the engine does not explicitly check for clear_non_fit and may return qualified=true.
// - PDF-ready tags are never included unless pdfStatus === 'complete' and pdfDownloadUrl is non-null.

import { LEAD_STATUS, COMMUNICATION_ROUTE, type LeadStatus, type CommunicationRoute } from './lead-status';
import { GHL_TAG, type GhlTag } from './ghl-tags';

export interface AssignLeadStatusInput {
  // From validation result — used to detect clear_non_fit routing before qualification check
  finalDecision: string;
  countryEligibility: string;

  // From qualification engine
  qualified: boolean;
  dqReason: string | null;

  // From PDF generation
  pdfMode: 'full' | 'conservative' | null;
  pdfStatus: 'complete' | 'error' | 'skipped' | null;
  pdfDownloadUrl: string | null;

  // Pipeline state flags
  manualReviewRequired: boolean;
  workflowFailed: boolean;
}

export interface AssignLeadStatusResult {
  leadStatus: LeadStatus;
  communicationRoute: CommunicationRoute;
  tags: GhlTag[];
  shouldSyncGhl: boolean;
}

// needsAiAndPdf — pure predicate used by the orchestrator to decide whether to run AI + PDF.
// Returns false for all paths that go to DQ, manual review, or clear_non_fit.
// This keeps the routing decision in the routing layer, not scattered across submitAnalysis.ts.
export function needsAiAndPdf(input: {
  finalDecision: string;
  qualified: boolean;
  manualReviewRequired: boolean;
  workflowFailed: boolean;
}): boolean {
  if (input.workflowFailed) return false;
  if (input.manualReviewRequired) return false;
  if (input.finalDecision === 'clear_non_fit') return false;
  return input.qualified;
}

export function assignLeadStatus(input: AssignLeadStatusInput): AssignLeadStatusResult {
  // Priority 1: workflow failure — overrides everything
  if (input.workflowFailed) {
    return {
      leadStatus: LEAD_STATUS.WORKFLOW_FAILED,
      communicationRoute: COMMUNICATION_ROUTE.NO_EMAIL_HOLD,
      tags: [GHL_TAG.WORKFLOW_FAILED],
      shouldSyncGhl: true,
    };
  }

  // Priority 2: manual review — sync immediately with hold; no PDF or email
  if (input.manualReviewRequired) {
    return {
      leadStatus: LEAD_STATUS.MANUAL_REVIEW_REQUIRED,
      communicationRoute: COMMUNICATION_ROUTE.MANUAL_REVIEW_HOLD,
      tags: [GHL_TAG.ANALYZER_SUBMITTED, GHL_TAG.MANUAL_REVIEW],
      shouldSyncGhl: true,
    };
  }

  // Priority 3: clear_non_fit — always DQ regardless of spend qualification.
  // Uses finalDecision (not dqReason) because the qualification engine does not
  // check for clear_non_fit and may return qualified=true for spend-eligible leads.
  if (input.finalDecision === 'clear_non_fit') {
    if (input.countryEligibility === 'non_us') {
      return {
        leadStatus: LEAD_STATUS.DISQUALIFIED_NON_US,
        communicationRoute: COMMUNICATION_ROUTE.SEND_DQ_NON_US,
        tags: [GHL_TAG.ANALYZER_SUBMITTED, GHL_TAG.NON_US],
        shouldSyncGhl: true,
      };
    }
    return {
      leadStatus: LEAD_STATUS.DISQUALIFIED_CLEAR_NON_FIT,
      communicationRoute: COMMUNICATION_ROUTE.SEND_DQ_CLEAR_NON_FIT,
      tags: [GHL_TAG.ANALYZER_SUBMITTED, GHL_TAG.DQ_CLEAR_NON_FIT],
      shouldSyncGhl: true,
    };
  }

  // Priority 4: other DQ reasons from the qualification engine
  if (!input.qualified) {
    return assignDqStatus(input.dqReason, input.countryEligibility);
  }

  // Priority 5: qualified — PDF routing
  return assignQualifiedStatus(input.pdfMode, input.pdfStatus, input.pdfDownloadUrl);
}

function assignDqStatus(dqReason: string | null, countryEligibility: string): AssignLeadStatusResult {
  switch (dqReason) {
    case 'national_chain':
      return {
        leadStatus: LEAD_STATUS.DISQUALIFIED_NATIONAL_CHAIN,
        communicationRoute: COMMUNICATION_ROUTE.SEND_DQ_NATIONAL_CHAIN,
        tags: [GHL_TAG.ANALYZER_SUBMITTED, GHL_TAG.DQ_NATIONAL_CHAIN],
        shouldSyncGhl: true,
      };

    case 'invalid_website':
      return {
        leadStatus: LEAD_STATUS.DISQUALIFIED_INVALID_WEBSITE,
        communicationRoute: COMMUNICATION_ROUTE.SEND_DQ_INVALID_WEBSITE,
        tags: [GHL_TAG.ANALYZER_SUBMITTED, GHL_TAG.DQ_INVALID_WEBSITE],
        shouldSyncGhl: true,
      };

    case 'below_threshold':
    case 'below_minimum':
      return {
        leadStatus: LEAD_STATUS.DISQUALIFIED_BELOW_THRESHOLD,
        communicationRoute: COMMUNICATION_ROUTE.SEND_DQ_BELOW_THRESHOLD,
        tags: [GHL_TAG.ANALYZER_SUBMITTED, GHL_TAG.DQ_BELOW_THRESHOLD],
        shouldSyncGhl: true,
      };

    case 'clear_non_fit':
      // Fallback: dqReason path (defense-in-depth for explicit DQ reason from engine)
      if (countryEligibility === 'non_us') {
        return {
          leadStatus: LEAD_STATUS.DISQUALIFIED_NON_US,
          communicationRoute: COMMUNICATION_ROUTE.SEND_DQ_NON_US,
          tags: [GHL_TAG.ANALYZER_SUBMITTED, GHL_TAG.NON_US],
          shouldSyncGhl: true,
        };
      }
      return {
        leadStatus: LEAD_STATUS.DISQUALIFIED_CLEAR_NON_FIT,
        communicationRoute: COMMUNICATION_ROUTE.SEND_DQ_CLEAR_NON_FIT,
        tags: [GHL_TAG.ANALYZER_SUBMITTED, GHL_TAG.DQ_CLEAR_NON_FIT],
        shouldSyncGhl: true,
      };

    default:
      return {
        leadStatus: LEAD_STATUS.DISQUALIFIED_CLEAR_NON_FIT,
        communicationRoute: COMMUNICATION_ROUTE.SEND_DQ_CLEAR_NON_FIT,
        tags: [GHL_TAG.ANALYZER_SUBMITTED, GHL_TAG.DQ_CLEAR_NON_FIT],
        shouldSyncGhl: true,
      };
  }
}

function assignQualifiedStatus(
  pdfMode: 'full' | 'conservative' | null,
  pdfStatus: 'complete' | 'error' | 'skipped' | null,
  pdfDownloadUrl: string | null,
): AssignLeadStatusResult {
  // PDF-ready gate: URL must be confirmed non-null before sending PDF-ready tags
  if (pdfStatus === 'complete' && pdfDownloadUrl !== null) {
    if (pdfMode === 'full') {
      return {
        leadStatus: LEAD_STATUS.QUALIFIED_FULL_PDF_READY,
        communicationRoute: COMMUNICATION_ROUTE.SEND_FULL_REPORT,
        tags: [GHL_TAG.ANALYZER_SUBMITTED, GHL_TAG.QUALIFIED, GHL_TAG.FULL_PDF_READY],
        shouldSyncGhl: true,
      };
    }
    if (pdfMode === 'conservative') {
      return {
        leadStatus: LEAD_STATUS.QUALIFIED_CONSERVATIVE_PDF_READY,
        communicationRoute: COMMUNICATION_ROUTE.SEND_CONSERVATIVE_REPORT,
        tags: [GHL_TAG.ANALYZER_SUBMITTED, GHL_TAG.QUALIFIED, GHL_TAG.CONSERVATIVE_PDF_READY],
        shouldSyncGhl: true,
      };
    }
  }

  // PDF failed: error, skipped, or complete without a confirmed URL
  if (pdfStatus === 'error' || pdfStatus === 'skipped' || pdfStatus === 'complete') {
    return {
      leadStatus: LEAD_STATUS.PDF_FAILED,
      communicationRoute: COMMUNICATION_ROUTE.PDF_FAILURE_HOLD,
      tags: [GHL_TAG.ANALYZER_SUBMITTED, GHL_TAG.QUALIFIED, GHL_TAG.PDF_FAILED],
      shouldSyncGhl: true,
    };
  }

  // PDF not yet confirmed (null — generation not yet run or deferred)
  return {
    leadStatus: LEAD_STATUS.QUALIFIED_PDF_PENDING,
    communicationRoute: COMMUNICATION_ROUTE.NO_EMAIL_HOLD,
    tags: [],
    shouldSyncGhl: false,
  };
}
