import { describe, it, expect } from 'vitest';
import { assignLeadStatus, needsAiAndPdf, type AssignLeadStatusInput } from '../crm/assign-lead-status';
import { LEAD_STATUS, COMMUNICATION_ROUTE } from '../crm/lead-status';
import { GHL_TAG } from '../crm/ghl-tags';

// Base fixture — verified_restaurant, us_verified, DQ'd by default (qualified: false)
const base: AssignLeadStatusInput = {
  finalDecision:        'verified_restaurant',
  countryEligibility:   'us_verified',
  qualified:            false,
  dqReason:             null,
  pdfMode:              null,
  pdfStatus:            null,
  pdfDownloadUrl:       null,
  manualReviewRequired: false,
  workflowFailed:       false,
};

// ── needsAiAndPdf ─────────────────────────────────────────────────────────────

describe('needsAiAndPdf', () => {
  it('returns true for qualified non-clear_non_fit lead', () => {
    expect(needsAiAndPdf({ finalDecision: 'verified_restaurant', qualified: true, manualReviewRequired: false, workflowFailed: false })).toBe(true);
  });

  it('returns false for clear_non_fit regardless of qualified', () => {
    expect(needsAiAndPdf({ finalDecision: 'clear_non_fit', qualified: true,  manualReviewRequired: false, workflowFailed: false })).toBe(false);
    expect(needsAiAndPdf({ finalDecision: 'clear_non_fit', qualified: false, manualReviewRequired: false, workflowFailed: false })).toBe(false);
  });

  it('returns false for DQ lead (qualified: false)', () => {
    expect(needsAiAndPdf({ finalDecision: 'verified_restaurant', qualified: false, manualReviewRequired: false, workflowFailed: false })).toBe(false);
  });

  it('returns false when manualReviewRequired', () => {
    expect(needsAiAndPdf({ finalDecision: 'verified_restaurant', qualified: true, manualReviewRequired: true, workflowFailed: false })).toBe(false);
  });

  it('returns false when workflowFailed', () => {
    expect(needsAiAndPdf({ finalDecision: 'verified_restaurant', qualified: true, manualReviewRequired: false, workflowFailed: true })).toBe(false);
  });
});

// ── assignLeadStatus — workflow failed ────────────────────────────────────────

describe('assignLeadStatus — workflow failed', () => {
  it('returns workflow_failed and no_email_hold', () => {
    const r = assignLeadStatus({ ...base, workflowFailed: true });
    expect(r.leadStatus).toBe(LEAD_STATUS.WORKFLOW_FAILED);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.NO_EMAIL_HOLD);
    expect(r.tags).toContain(GHL_TAG.WORKFLOW_FAILED);
    expect(r.shouldSyncGhl).toBe(true);
  });

  it('workflow_failed overrides manual_review', () => {
    const r = assignLeadStatus({ ...base, workflowFailed: true, manualReviewRequired: true });
    expect(r.leadStatus).toBe(LEAD_STATUS.WORKFLOW_FAILED);
  });
});

// ── assignLeadStatus — manual review ─────────────────────────────────────────

describe('assignLeadStatus — manual review', () => {
  it('returns manual_review_required with hold route', () => {
    const r = assignLeadStatus({ ...base, manualReviewRequired: true });
    expect(r.leadStatus).toBe(LEAD_STATUS.MANUAL_REVIEW_REQUIRED);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.MANUAL_REVIEW_HOLD);
    expect(r.tags).toContain(GHL_TAG.MANUAL_REVIEW);
    expect(r.tags).toContain(GHL_TAG.ANALYZER_SUBMITTED);
    expect(r.shouldSyncGhl).toBe(true);
  });
});

// ── assignLeadStatus — clear_non_fit (Priority 3, finalDecision-based) ────────

describe('assignLeadStatus — clear_non_fit via finalDecision', () => {
  it('clear_non_fit + non_us → disqualified_non_us (primary routing path)', () => {
    const r = assignLeadStatus({
      ...base,
      finalDecision:      'clear_non_fit',
      countryEligibility: 'non_us',
      qualified:          false,
      dqReason:           null,
    });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_NON_US);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.SEND_DQ_NON_US);
    expect(r.tags).toContain(GHL_TAG.NON_US);
    expect(r.shouldSyncGhl).toBe(true);
  });

  it('clear_non_fit + us_verified → disqualified_clear_non_fit', () => {
    const r = assignLeadStatus({
      ...base,
      finalDecision:      'clear_non_fit',
      countryEligibility: 'us_verified',
      qualified:          false,
      dqReason:           null,
    });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_CLEAR_NON_FIT);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.SEND_DQ_CLEAR_NON_FIT);
    expect(r.tags).toContain(GHL_TAG.DQ_CLEAR_NON_FIT);
  });

  it('clear_non_fit + unknown countryEligibility → disqualified_clear_non_fit', () => {
    const r = assignLeadStatus({
      ...base,
      finalDecision:      'clear_non_fit',
      countryEligibility: 'unknown',
    });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_CLEAR_NON_FIT);
  });

  // This is the key case: spend qualifies ($1M+) but website is clear_non_fit.
  // The routing layer must DQ the lead without relying on the qualification engine.
  it('clear_non_fit + qualified=true (spend qualifies) → disqualified_clear_non_fit, no AI/PDF', () => {
    const r = assignLeadStatus({
      ...base,
      finalDecision:      'clear_non_fit',
      countryEligibility: 'us_verified',
      qualified:          true,   // qualification engine returned qualified=true for spend
      dqReason:           null,
    });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_CLEAR_NON_FIT);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.SEND_DQ_CLEAR_NON_FIT);
    expect(r.shouldSyncGhl).toBe(true);
    // Must NOT route to any PDF-ready status
    expect(r.leadStatus).not.toContain('pdf_ready');
  });

  it('clear_non_fit + qualified=true + non_us → disqualified_non_us', () => {
    const r = assignLeadStatus({
      ...base,
      finalDecision:      'clear_non_fit',
      countryEligibility: 'non_us',
      qualified:          true,   // spend qualifies but non_us overrides
      dqReason:           null,
    });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_NON_US);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.SEND_DQ_NON_US);
  });
});

// ── assignLeadStatus — disqualified paths (engine DQ reasons) ─────────────────

describe('assignLeadStatus — disqualified paths', () => {
  it('national_chain', () => {
    const r = assignLeadStatus({ ...base, dqReason: 'national_chain' });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_NATIONAL_CHAIN);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.SEND_DQ_NATIONAL_CHAIN);
    expect(r.tags).toContain(GHL_TAG.DQ_NATIONAL_CHAIN);
    expect(r.shouldSyncGhl).toBe(true);
  });

  it('invalid_website', () => {
    const r = assignLeadStatus({ ...base, dqReason: 'invalid_website' });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_INVALID_WEBSITE);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.SEND_DQ_INVALID_WEBSITE);
    expect(r.tags).toContain(GHL_TAG.DQ_INVALID_WEBSITE);
  });

  it('below_threshold', () => {
    const r = assignLeadStatus({ ...base, dqReason: 'below_threshold' });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_BELOW_THRESHOLD);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.SEND_DQ_BELOW_THRESHOLD);
  });

  it('below_minimum maps to below_threshold route', () => {
    const r = assignLeadStatus({ ...base, dqReason: 'below_minimum' });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_BELOW_THRESHOLD);
  });

  it('clear_non_fit via dqReason (defense-in-depth) + non_us → disqualified_non_us', () => {
    const r = assignLeadStatus({ ...base, dqReason: 'clear_non_fit', countryEligibility: 'non_us' });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_NON_US);
  });

  it('clear_non_fit via dqReason + us_verified → disqualified_clear_non_fit', () => {
    const r = assignLeadStatus({ ...base, dqReason: 'clear_non_fit', countryEligibility: 'us_verified' });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_CLEAR_NON_FIT);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.SEND_DQ_CLEAR_NON_FIT);
  });

  it('null dqReason falls back to clear_non_fit route', () => {
    const r = assignLeadStatus({ ...base, dqReason: null });
    expect(r.leadStatus).toBe(LEAD_STATUS.DISQUALIFIED_CLEAR_NON_FIT);
  });
});

// ── assignLeadStatus — qualified paths ────────────────────────────────────────

describe('assignLeadStatus — qualified paths', () => {
  const qualified: AssignLeadStatusInput = {
    ...base,
    finalDecision: 'verified_restaurant',
    qualified:     true,
    dqReason:      null,
  };

  it('full PDF ready — complete + url + full mode', () => {
    const r = assignLeadStatus({
      ...qualified,
      pdfMode:       'full',
      pdfStatus:     'complete',
      pdfDownloadUrl: 'https://cdn.pdfmonkey.io/report.pdf',
    });
    expect(r.leadStatus).toBe(LEAD_STATUS.QUALIFIED_FULL_PDF_READY);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.SEND_FULL_REPORT);
    expect(r.tags).toContain(GHL_TAG.FULL_PDF_READY);
    expect(r.tags).toContain(GHL_TAG.QUALIFIED);
    expect(r.shouldSyncGhl).toBe(true);
  });

  it('conservative PDF ready — complete + url + conservative mode', () => {
    const r = assignLeadStatus({
      ...qualified,
      pdfMode:       'conservative',
      pdfStatus:     'complete',
      pdfDownloadUrl: 'https://cdn.pdfmonkey.io/report.pdf',
    });
    expect(r.leadStatus).toBe(LEAD_STATUS.QUALIFIED_CONSERVATIVE_PDF_READY);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.SEND_CONSERVATIVE_REPORT);
    expect(r.tags).toContain(GHL_TAG.CONSERVATIVE_PDF_READY);
  });

  it('PDF complete but URL null → pdf_failed (URL gate)', () => {
    const r = assignLeadStatus({
      ...qualified,
      pdfMode:       'full',
      pdfStatus:     'complete',
      pdfDownloadUrl: null,
    });
    expect(r.leadStatus).toBe(LEAD_STATUS.PDF_FAILED);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.PDF_FAILURE_HOLD);
    expect(r.tags).not.toContain(GHL_TAG.FULL_PDF_READY);
    expect(r.shouldSyncGhl).toBe(true);
  });

  it('PDF error → pdf_failed with hold route', () => {
    const r = assignLeadStatus({ ...qualified, pdfStatus: 'error' });
    expect(r.leadStatus).toBe(LEAD_STATUS.PDF_FAILED);
    expect(r.communicationRoute).toBe(COMMUNICATION_ROUTE.PDF_FAILURE_HOLD);
    expect(r.tags).toContain(GHL_TAG.PDF_FAILED);
    expect(r.shouldSyncGhl).toBe(true);
  });

  it('PDF skipped (missing credentials) → pdf_failed', () => {
    const r = assignLeadStatus({ ...qualified, pdfStatus: 'skipped' });
    expect(r.leadStatus).toBe(LEAD_STATUS.PDF_FAILED);
  });

  it('PDF null (not yet run) → qualified_pdf_pending, no GHL sync', () => {
    const r = assignLeadStatus({ ...qualified, pdfStatus: null });
    expect(r.leadStatus).toBe(LEAD_STATUS.QUALIFIED_PDF_PENDING);
    expect(r.shouldSyncGhl).toBe(false);
    expect(r.tags).toHaveLength(0);
  });
});
