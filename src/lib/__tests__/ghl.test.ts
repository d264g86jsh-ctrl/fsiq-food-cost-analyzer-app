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

// ── Helpers ───────────────────────────────────────────────────────────────────

function dupResponse(contactId: string) {
  return new Response(
    JSON.stringify({
      statusCode: 400,
      message: 'This location does not allow duplicated contacts.',
      meta: { contactId, matchingField: 'phone' },
      succeded: false,
    }),
    { status: 400 },
  );
}

function okContact(id: string) {
  return new Response(JSON.stringify({ contact: { id } }), { status: 200 });
}

function okTags() {
  return new Response(JSON.stringify({ tags: basePayload.tags }), { status: 200 });
}

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

// ── Happy path: create succeeds, tags applied ─────────────────────────────────

describe('syncToGhl — create + tag (happy path)', () => {
  it('returns synced with new contactId on successful create + tags', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/contacts'))              return okContact('new_contact_123');
      if (url.includes('/contacts/new_contact_123/tags')) return okTags();
      return new Response('not found', { status: 404 });
    });

    const result = await syncToGhl(basePayload);
    expect(result.crmSyncStatus).toBe('synced');
    expect(result.ghlContactId).toBe('new_contact_123');
    expect(result.crmSyncError).toBeNull();
    expect(result.crmTags).toContain(GHL_TAG.FULL_PDF_READY);
  });

  it('uses POST for create', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/contacts'))                    return okContact('c1');
      if (url.includes('/contacts/c1/tags'))            return okTags();
      return new Response('not found', { status: 404 });
    });

    await syncToGhl(basePayload);

    const createCall = fetchSpy.mock.calls.find(([url]) =>
      typeof url === 'string' && url.endsWith('/contacts'),
    );
    expect(createCall).toBeDefined();
    expect((createCall![1] as RequestInit).method).toBe('POST');
  });

  it('does not call the duplicate search endpoint', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/contacts'))               return okContact('c1');
      if (url.includes('/contacts/c1/tags'))       return okTags();
      return new Response('not found', { status: 404 });
    });

    await syncToGhl(basePayload);

    const searchCall = fetchSpy.mock.calls.find(([url]) =>
      typeof url === 'string' && url.includes('search/duplicate'),
    );
    expect(searchCall).toBeUndefined();
  });

  it('sends tags via POST /contacts/:id/tags, not in create body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/contacts'))               return okContact('c1');
      if (url.includes('/contacts/c1/tags'))       return okTags();
      return new Response('not found', { status: 404 });
    });

    await syncToGhl(basePayload);

    // Create body should NOT include tags
    const createCall = fetchSpy.mock.calls.find(([url]) =>
      typeof url === 'string' && url.endsWith('/contacts'),
    )!;
    const createBody = JSON.parse((createCall[1] as RequestInit).body as string);
    expect(createBody).not.toHaveProperty('tags');

    // Tags call should include the tags
    const tagsCall = fetchSpy.mock.calls.find(([url]) =>
      typeof url === 'string' && url.includes('/tags'),
    )!;
    const tagsBody = JSON.parse((tagsCall[1] as RequestInit).body as string);
    expect(tagsBody.tags).toContain(GHL_TAG.FULL_PDF_READY);
  });

  it('includes locationId in create body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/contacts'))               return okContact('c1');
      if (url.includes('/contacts/c1/tags'))       return okTags();
      return new Response('not found', { status: 404 });
    });

    await syncToGhl(basePayload);

    const createCall = fetchSpy.mock.calls.find(([url]) =>
      typeof url === 'string' && url.endsWith('/contacts'),
    )!;
    const createBody = JSON.parse((createCall[1] as RequestInit).body as string);
    expect(createBody.locationId).toBe('loc_test');
  });
});

// ── Duplicate blocked: apply tags to existing contact ────────────────────────

describe('syncToGhl — duplicate contact (400 + meta.contactId)', () => {
  it('returns synced when create is blocked and tags applied to existing contact', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/contacts'))                       return dupResponse('existing_abc');
      if (url.includes('/contacts/existing_abc/tags'))     return okTags();
      return new Response('not found', { status: 404 });
    });

    const result = await syncToGhl(basePayload);
    expect(result.crmSyncStatus).toBe('synced');
    expect(result.ghlContactId).toBe('existing_abc');
    expect(result.crmTags).toContain(GHL_TAG.FULL_PDF_READY);
  });

  it('sets a non-null crmSyncError note when using existing contact', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/contacts'))                   return dupResponse('existing_abc');
      if (url.includes('/contacts/existing_abc/tags')) return okTags();
      return new Response('not found', { status: 404 });
    });

    const result = await syncToGhl(basePayload);
    expect(result.crmSyncError).toMatch(/duplicate/i);
  });

  it('never attempts to update (PUT) the existing contact fields', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/contacts'))                   return dupResponse('existing_abc');
      if (url.includes('/contacts/existing_abc/tags')) return okTags();
      return new Response('not found', { status: 404 });
    });

    await syncToGhl(basePayload);

    const putCall = fetchSpy.mock.calls.find(([, init]) =>
      (init as RequestInit)?.method === 'PUT',
    );
    expect(putCall).toBeUndefined();
  });

  it('returns error when tags call fails on duplicate path', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/contacts'))                   return dupResponse('existing_abc');
      if (url.includes('/contacts/existing_abc/tags')) return new Response('Server Error', { status: 500 });
      return new Response('not found', { status: 404 });
    });

    const result = await syncToGhl(basePayload);
    expect(result.crmSyncStatus).toBe('error');
    expect(result.crmSyncError).toMatch(/tag apply failed/i);
  });
});

// ── API error handling ────────────────────────────────────────────────────────

describe('syncToGhl — API errors', () => {
  it('returns error on non-duplicate create failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/contacts')) return new Response('Validation error', { status: 422 });
      return new Response('not found', { status: 404 });
    });

    const result = await syncToGhl(basePayload);
    expect(result.crmSyncStatus).toBe('error');
    expect(result.crmSyncError).toMatch(/create failed/i);
  });

  it('returns error on network failure', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    const result = await syncToGhl(basePayload);
    expect(result.crmSyncStatus).toBe('error');
    expect(result.crmSyncError).toContain('Network error');
  });

  it('returns error when tags call fails on new contact', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/contacts'))         return okContact('c1');
      if (url.includes('/contacts/c1/tags')) return new Response('Server Error', { status: 500 });
      return new Response('not found', { status: 404 });
    });

    const result = await syncToGhl(basePayload);
    expect(result.crmSyncStatus).toBe('error');
    expect(result.crmSyncError).toMatch(/tag apply failed/i);
  });

  it('returns error when create returns 200 but no contact id', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.endsWith('/contacts')) return new Response(JSON.stringify({ contact: {} }), { status: 200 });
      return new Response('not found', { status: 404 });
    });

    const result = await syncToGhl(basePayload);
    expect(result.crmSyncStatus).toBe('error');
    expect(result.crmSyncError).toMatch(/no contact id/i);
  });
});
