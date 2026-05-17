import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { syncToGhl } from '../crm/ghl';
import { LEAD_STATUS, COMMUNICATION_ROUTE } from '../crm/lead-status';
import { GHL_TAG } from '../crm/ghl-tags';
import type { GhlHandoffPayload } from '../crm/ghl-types';

// ── Fixture ───────────────────────────────────────────────────────────────────

const basePayload: GhlHandoffPayload = {
  fsiq_submission_id:         'sub_001',
  fsiq_full_name:             'Jane Smith',
  fsiq_email:                 'jane@example.com',
  fsiq_phone:                 '5125550100',
  fsiq_restaurant_name:       'Test Bistro',
  fsiq_website:               'https://testbistro.com',
  fsiq_state:                 'TX',
  fsiq_concept_type:          'Casual dining',
  fsiq_locations:             'Single location',
  fsiq_annual_food_spend:     '$1M–$3M',
  fsiq_distributor_type:      'National broadliners (Sysco, US Foods)',
  fsiq_procurement_strategy:  'Market price, single distributor',
  fsiq_top_skus:              'beef, chicken',
  fsiq_lead_status:           LEAD_STATUS.QUALIFIED_FULL_PDF_READY,
  fsiq_communication_route:   COMMUNICATION_ROUTE.SEND_FULL_REPORT,
  fsiq_qualified:             true,
  fsiq_final_decision:        'verified_restaurant',
  fsiq_country_eligibility:   'us_verified',
  fsiq_dq_reason:             null,
  fsiq_estimated_savings:     '$147,000',
  fsiq_final_pct:             '7.4%',
  fsiq_spend_bucket:          '$1M–$3M',
  fsiq_pdf_mode:              'full',
  fsiq_pdf_status:            'complete',
  fsiq_pdf_url:               'https://cdn.pdfmonkey.io/report.pdf',
  fsiq_pdf_ready_at:          '2026-05-16T00:05:00.000Z',
  fsiq_manual_review_required: false,
  fsiq_workflow_status:       'complete',
  fsiq_workflow_stage:        'complete',
  tags: [GHL_TAG.ANALYZER_SUBMITTED, GHL_TAG.QUALIFIED, GHL_TAG.FULL_PDF_READY],
};

// ── Env helpers ───────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubEnv('GHL_ACCESS_TOKEN', 'test-token');
  vi.stubEnv('GHL_LOCATION_ID', 'loc_test');
  vi.stubEnv('GHL_API_BASE_URL', 'https://ghl-test.example.com');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

// ── Missing credentials ───────────────────────────────────────────────────────

describe('syncToGhl — missing credentials', () => {
  it('returns error when token is missing', async () => {
    vi.stubEnv('GHL_ACCESS_TOKEN', '');
    vi.stubEnv('GHL_API_KEY', '');
    const result = await syncToGhl(basePayload);
    expect(result.crmSyncStatus).toBe('error');
    expect(result.crmSyncError).toMatch(/credentials not configured/i);
    expect(result.ghlContactId).toBeNull();
  });

  it('returns error when location ID is missing', async () => {
    vi.stubEnv('GHL_LOCATION_ID', '');
    const result = await syncToGhl(basePayload);
    expect(result.crmSyncStatus).toBe('error');
  });
});

// ── Contact creation (no existing contact) ────────────────────────────────────

describe('syncToGhl — create new contact', () => {
  it('creates contact when search returns no existing contact', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/search/duplicate')) {
        return new Response(JSON.stringify({ contact: null }), { status: 200 });
      }
      if (url.endsWith('/contacts')) {
        return new Response(JSON.stringify({ contact: { id: 'new_contact_123' } }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    const result = await syncToGhl(basePayload);

    expect(result.crmSyncStatus).toBe('synced');
    expect(result.ghlContactId).toBe('new_contact_123');
    expect(result.crmSyncError).toBeNull();
    expect(result.crmTags).toContain(GHL_TAG.FULL_PDF_READY);

    // Verify POST was called for create
    const calls = fetchSpy.mock.calls;
    const createCall = calls.find(([url]) => typeof url === 'string' && url.endsWith('/contacts') && !url.includes('search'));
    expect(createCall).toBeDefined();
    const [, init] = createCall!;
    expect((init as RequestInit).method).toBe('POST');
    fetchSpy.mockRestore();
  });
});

// ── Contact update (existing contact found) ───────────────────────────────────

describe('syncToGhl — update existing contact', () => {
  it('updates contact when search finds existing contact', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('/search/duplicate')) {
        return new Response(JSON.stringify({ contact: { id: 'existing_456' } }), { status: 200 });
      }
      if (url.includes('/contacts/existing_456')) {
        return new Response(JSON.stringify({ contact: { id: 'existing_456' } }), { status: 200 });
      }
      return new Response('not found', { status: 404 });
    });

    const result = await syncToGhl(basePayload);

    expect(result.crmSyncStatus).toBe('synced');
    expect(result.ghlContactId).toBe('existing_456');

    // Verify PUT was called for update
    const calls = fetchSpy.mock.calls;
    const updateCall = calls.find(([url]) => typeof url === 'string' && url.includes('/contacts/existing_456'));
    expect(updateCall).toBeDefined();
    const [, init] = updateCall!;
    expect((init as RequestInit).method).toBe('PUT');
    fetchSpy.mockRestore();
  });
});

// ── API error handling ────────────────────────────────────────────────────────

describe('syncToGhl — API errors', () => {
  it('returns error result on search failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('Internal Server Error', { status: 500 }),
    );
    const result = await syncToGhl(basePayload);
    expect(result.crmSyncStatus).toBe('error');
    expect(result.crmSyncError).toMatch(/search failed/i);
  });

  it('returns error result on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    const result = await syncToGhl(basePayload);
    expect(result.crmSyncStatus).toBe('error');
    expect(result.crmSyncError).toContain('Network error');
  });
});
