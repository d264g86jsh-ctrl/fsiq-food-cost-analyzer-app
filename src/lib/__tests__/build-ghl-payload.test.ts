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
    fbclid: null,
    leadSource: 'google',
    fbp: null,
    fbc: null,
    landingPageUrl: null,
    utmId: null,
    fbadid: null,
    referrer: null,
    phoneRaw: null,
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
    logoProcessedDataUri: null,
    businessSummary: 'A classic diner.',
    conceptSignals: null,
    narrativeDistributor: 'Narrative about distributors.',
    narrativeProcurement: 'Narrative about procurement.',
    narrativeSku: 'Narrative about SKUs.',
    pdfMode: 'full' as Submission['pdfMode'],
    pdfStatus: 'complete' as Submission['pdfStatus'],
    pdfMonkeyDocumentId: 'doc_abc',
    pdfDownloadUrl: 'https://cdn.pdfmonkey.io/report.pdf',
    pdfUrlType: 'download',
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
    pdfCachedUrl: null,
    pdfCachedAt: null,
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
    expect(p.fsiq_pdf_url).toBe('/report/sub_test_001');
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

describe('buildGhlPayload — phone_raw field', () => {
  // ── in-memory path (submitAnalysis — param wins) ───────────────────────────

  it('garbage phone → native null, raw carries garbage so sales can see it', () => {
    const p = buildGhlPayload(
      makeSubmission({ phone: null }),
      LEAD_STATUS.QUALIFIED_FULL_PDF_READY, COMMUNICATION_ROUTE.SEND_FULL_REPORT, [],
      'not a phone number',
    );
    expect(p.fsiq_phone).toBeNull();
    expect(p.fsiq_phone_raw).toBe('not a phone number');
  });

  it('valid phone → native set, raw carries original formatted value', () => {
    const p = buildGhlPayload(
      makeSubmission({ phone: '5551234567' }),
      LEAD_STATUS.QUALIFIED_FULL_PDF_READY, COMMUNICATION_ROUTE.SEND_FULL_REPORT, [],
      '(555) 123-4567',
    );
    expect(p.fsiq_phone).toBe('5551234567');
    expect(p.fsiq_phone_raw).toBe('(555) 123-4567');
  });

  // ── DB-rebuild path (admin retry — falls back to submission.phoneRaw) ──────

  it('retry-style call (no param) → falls back to submission.phoneRaw column', () => {
    const p = buildGhlPayload(
      makeSubmission({ phone: '5551234567', phoneRaw: '(555) 123-4567' }),
      LEAD_STATUS.QUALIFIED_FULL_PDF_READY, COMMUNICATION_ROUTE.SEND_FULL_REPORT,
      [],
      // rawPhone param omitted → defaults to null → fallback reads phoneRaw column
    );
    expect(p.fsiq_phone_raw).toBe('(555) 123-4567');
  });

  it('param wins over column when both are provided (in-memory beats DB)', () => {
    const p = buildGhlPayload(
      makeSubmission({ phoneRaw: 'column-value' }),
      LEAD_STATUS.QUALIFIED_FULL_PDF_READY, COMMUNICATION_ROUTE.SEND_FULL_REPORT, [],
      'param-value',   // explicit param
    );
    expect(p.fsiq_phone_raw).toBe('param-value');
  });

  it('both null → fsiq_phone_raw null', () => {
    const p = buildGhlPayload(
      makeSubmission({ phoneRaw: null }),
      LEAD_STATUS.QUALIFIED_FULL_PDF_READY, COMMUNICATION_ROUTE.SEND_FULL_REPORT, [],
      null,
    );
    expect(p.fsiq_phone_raw).toBeNull();
  });

  it('garbage-phone retry: phone=null + phoneRaw="not a phone number" → native omitted AND raw preserved', () => {
    const p = buildGhlPayload(
      makeSubmission({ phone: null, phoneRaw: 'not a phone number' }),
      LEAD_STATUS.QUALIFIED_FULL_PDF_READY, COMMUNICATION_ROUTE.SEND_FULL_REPORT,
      [],
    );
    expect(p.fsiq_phone).toBeNull();             // native phone omitted (normalization returned null)
    expect(p.fsiq_phone_raw).toBe('not a phone number');  // raw preserved from column
  });
});

describe('buildGhlPayload — attribution fields', () => {
  it('includes lead_source and utm_source', () => {
    const p = buildGhlPayload(makeSubmission(), LEAD_STATUS.QUALIFIED_FULL_PDF_READY, COMMUNICATION_ROUTE.SEND_FULL_REPORT, []);
    expect(p.fsiq_lead_source).toBe('google');
    expect(p.fsiq_utm_source).toBe('google');
  });

  it('lead_source null when not set on submission', () => {
    const s = makeSubmission({ leadSource: null, utmSource: null });
    const p = buildGhlPayload(s, LEAD_STATUS.QUALIFIED_FULL_PDF_READY, COMMUNICATION_ROUTE.SEND_FULL_REPORT, []);
    expect(p.fsiq_lead_source).toBeNull();
    expect(p.fsiq_utm_source).toBeNull();
  });

  it('passes meta lead_source through', () => {
    const s = makeSubmission({ leadSource: 'meta', utmSource: 'facebook', fbclid: 'abc123' });
    const p = buildGhlPayload(s, LEAD_STATUS.QUALIFIED_FULL_PDF_READY, COMMUNICATION_ROUTE.SEND_FULL_REPORT, []);
    expect(p.fsiq_lead_source).toBe('meta');
    expect(p.fsiq_utm_source).toBe('facebook');
  });

  it('maps all extended attribution fields', () => {
    const s = makeSubmission({
      leadSource:    'meta',
      utmSource:     'facebook',
      utmMedium:     'FSIQ | ABO_Prospecting | Leads',
      utmCampaign:   'FSIQ-VIDEO-AD-35 | A Dollar Saved is a Dollar Earned | iPhone | Broad | LP2-EB',
      utmContent:    'FSIQ-VIDEO-AD-28 | 117 | Podcast Ad Blurred Book | No Book | Direct Offer / Gift | Solution Aware | LP2-EB | COPY-02 | 60s+',
      utmTerm:       '120246189234780546',
      utmId:         '120229729801330546',
      fbadid:        '120246189234770546',
      fbclid:        'IwY2xjawSWmELxyztest',
      referrer:      'https://facebook.com/',
      landingPageUrl: 'https://go.getfoodserviceiq.com/5provenways?utm_source=facebook&fbclid=IwY2xjawSWmELxyztest',
    });
    const p = buildGhlPayload(s, LEAD_STATUS.QUALIFIED_FULL_PDF_READY, COMMUNICATION_ROUTE.SEND_FULL_REPORT, []);
    expect(p.fsiq_utm_medium).toBe('FSIQ | ABO_Prospecting | Leads');
    expect(p.fsiq_utm_campaign).toContain('A Dollar Saved');
    expect(p.fsiq_utm_content).toContain('60s+');
    expect(p.fsiq_utm_term).toBe('120246189234780546');
    expect(p.fsiq_utm_id).toBe('120229729801330546');
    expect(p.fsiq_fbadid).toBe('120246189234770546');
    expect(p.fsiq_fbclid).toBe('IwY2xjawSWmELxyztest');
    expect(p.fsiq_referrer).toBe('https://facebook.com/');
    expect(p.fsiq_landing_page_url).toContain('5provenways');
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
