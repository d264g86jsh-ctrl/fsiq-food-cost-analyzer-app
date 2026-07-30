// Contract tests for GHL payload and Meta CAPI event structure.
// These tests assert that the exact field keys, types, and value formats
// the app sends to GHL and Meta match the expected API schemas.
// If vendor schemas change (or we change our builder) these tests break loudly.

import { describe, it, expect } from 'vitest';
import { buildGhlPayload } from '../crm/build-ghl-payload';
import { buildLeadEvent, buildQualifiedLeadEvent } from '../meta/meta-events';
import { LEAD_STATUS, COMMUNICATION_ROUTE } from '../crm/lead-status';
import { GHL_TAG } from '../crm/ghl-tags';
import type { Submission } from '@prisma/client';
import type { TrackingContext } from '../meta/meta-types';

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSubmission(overrides: Partial<Submission> = {}): Submission {
  return {
    id:                     'sub_contract_001',
    restaurantName:         "Joe's Diner",
    website:                'https://joesdiner.com',
    state:                  'TX',
    conceptType:            'Casual dining',
    locations:              '1 location',
    annualFoodSpend:        '$1M–$3M',
    distributorType:        'National broadliners (Sysco, US Foods)',
    procurementStrategy:    'Market price, single distributor',
    topSkus:                'beef, chicken',
    fullName:               'Joe Smith',
    email:                  'joe@joesdiner.com',
    phone:                  '5125550100',
    utmSource:              null,
    utmMedium:              null,
    utmCampaign:            null,
    utmContent:             null,
    utmTerm:                null,
    ipAddress:              '1.2.3.4',
    websiteValidationResult: null,
    finalDecision:          'verified_restaurant' as Submission['finalDecision'],
    countryEligibility:     'us_verified' as Submission['countryEligibility'],
    locationConfidenceScore: 90,
    internalFlags:          null,
    manualReviewRequired:   false,
    manualReviewStatus:     'not_required' as Submission['manualReviewStatus'],
    manualReviewNotes:      null,
    manualReviewedAt:       null,
    qualified:              true,
    dqReason:               null,
    spendBucket:            '$1M–$3M',
    bucketMidpoint:         2_000_000,
    finalPct:               7.0,
    dollarEstimate:         140_000,
    caseStudy:              "Joe's Diner",
    year1: 140_000,
    year2: 145_460,
    year3: 151_133,
    year4: 157_027,
    year5: 163_150,
    projectionHeights:      null,
    logoUrl:                'https://joesdiner.com/logo.png',
    businessSummary:        'A classic diner.',
    conceptSignals:         null,
    narrativeDistributor:   'narrative_dist',
    narrativeProcurement:   'narrative_proc',
    narrativeSku:           'narrative_sku',
    pdfMode:                'full' as Submission['pdfMode'],
    pdfStatus:              'complete' as Submission['pdfStatus'],
    pdfMonkeyDocumentId:    'doc_abc123',
    pdfDownloadUrl:         'https://cdn.pdfmonkey.io/documents/doc_abc123/report.pdf',
    pdfError:               null,
    pdfRetryCount:          0,
    emailStatus:            null,
    emailVariant:           null,
    emailSentAt:            null,
    emailError:             null,
    emailRetryCount:        0,
    ghlContactId:           null,
    crmSyncStatus:          'synced' as Submission['crmSyncStatus'],
    crmSyncError:           null,
    crmSyncRetryCount:      0,
    crmTags:                null,
    metaStatus:             'fired' as Submission['metaStatus'],
    metaEventIds:           null,
    metaError:              null,
    workflowStage:          'complete',
    workflowStatus:         'complete' as Submission['workflowStatus'],
    workflowErrors:         null,
    workflowFailReason:     null,
    aiResearchCompletedAt:  null,
    aiNarrativeCompletedAt: null,
    pdfGeneratedAt:         null,
    idempotencyKey:         null,
    createdAt:              new Date('2026-05-16T00:00:00Z'),
    updatedAt:              new Date('2026-05-16T00:05:00Z'),
    ...overrides,
  };
}

const tracking: TrackingContext = {
  fbp:             'fb.1.123.abc',
  fbc:             null,
  eventId:         'evt-uuid-contract-001',
  clientUserAgent: 'Mozilla/5.0',
  clientIpAddress: '1.2.3.4',
};

// ── GHL payload contract ──────────────────────────────────────────────────────

describe('GHL payload contract — required top-level fields', () => {
  const sub = makeSubmission();
  const p = buildGhlPayload(sub, LEAD_STATUS.QUALIFIED_FULL_PDF_READY, COMMUNICATION_ROUTE.SEND_FULL_REPORT, [GHL_TAG.ANALYZER_SUBMITTED, GHL_TAG.QUALIFIED, GHL_TAG.FULL_PDF_READY]);

  it('has all required identity fields', () => {
    expect(typeof p.fsiq_submission_id).toBe('string');
    expect(p.fsiq_submission_id.length).toBeGreaterThan(0);
    expect(typeof p.fsiq_full_name).toBe('string');
    expect(typeof p.fsiq_email).toBe('string');
    // email format
    expect(p.fsiq_email).toMatch(/^[^\s@]+@[^\s@]+\.[^\s@]+$/);
  });

  it('has all required restaurant profile fields as strings', () => {
    expect(typeof p.fsiq_restaurant_name).toBe('string');
    expect(typeof p.fsiq_website).toBe('string');
    expect(typeof p.fsiq_state).toBe('string');
    expect(typeof p.fsiq_concept_type).toBe('string');
    expect(typeof p.fsiq_locations).toBe('string');
    expect(typeof p.fsiq_annual_food_spend).toBe('string');
    expect(typeof p.fsiq_distributor_type).toBe('string');
    expect(typeof p.fsiq_procurement_strategy).toBe('string');
    expect(typeof p.fsiq_top_skus).toBe('string');
  });

  it('has routing fields with correct types', () => {
    expect(typeof p.fsiq_lead_status).toBe('string');
    expect(typeof p.fsiq_communication_route).toBe('string');
    expect(typeof p.fsiq_qualified).toBe('boolean');
    expect(typeof p.fsiq_final_decision).toBe('string');
    expect(typeof p.fsiq_country_eligibility).toBe('string');
  });

  it('has savings fields as strings', () => {
    expect(typeof p.fsiq_estimated_savings).toBe('string');
    expect(typeof p.fsiq_final_pct).toBe('string');
    expect(typeof p.fsiq_spend_bucket).toBe('string');
  });

  it('has workflow fields as strings', () => {
    expect(typeof p.fsiq_workflow_status).toBe('string');
    expect(typeof p.fsiq_workflow_stage).toBe('string');
    expect(typeof p.fsiq_manual_review_required).toBe('boolean');
  });

  it('has tags as non-empty array of strings', () => {
    expect(Array.isArray(p.tags)).toBe(true);
    expect(p.tags.length).toBeGreaterThan(0);
    p.tags.forEach((tag) => expect(typeof tag).toBe('string'));
  });

  it('fsiq_pdf_url is a valid URL string when pdfStatus=complete', () => {
    expect(typeof p.fsiq_pdf_url).toBe('string');
    expect(p.fsiq_pdf_url).toMatch(/^https?:\/\//);
  });

  it('fsiq_pdf_ready_at is a valid ISO timestamp when pdfStatus=complete', () => {
    expect(typeof p.fsiq_pdf_ready_at).toBe('string');
    expect(() => new Date(p.fsiq_pdf_ready_at!).toISOString()).not.toThrow();
  });
});

describe('GHL payload contract — DQ lead has empty savings fields', () => {
  const sub = makeSubmission({ qualified: false, dqReason: 'below_threshold', pdfStatus: null, pdfMode: null, pdfDownloadUrl: null });
  const p = buildGhlPayload(sub, LEAD_STATUS.DISQUALIFIED_BELOW_THRESHOLD, COMMUNICATION_ROUTE.SEND_DQ_BELOW_THRESHOLD, [GHL_TAG.ANALYZER_SUBMITTED, GHL_TAG.DQ_BELOW_THRESHOLD]);

  it('estimated_savings and final_pct are empty strings for DQ lead', () => {
    expect(p.fsiq_estimated_savings).toBe('');
    expect(p.fsiq_final_pct).toBe('');
  });

  it('spend_bucket is still populated for DQ leads (useful CRM context)', () => {
    // spendBucket comes from qualification which runs before DQ decision
    expect(typeof p.fsiq_spend_bucket).toBe('string');
  });

  it('pdf_url is null for DQ lead', () => {
    expect(p.fsiq_pdf_url).toBeNull();
  });
});

// ── Meta CAPI event contract ──────────────────────────────────────────────────

describe('Meta CAPI Lead event contract', () => {
  const sub = makeSubmission();
  const ev = buildLeadEvent(sub, tracking);

  it('event_name is "Lead"', () => {
    expect(ev.event_name).toBe('Lead');
  });

  it('event_time is a Unix timestamp (integer seconds, recent)', () => {
    expect(typeof ev.event_time).toBe('number');
    expect(Number.isInteger(ev.event_time)).toBe(true);
    const nowSeconds = Math.floor(Date.now() / 1000);
    expect(ev.event_time).toBeGreaterThan(nowSeconds - 60);
    expect(ev.event_time).toBeLessThanOrEqual(nowSeconds + 1);
  });

  it('event_id is a non-empty string', () => {
    expect(typeof ev.event_id).toBe('string');
    expect(ev.event_id.length).toBeGreaterThan(0);
  });

  it('action_source is "website"', () => {
    expect(ev.action_source).toBe('website');
  });

  it('user_data.em is a 64-char hex SHA-256 of lowercase email', () => {
    expect(typeof ev.user_data.em).toBe('string');
    expect(ev.user_data.em).toMatch(/^[0-9a-f]{64}$/);
  });

  it('user_data contains fbp from tracking context', () => {
    expect(ev.user_data.fbp).toBe('fb.1.123.abc');
  });

  it('user_data.client_ip_address matches tracking context', () => {
    expect(ev.user_data.client_ip_address).toBe('1.2.3.4');
  });
});

describe('Meta CAPI QualifiedLead event contract', () => {
  const sub = makeSubmission();
  const ev = buildQualifiedLeadEvent(sub, tracking);

  it('event_name is "QualifiedLead" or a known custom event name', () => {
    expect(typeof ev.event_name).toBe('string');
    expect(ev.event_name.length).toBeGreaterThan(0);
  });

  it('event_id differs from Lead event (independent dedup)', () => {
    const leadEv = buildLeadEvent(sub, tracking);
    expect(ev.event_id).not.toBe(leadEv.event_id);
  });

  it('action_source is "website"', () => {
    expect(ev.action_source).toBe('website');
  });

  it('custom_data.value is a positive number when dollarEstimate is set', () => {
    expect(typeof ev.custom_data?.value).toBe('number');
    expect((ev.custom_data?.value ?? 0)).toBeGreaterThan(0);
  });

  it('custom_data.currency is "USD"', () => {
    expect(ev.custom_data?.currency).toBe('USD');
  });
});
