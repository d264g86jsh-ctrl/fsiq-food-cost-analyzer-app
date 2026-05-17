import { describe, it, expect } from 'vitest';
import { buildGhlPayload } from '../crm/build-ghl-payload';
import { LEAD_STATUS, COMMUNICATION_ROUTE } from '../crm/lead-status';
import { GHL_TAG } from '../crm/ghl-tags';
import type { Submission } from '@prisma/client';

// Minimal Submission fixture — only fields used by buildGhlPayload
function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id: 'sub_test_001',
    restaurantName: "MaryAnn's Diner",
    website: 'https://maryannsdiner.com',
    zipCode: '02101',
    conceptType: 'Casual dining',
    locations: '2 – 4 locations',
    annualFoodSpend: '$1M–$3M',
    distributorType: 'National broadliners (Sysco, US Foods)',
    procurementStrategy: 'Market price, single distributor',
    topSkus: 'beef, chicken, seafood',
    fullName: 'Mary Ann Petronella',
    email: 'mary@maryannsdiner.com',
    phone: '6175550100',
    utmSource: 'google',
    utmMedium: 'cpc',
    utmCampaign: null,
    utmContent: null,
    utmTerm: null,
    ipAddress: '1.2.3.4',
    websiteValidationResult: null,
    finalDecision: 'verified_restaurant' as Submission['finalDecision'],
    countryEligibility: 'us_verified' as Submission['countryEligibility'],
    locationConfidenceScore: 95,
    internalFlags: null,
    manualReviewRequired: false,
    qualified: true,
    dqReason: null,
    spendBucket: '$1M–$3M',
    bucketMidpoint: 2_000_000,
    finalPct: 7.35,
    dollarEstimate: 147_000,
    caseStudy: "MaryAnn's Diner",
    year1: 147_000,
    year2: 152_733,
    year3: 158_689,
    year4: 164_877,
    year5: 171_307,
    projectionHeights: null,
    logoUrl: 'https://maryannsdiner.com/logo.png',
    businessSummary: 'A classic diner.',
    conceptSignals: null,
    narrativeDistributor: 'Narrative about distributors.',
    narrativeProcurement: 'Narrative about procurement.',
    narrativeSku: 'Narrative about SKUs.',
    pdfMode: 'full' as Submission['pdfMode'],
    pdfStatus: 'complete' as Submission['pdfStatus'],
    pdfMonkeyDocumentId: 'doc_abc',
    pdfDownloadUrl: 'https://cdn.pdfmonkey.io/report.pdf',
    pdfError: null,
    pdfRetryCount: 0,
    emailStatus: null,
    emailVariant: null,
    emailSentAt: null,
    emailError: null,
    emailRetryCount: 0,
    metaStatus: null,
    metaEventIds: null,
    metaError: null,
    crmSyncStatus: null,
    ghlContactId: null,
    crmSyncError: null,
    crmSyncRetryCount: 0,
    crmTags: null,
    manualReviewStatus: 'not_required' as Submission['manualReviewStatus'],
    manualReviewNotes: null,
    manualReviewedAt: null,
    workflowStage: 'complete',
    workflowStatus: 'complete' as Submission['workflowStatus'],
    workflowErrors: null,
    createdAt: new Date('2026-05-16T00:00:00Z'),
    updatedAt: new Date('2026-05-16T00:05:00Z'),
    ...overrides,
  };
}

describe('buildGhlPayload — identity fields', () => {
  it('maps submission ID, contact, and restaurant profile', () => {
    const s = makeSubmission();
    const p = buildGhlPayload(s, LEAD_STATUS.QUALIFIED_FULL_PDF_READY, COMMUNICATION_ROUTE.SEND_FULL_REPORT, [GHL_TAG.QUALIFIED, GHL_TAG.FULL_PDF_READY]);

    expect(p.fsiq_submission_id).toBe('sub_test_001');
    expect(p.fsiq_full_name).toBe('Mary Ann Petronella');
    expect(p.fsiq_email).toBe('mary@maryannsdiner.com');
    expect(p.fsiq_phone).toBe('6175550100');
    expect(p.fsiq_restaurant_name).toBe("MaryAnn's Diner");
    expect(p.fsiq_website).toBe('https://maryannsdiner.com');
    expect(p.fsiq_zip_code).toBe('02101');
  });
});

describe('buildGhlPayload — qualification fields', () => {
  it('formats dollar estimate and percentage for qualified lead', () => {
    const p = buildGhlPayload(makeSubmission(), LEAD_STATUS.QUALIFIED_FULL_PDF_READY, COMMUNICATION_ROUTE.SEND_FULL_REPORT, []);
    expect(p.fsiq_estimated_savings).toBe('$147,000');
    expect(p.fsiq_final_pct).toBe('7.4%');
    expect(p.fsiq_spend_bucket).toBe('$1M–$3M');
    expect(p.fsiq_qualified).toBe(true);
  });

  it('savings fields empty string for DQ lead', () => {
    const s = makeSubmission({ qualified: false, dollarEstimate: null, finalPct: null, spendBucket: null, dqReason: 'below_threshold' as Submission['dqReason'] });
    const p = buildGhlPayload(s, LEAD_STATUS.DISQUALIFIED_BELOW_THRESHOLD, COMMUNICATION_ROUTE.SEND_DQ_BELOW_THRESHOLD, [GHL_TAG.DQ_BELOW_THRESHOLD]);
    expect(p.fsiq_estimated_savings).toBe('');
    expect(p.fsiq_final_pct).toBe('');
    expect(p.fsiq_qualified).toBe(false);
    expect(p.fsiq_dq_reason).toBe('below_threshold');
  });
});

describe('buildGhlPayload — PDF fields', () => {
  it('includes PDF URL and sets pdfReadyAt when complete', () => {
    const s = makeSubmission();
    const p = buildGhlPayload(s, LEAD_STATUS.QUALIFIED_FULL_PDF_READY, COMMUNICATION_ROUTE.SEND_FULL_REPORT, []);
    expect(p.fsiq_pdf_url).toBe('https://cdn.pdfmonkey.io/report.pdf');
    expect(p.fsiq_pdf_ready_at).toBe(s.updatedAt.toISOString());
    expect(p.fsiq_pdf_mode).toBe('full');
  });

  it('PDF URL null and pdfReadyAt null when no download URL', () => {
    const s = makeSubmission({ pdfDownloadUrl: null, pdfStatus: 'error' as Submission['pdfStatus'] });
    const p = buildGhlPayload(s, LEAD_STATUS.PDF_FAILED, COMMUNICATION_ROUTE.PDF_FAILURE_HOLD, []);
    expect(p.fsiq_pdf_url).toBeNull();
    expect(p.fsiq_pdf_ready_at).toBeNull();
  });
});

describe('buildGhlPayload — tags and routing', () => {
  it('includes tags array from assignLeadStatus', () => {
    const tags = [GHL_TAG.ANALYZER_SUBMITTED, GHL_TAG.QUALIFIED, GHL_TAG.FULL_PDF_READY];
    const p = buildGhlPayload(makeSubmission(), LEAD_STATUS.QUALIFIED_FULL_PDF_READY, COMMUNICATION_ROUTE.SEND_FULL_REPORT, tags);
    expect(p.tags).toEqual(tags);
  });

  it('maps lead status and communication route', () => {
    const p = buildGhlPayload(makeSubmission(), LEAD_STATUS.DISQUALIFIED_NATIONAL_CHAIN, COMMUNICATION_ROUTE.SEND_DQ_NATIONAL_CHAIN, []);
    expect(p.fsiq_lead_status).toBe('disqualified_national_chain');
    expect(p.fsiq_communication_route).toBe('send_dq_national_chain');
  });
});
