// Server-only — sends events to Meta Conversions API (CAPI).
// Reads META_PIXEL_ID and META_CONVERSIONS_API_TOKEN from server env vars.
// Never expose these to client code. CAPI errors are non-fatal — catch and persist.

import type { MetaCapiEvent, MetaCapiResult } from './meta-types';

const CAPI_BASE = 'https://graph.facebook.com/v19.0';

export async function sendToMetaCapi(events: MetaCapiEvent[]): Promise<MetaCapiResult> {
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_CONVERSIONS_API_TOKEN;

  if (!pixelId || !token) {
    return {
      metaStatus:   'skipped',
      metaEventIds: [],
      metaError:    'META_PIXEL_ID or META_CONVERSIONS_API_TOKEN not configured',
    };
  }

  const body: Record<string, unknown> = { data: events };
  const testCode = process.env.META_TEST_EVENT_CODE;
  if (testCode) body.test_event_code = testCode;

  try {
    const res = await fetch(
      `${CAPI_BASE}/${pixelId}/events?access_token=${token}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      },
    );

    const json = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      const errMsg = JSON.stringify((json as { error?: unknown }).error ?? json);
      return { metaStatus: 'error', metaEventIds: [], metaError: errMsg };
    }

    const eventIds = events.map((e) => e.event_id);
    return { metaStatus: 'fired', metaEventIds: eventIds, metaError: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { metaStatus: 'error', metaEventIds: [], metaError: msg };
  }
}
