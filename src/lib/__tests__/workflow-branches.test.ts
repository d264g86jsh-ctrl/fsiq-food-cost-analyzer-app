// End-to-end workflow branch tests.
// Verifies that each submission path routes to the correct lead status,
// communication route, GHL tags, and AI/PDF gate decision.
//
// Branches covered:
//   1. Qualified → full PDF ready
//   2. Qualified → conservative PDF ready
//   3. Qualified → PDF failed (error)
//   4. Qualified → PDF failed (skipped)
//   5. Qualified → PDF pending (preliminary)
//   6. DQ: national_chain
//   7. DQ: invalid_website
//   8. DQ: below_threshold
//   9. DQ: clear_non_fit (non-chain)
//  10. DQ: clear_non_fit → non_us
//  11. Manual review hold
//  12. Workflow failed

import { describe, it, expect } from 'vitest';
import { assignLeadStatus, needsAiAndPdf } from '../crm/assign-lead-status';
import { LEAD_STATUS, COMMUNICATION_ROUTE } from '../crm/lead-status';
import { GHL_TAG } from '../crm/ghl-tags';
import type { AssignLeadStatusInput } from '../crm/assign-lead-status';

// ── Shared base fixture ───────────────────────────────────────────────────────

const qualifiedBase: AssignLeadStatusInput = {
  finalDecision:        'verified_restaurant',
  countryEligibility:   'us_verified',
  qualified:            true,
  dqReason:             null,
  pdfMode:              null,
  pdfStatus:            null,
  pdfDownloadUrl:       null,
  manualReviewRequired: false,
  workflowFailed:       false,
};

const dqBase: AssignLeadStatusInput = {
  ...qualifiedBase,
  qualified: false,
};

// ── Branch 1: Qualified → full PDF ready ─────────────────────────────────────

describe('Branch 1: qualified → full PDF ready', () => {
  const input: AssignLeadStatusInput = {
    ...qualifiedBase,
    pdfMode:      'full',
    pdfStatus:    'complete',
    pdfDownloadUrl: 'https://cdn.pdfmonkey.io/documents/abc123/report.pdf',
  };

  it('needsAiAndPdf returns true', () => {
    expect(needsAiAndPdf({ finalDecision: input.finalDecision, qualified: true, manualReviewRequired: false, workflowFailed: false })).toBe(true);
  });

  it('routes to QUALIFIED_FULL_PDF_READY', () => {
    const r = assignLeadStatus(input);
    expect(r.leadStatus).toBe(LEAD_STATUS.QUALIFIED_FULL_PDF_READY);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.SEND_FULL_REPORT);
    expect(r.shouldSyncGhl).toBe(true);
    expect(r.tags).toContain(GHL_TAG.ANALYZER_SUBMITTED);
    expect(r.tags).toContain(GHL_TAG.QUALIFIED);
    expect(r.tags).toContain(GHL_TAG.FULL_PDF_READY);
    expect(r.tags).not.toContain(GHL_TAG.PDF_FAILED);
  });
});

// ── Branch 2: Qualified → conservative PDF ready ─────────────────────────────

describe('Branch 2: qualified → conservative PDF ready', () => {
  const input: AssignLeadStatusInput = {
    ...qualifiedBase,
    finalDecision:  'plausible_unverified',
    pdfMode:        'conservative',
    pdfStatus:      'complete',
    pdfDownloadUrl: 'https://cdn.pdfmonkey.io/documents/def456/report.pdf',
  };

  it('needsAiAndPdf returns true for plausible_unverified qualified', () => {
    expect(needsAiAndPdf({ finalDecision: 'plausible_unverified', qualified: true, manualReviewRequired: false, workflowFailed: false })).toBe(true);
  });

  it('routes to QUALIFIED_CONSERVATIVE_PDF_READY', () => {
    const r = assignLeadStatus(input);
    expect(r.leadStatus).toBe(LEAD_STATUS.QUALIFIED_CONSERVATIVE_PDF_READY);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.SEND_CONSERVATIVE_REPORT);
    expect(r.shouldSyncGhl).toBe(true);
    expect(r.tags).toContain(GHL_TAG.ANALYZER_SUBMITTED);
    expect(r.tags).toContain(GHL_TAG.QUALIFIED);
    expect(r.tags).toContain(GHL_TAG.CONSERVATIVE_PDF_READY);
    expect(r.tags).not.toContain(GHL_TAG.PDF_FAILED);
  });
});

// ── Branch 3: Qualified → PDF failed (error) ─────────────────────────────────

describe('Branch 3: qualified → PDF error', () => {
  const input: AssignLeadStatusInput = {
    ...qualifiedBase,
    pdfMode:        'full',
    pdfStatus:      'error',
    pdfDownloadUrl: null,
  };

  it('routes to PDF_FAILED with pdf_failure_hold', () => {
    const r = assignLeadStatus(input);
    expect(r.leadStatus).toBe(LEAD_STATUS.PDF_FAILED);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.PDF_FAILURE_HOLD);
    expect(r.tags).toContain(GHL_TAG.ANALYZER_SUBMITTED);
    expect(r.tags).toContain(GHL_TAG.QUALIFIED);
    expect(r.tags).toContain(GHL_TAG.PDF_FAILED);
    expect(r.tags).not.toContain(GHL_TAG.FULL_PDF_READY);
  });
});

// ── Branch 4: Qualified → PDF skipped ────────────────────────────────────────

describe('Branch 4: qualified → PDF skipped', () => {
  const input: AssignLeadStatusInput = {
    ...qualifiedBase,
    pdfMode:        null,
    pdfStatus:      'skipped',
    pdfDownloadUrl: null,
  };

  it('routes to PDF_FAILED with pdf_failure_hold', () => {
    const r = assignLeadStatus(input);
    expect(r.leadStatus).toBe(LEAD_STATUS.PDF_FAILED);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.PDF_FAILURE_HOLD);
    expect(r.tags).toContain(GHL_TAG.PDF_FAILED);
    expect(r.tags).not.toContain(GHL_TAG.FULL_PDF_READY);
    expect(r.tags).not.toContain(GHL_TAG.CONSERVATIVE_PDF_READY);
  });
});

// ── Branch 5: Qualified → PDF pending (preliminary state) ────────────────────

describe('Branch 5: qualified → PDF pending', () => {
  it('routes to QUALIFIED_PDF_PENDING with no_email_hold and no PDF_FAILED tag', () => {
    const r = assignLeadStatus({ ...qualifiedBase });
    expect(r.leadStatus).toBe(LEAD_STATUS.QUALIFIED_PDF_PENDING);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.NO_EMAIL_HOLD);
    expect(r.tags).toContain(GHL_TAG.ANALYZER_SUBMITTED);
    expect(r.tags).toContain(GHL_TAG.QUALIFIED);
    expect(r.tags).not.toContain(GHL_TAG.PDF_FAILED);
    expect(r.tags).not.toContain(GHL_TAG.FULL_PDF_READY);
    expect(r.tags).not.toContain(GHL_TAG.CONSERVATIVE_PDF_READY);
  });
});

// ── Branch 6: DQ — national_chain ────────────────────────────────────────────

describe('Branch 6: DQ → national_chain', () => {
  it('needsAiAndPdf returns false', () => {
    expect(needsAiAndPdf({ finalDecision: 'national_chain', qualified: false, manualReviewRequired: false, workflowFailed: false })).toBe(false);
  });

  it('routes to DISQUALIFIED_NATIONAL_CHAIN', () => {
    const r = assignLeadStatus({ ...dqBase, finalDecision: 'national_chain', dqReason: 'national_chain' });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_NATIONAL_CHAIN);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.SEND_DQ_NATIONAL_CHAIN);
    expect(r.shouldSyncGhl).toBe(true);
    expect(r.tags).toContain(GHL_TAG.ANALYZER_SUBMITTED);
    expect(r.tags).toContain(GHL_TAG.DQ_NATIONAL_CHAIN);
    expect(r.tags).not.toContain(GHL_TAG.QUALIFIED);
  });
});

// ── Branch 7: DQ — invalid_website ───────────────────────────────────────────

describe('Branch 7: DQ → invalid_website', () => {
  it('needsAiAndPdf returns false', () => {
    expect(needsAiAndPdf({ finalDecision: 'invalid_website', qualified: false, manualReviewRequired: false, workflowFailed: false })).toBe(false);
  });

  it('routes to DISQUALIFIED_INVALID_WEBSITE', () => {
    const r = assignLeadStatus({ ...dqBase, finalDecision: 'invalid_website', dqReason: 'invalid_website' });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_INVALID_WEBSITE);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.SEND_DQ_INVALID_WEBSITE);
    expect(r.tags).toContain(GHL_TAG.DQ_INVALID_WEBSITE);
    expect(r.tags).not.toContain(GHL_TAG.QUALIFIED);
  });
});

// ── Branch 8: DQ — below_threshold ───────────────────────────────────────────

describe('Branch 8: DQ → below_threshold', () => {
  it('routes to DISQUALIFIED_BELOW_THRESHOLD', () => {
    const r = assignLeadStatus({ ...dqBase, dqReason: 'below_threshold' });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_BELOW_THRESHOLD);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.SEND_DQ_BELOW_THRESHOLD);
    expect(r.tags).toContain(GHL_TAG.DQ_BELOW_THRESHOLD);
    expect(r.tags).not.toContain(GHL_TAG.QUALIFIED);
  });

  it('below_minimum also maps to below_threshold', () => {
    const r = assignLeadStatus({ ...dqBase, dqReason: 'below_minimum' });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_BELOW_THRESHOLD);
  });
});

// ── Branch 9: DQ — clear_non_fit ─────────────────────────────────────────────

describe('Branch 9: DQ → clear_non_fit', () => {
  it('needsAiAndPdf returns false for clear_non_fit even when qualified=true', () => {
    expect(needsAiAndPdf({ finalDecision: 'clear_non_fit', qualified: true, manualReviewRequired: false, workflowFailed: false })).toBe(false);
  });

  it('routes to DISQUALIFIED_CLEAR_NON_FIT for non-US-detected clear_non_fit', () => {
    const r = assignLeadStatus({ ...dqBase, finalDecision: 'clear_non_fit', countryEligibility: 'likely_us' });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_CLEAR_NON_FIT);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.SEND_DQ_CLEAR_NON_FIT);
    expect(r.tags).toContain(GHL_TAG.DQ_CLEAR_NON_FIT);
  });

  it('qualified=true lead with clear_non_fit routes DQ, not PDF pipeline', () => {
    const r = assignLeadStatus({ ...qualifiedBase, finalDecision: 'clear_non_fit' });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_CLEAR_NON_FIT);
    expect(r.tags).not.toContain(GHL_TAG.QUALIFIED);
    expect(r.tags).not.toContain(GHL_TAG.FULL_PDF_READY);
  });
});

// ── Branch 10: DQ — clear_non_fit + non_us ───────────────────────────────────

describe('Branch 10: DQ → clear_non_fit + non_us', () => {
  it('routes to DISQUALIFIED_NON_US', () => {
    const r = assignLeadStatus({ ...dqBase, finalDecision: 'clear_non_fit', countryEligibility: 'non_us' });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_NON_US);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.SEND_DQ_NON_US);
    expect(r.tags).toContain(GHL_TAG.NON_US);
    expect(r.tags).not.toContain(GHL_TAG.DQ_CLEAR_NON_FIT);
  });
});

// ── Branch 11: Manual review hold ────────────────────────────────────────────

describe('Branch 11: manual review hold', () => {
  it('needsAiAndPdf returns false when manualReviewRequired', () => {
    expect(needsAiAndPdf({ finalDecision: 'plausible_unverified', qualified: true, manualReviewRequired: true, workflowFailed: false })).toBe(false);
  });

  it('routes to MANUAL_REVIEW_REQUIRED with manual_review_hold', () => {
    const r = assignLeadStatus({ ...qualifiedBase, manualReviewRequired: true });
    expect(r.leadStatus).toBe(LEAD_STATUS.MANUAL_REVIEW_REQUIRED);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.MANUAL_REVIEW_HOLD);
    expect(r.shouldSyncGhl).toBe(true);
    expect(r.tags).toContain(GHL_TAG.ANALYZER_SUBMITTED);
    expect(r.tags).toContain(GHL_TAG.MANUAL_REVIEW);
    expect(r.tags).not.toContain(GHL_TAG.QUALIFIED);
    expect(r.tags).not.toContain(GHL_TAG.PDF_FAILED);
  });
});

// ── Branch 12: Workflow failed ────────────────────────────────────────────────

describe('Branch 12: workflow failed', () => {
  it('needsAiAndPdf returns false', () => {
    expect(needsAiAndPdf({ finalDecision: 'verified_restaurant', qualified: true, manualReviewRequired: false, workflowFailed: true })).toBe(false);
  });

  it('routes to WORKFLOW_FAILED overriding everything else', () => {
    const r = assignLeadStatus({ ...qualifiedBase, workflowFailed: true });
    expect(r.leadStatus).toBe(LEAD_STATUS.WORKFLOW_FAILED);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.NO_EMAIL_HOLD);
    expect(r.tags).toContain(GHL_TAG.WORKFLOW_FAILED);
    expect(r.tags).not.toContain(GHL_TAG.QUALIFIED);
  });

  it('workflow_failed overrides even PDF-ready state', () => {
    const r = assignLeadStatus({ ...qualifiedBase, pdfMode: 'full', pdfStatus: 'complete', pdfDownloadUrl: 'https://example.com', workflowFailed: true });
    expect(r.leadStatus).toBe(LEAD_STATUS.WORKFLOW_FAILED);
    expect(r.tags).not.toContain(GHL_TAG.FULL_PDF_READY);
  });
});
