// Phase 7 — GHL tag constants.
// Source of truth: docs/ghl-email-handoff.md §GHL Tags
//
// Tags are applied by the app at GHL sync time.
// Do not rename without updating GHL/Zapier automation triggers.
//
// PDF-ready tags (FULL_PDF_READY, CONSERVATIVE_PDF_READY) must NEVER be applied
// until pdfDownloadUrl is non-null and confirmed.

export const GHL_TAG = {
  // Applied to every completed submission that reaches GHL sync
  ANALYZER_SUBMITTED:        'FSIQ Analyzer Submitted',

  // PDF-ready — only after pdfDownloadUrl confirmed
  FULL_PDF_READY:            'FSIQ Full PDF Ready',
  CONSERVATIVE_PDF_READY:    'FSIQ Conservative PDF Ready',

  // Qualification
  QUALIFIED:                 'FSIQ Qualified',

  // DQ outcomes
  DQ_INVALID_WEBSITE:        'FSIQ DQ Invalid Website',
  DQ_BELOW_THRESHOLD:        'FSIQ DQ Below Threshold',
  DQ_NATIONAL_CHAIN:         'FSIQ DQ National Chain',
  DQ_CLEAR_NON_FIT:          'FSIQ DQ Clear Non Fit',
  NON_US:                    'FSIQ Non US', // distinct from other clear_non_fit

  // Hold / error states
  MANUAL_REVIEW:             'FSIQ Manual Review',
  PDF_FAILED:                'FSIQ PDF Failed',
  WORKFLOW_FAILED:           'FSIQ Workflow Failed',

  // Heuristic flags (applied by Phase 8 heuristics)
  POSSIBLE_TEST_SUBMISSION:  'FSIQ Possible Test Submission',
  POSSIBLE_SPAM_SUBMISSION:  'FSIQ Possible Spam Submission',
} as const;

export type GhlTag = (typeof GHL_TAG)[keyof typeof GHL_TAG];
