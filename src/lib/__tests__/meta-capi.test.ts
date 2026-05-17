import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { sendToMetaCapi } from '../meta/meta-capi';
import type { MetaCapiEvent } from '../meta/meta-types';

const sampleEvent: MetaCapiEvent = {
  event_name:    'Lead',
  event_time:    1700000000,
  event_id:      'test-event-id-001',
  action_source: 'website',
  user_data:     { em: 'abc123' },
  custom_data:   { content_name: 'food_cost_analyzer', lead_type: 'qualified' },
};

beforeEach(() => {
  vi.stubEnv('META_PIXEL_ID', '1679245649839076');
  vi.stubEnv('META_CONVERSIONS_API_TOKEN', 'test-token');
  vi.stubEnv('META_TEST_EVENT_CODE', '');
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// ── Missing credentials ───────────────────────────────────────────────────────

describe('sendToMetaCapi — missing credentials', () => {
  it('returns skipped when META_PIXEL_ID is not set', async () => {
    vi.stubEnv('META_PIXEL_ID', '');
    const result = await sendToMetaCapi([sampleEvent]);
    expect(result.metaStatus).toBe('skipped');
    expect(result.metaError).toMatch(/not configured/i);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns skipped when META_CONVERSIONS_API_TOKEN is not set', async () => {
    vi.stubEnv('META_CONVERSIONS_API_TOKEN', '');
    const result = await sendToMetaCapi([sampleEvent]);
    expect(result.metaStatus).toBe('skipped');
    expect(fetch).not.toHaveBeenCalled();
  });
});

// ── Successful CAPI call ──────────────────────────────────────────────────────

describe('sendToMetaCapi — success', () => {
  it('returns fired with event IDs on 200 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ events_received: 1 }), { status: 200 }),
    );
    const result = await sendToMetaCapi([sampleEvent]);
    expect(result.metaStatus).toBe('fired');
    expect(result.metaEventIds).toEqual(['test-event-id-001']);
    expect(result.metaError).toBeNull();
  });

  it('posts to the correct CAPI endpoint with event data', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ events_received: 1 }), { status: 200 }),
    );
    await sendToMetaCapi([sampleEvent]);
    const [url, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('1679245649839076/events');
    expect(url).toContain('access_token=test-token');
    const body = JSON.parse(options.body as string);
    expect(body.data[0].event_id).toBe('test-event-id-001');
    expect(body.data[0].event_name).toBe('Lead');
  });

  it('includes test_event_code in body when META_TEST_EVENT_CODE is set', async () => {
    vi.stubEnv('META_TEST_EVENT_CODE', 'TEST12345');
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ events_received: 1 }), { status: 200 }),
    );
    await sendToMetaCapi([sampleEvent]);
    const [, options] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.test_event_code).toBe('TEST12345');
  });

  it('returns fired event IDs for multiple events', async () => {
    const event2: MetaCapiEvent = { ...sampleEvent, event_name: 'QualifiedLead', event_id: 'ql-test-event-id-001' };
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ events_received: 2 }), { status: 200 }),
    );
    const result = await sendToMetaCapi([sampleEvent, event2]);
    expect(result.metaEventIds).toEqual(['test-event-id-001', 'ql-test-event-id-001']);
  });
});

// ── CAPI error responses ──────────────────────────────────────────────────────

describe('sendToMetaCapi — error responses', () => {
  it('returns error on non-200 response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Invalid token' } }), { status: 400 }),
    );
    const result = await sendToMetaCapi([sampleEvent]);
    expect(result.metaStatus).toBe('error');
    expect(result.metaEventIds).toEqual([]);
    expect(result.metaError).toContain('Invalid token');
  });

  it('returns error on network failure', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('Network timeout'));
    const result = await sendToMetaCapi([sampleEvent]);
    expect(result.metaStatus).toBe('error');
    expect(result.metaError).toBe('Network timeout');
  });
});
