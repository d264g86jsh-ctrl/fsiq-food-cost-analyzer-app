// Phase 7 — Lead status and communication route constants.
// Source of truth: docs/ghl-email-handoff.md
//
// These values are written to fsiq_lead_status and fsiq_communication_route in GHL.
// GHL/Zapier automation is triggered by these fields — do not rename without updating GHL.

// ── Lead status ───────────────────────────────────────────────────────────────

export const LEAD_STATUS = {
  // Qualified — PDF in progress, pdfDownloadUrl not yet confirmed.
  // GHL sync is deferred until URL is confirmed. Do not use PDF-ready tags.
  QUALIFIED_PDF_PENDING:             'qualified_pdf_pending',

  // Qualified — PDF generated and pdfDownloadUrl confirmed. Safe to sync to GHL.
  QUALIFIED_FULL_PDF_READY:          'qualified_full_pdf_ready',
  QUALIFIED_CONSERVATIVE_PDF_READY:  'qualified_conservative_pdf_ready',

  // Disqualified — each has a distinct GHL automation route
  DISQUALIFIED_INVALID_WEBSITE:      'disqualified_invalid_website',
  DISQUALIFIED_BELOW_THRESHOLD:      'disqualified_below_threshold',
  DISQUALIFIED_NATIONAL_CHAIN:       'disqualified_national_chain',
  DISQUALIFIED_CLEAR_NON_FIT:        'disqualified_clear_non_fit',
  DISQUALIFIED_NON_US:               'disqualified_non_us', // kept separate — distinct GHL messaging

  // Hold states — no email automation fires
  MANUAL_REVIEW_REQUIRED:            'manual_review_required',
  PDF_FAILED:                        'pdf_failed',
  WORKFLOW_FAILED:                   'workflow_failed',
} as const;

export type LeadStatus = (typeof LEAD_STATUS)[keyof typeof LEAD_STATUS];

// ── Communication route ───────────────────────────────────────────────────────

export const COMMUNICATION_ROUTE = {
  // Report routes — GHL/Zapier sends report email only when fsiq_pdf_url is also present
  SEND_FULL_REPORT:           'send_full_report',
  SEND_CONSERVATIVE_REPORT:   'send_conservative_report',

  // DQ routes — no PDF URL required
  SEND_DQ_INVALID_WEBSITE:    'send_dq_invalid_website',
  SEND_DQ_BELOW_THRESHOLD:    'send_dq_below_threshold',
  SEND_DQ_NATIONAL_CHAIN:     'send_dq_national_chain',
  SEND_DQ_CLEAR_NON_FIT:      'send_dq_clear_non_fit',
  SEND_DQ_NON_US:             'send_dq_non_us',

  // Hold routes — no email fires
  MANUAL_REVIEW_HOLD:         'manual_review_hold',
  PDF_FAILURE_HOLD:           'pdf_failure_hold',
  NO_EMAIL_HOLD:              'no_email_hold', // test/internal/spam-like records
} as const;

export type CommunicationRoute = (typeof COMMUNICATION_ROUTE)[keyof typeof COMMUNICATION_ROUTE];
