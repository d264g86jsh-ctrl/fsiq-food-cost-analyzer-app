import { describe, it, expect } from 'vitest';
import { buildLeadEvent, buildQualifiedLeadEvent } from '../meta/meta-events';
import type { TrackingContext } from '../meta/meta-types';
import { createHash } from 'crypto';

function sha256(val: string): string {
  return createHash('sha256').update(val).digest('hex');
}

const baseSubmission = {
  id:            'sub_test_abc123',
  email:         'chef@demorestaurant.com',
  phone:         '512-555-0100',
  qualified:     true,
  dqReason:      null as string | null,
  dollarEstimate: 45000,
};

const tracking: TrackingContext = {
  fbp:             'fb.1.123.abc',
  fbc:             'fb.1.456.def',
  eventId:         'evt-uuid-001',
  clientUserAgent: 'Mozilla/5.0',
  clientIpAddress: '1.2.3.4',
  landingPageUrl:  null,
};

// ── buildLeadEvent ────────────────────────────────────────────────────────────

describe('buildLeadEvent', () => {
  it('sets event_name to Lead', () => {
    const ev = buildLeadEvent(baseSubmission, tracking);
    expect(ev.event_name).toBe('Lead');
  });

  it('uses the provided event_id from tracking context (enables browser/server dedup)', () => {
    const ev = buildLeadEvent(baseSubmission, tracking);
    expect(ev.event_id).toBe('evt-uuid-001');
  });

  it('generates a fallback event_id when trackingContext.eventId is null', () => {
    const ev = buildLeadEvent(baseSubmission, { ...tracking, eventId: null });
    expect(ev.event_id).toBeTruthy();
    expect(typeof ev.event_id).toBe('string');
  });

  it('hashes email in user_data', () => {
    const ev = buildLeadEvent(baseSubmission, tracking);
    expect(ev.user_data.em).toBe(sha256('chef@demorestaurant.com'));
  });

  it('hashes phone digits in user_data', () => {
    const ev = buildLeadEvent(baseSubmission, tracking);
    expect(ev.user_data.ph).toBe(sha256('5125550100'));
  });

  it('passes fbp and fbc through unmodified', () => {
    const ev = buildLeadEvent(baseSubmission, tracking);
    expect(ev.user_data.fbp).toBe('fb.1.123.abc');
    expect(ev.user_data.fbc).toBe('fb.1.456.def');
  });

  it('sets action_source to website', () => {
    const ev = buildLeadEvent(baseSubmission, tracking);
    expect(ev.action_source).toBe('website');
  });

  it('sets lead_type to qualified for qualified leads', () => {
    const ev = buildLeadEvent({ ...baseSubmission, qualified: true, dqReason: null }, tracking);
    expect(ev.custom_data?.lead_type).toBe('qualified');
  });

  it('sets lead_type to dqReason for DQ leads', () => {
    const ev = buildLeadEvent({ ...baseSubmission, qualified: false, dqReason: 'below_threshold' }, tracking);
    expect(ev.custom_data?.lead_type).toBe('below_threshold');
  });

  it('sets lead_type to disqualified when dqReason is null and qualified is false', () => {
    const ev = buildLeadEvent({ ...baseSubmission, qualified: false, dqReason: null }, tracking);
    expect(ev.custom_data?.lead_type).toBe('disqualified');
  });

  it('sets content_name to food_cost_analyzer', () => {
    const ev = buildLeadEvent(baseSubmission, tracking);
    expect(ev.custom_data?.content_name).toBe('food_cost_analyzer');
  });

  it('does NOT include top_skus or pdfDownloadUrl in the event', () => {
    const ev = buildLeadEvent(baseSubmission, tracking);
    const evStr = JSON.stringify(ev);
    expect(evStr).not.toContain('top_skus');
    expect(evStr).not.toContain('pdfDownloadUrl');
  });

  it('sets event_source_url to landingPageUrl when provided (UTM/fbclid traffic)', () => {
    const url = 'https://app.foodserviceiq.com/?utm_source=facebook&fbclid=abc';
    const ev = buildLeadEvent(baseSubmission, { ...tracking, landingPageUrl: url });
    expect(ev.event_source_url).toBe(url);
  });

  it('sets event_source_url to site root when landingPageUrl is null (93% case — direct/organic)', () => {
    // Previously omitted the field entirely; Meta flags this as lower quality.
    const ev = buildLeadEvent(baseSubmission, { ...tracking, landingPageUrl: null });
    expect(ev.event_source_url).toBeDefined();
    expect(ev.event_source_url).toMatch(/^https?:\/\/.+\/$/);  // ends with /
  });

  it('event_source_url is a top-level field — not inside custom_data or user_data', () => {
    const ev = buildLeadEvent(baseSubmission, tracking);
    expect('event_source_url' in ev).toBe(true);
    expect(ev.custom_data).not.toHaveProperty('event_source_url');
    expect(ev.user_data).not.toHaveProperty('event_source_url');
  });
});

// ── buildQualifiedLeadEvent ───────────────────────────────────────────────────

describe('buildQualifiedLeadEvent', () => {
  it('sets event_name to QualifiedLead', () => {
    const ev = buildQualifiedLeadEvent(baseSubmission, tracking);
    expect(ev.event_name).toBe('QualifiedLead');
  });

  it('prefixes event_id with ql- so it never deduplicates against Lead event', () => {
    const ev = buildQualifiedLeadEvent(baseSubmission, tracking);
    expect(ev.event_id).toBe('ql-evt-uuid-001');
    expect(ev.event_id).not.toBe('evt-uuid-001');
  });

  it('includes dollar value and USD currency in custom_data', () => {
    const ev = buildQualifiedLeadEvent(baseSubmission, tracking);
    expect(ev.custom_data?.value).toBe(45000);
    expect(ev.custom_data?.currency).toBe('USD');
  });

  it('omits value from custom_data when dollarEstimate is null', () => {
    const ev = buildQualifiedLeadEvent({ ...baseSubmission, dollarEstimate: null }, tracking);
    expect(ev.custom_data?.value).toBeUndefined();
    expect(ev.custom_data?.currency).toBe('USD');
  });

  it('hashes email and phone in user_data', () => {
    const ev = buildQualifiedLeadEvent(baseSubmission, tracking);
    expect(ev.user_data.em).toBe(sha256('chef@demorestaurant.com'));
    expect(ev.user_data.ph).toBe(sha256('5125550100'));
  });

  // Key invariant: QualifiedLead is server-only; no browser counterpart → no dedup needed
  it('is server-side only — event_id is distinct from Lead event_id', () => {
    const lead = buildLeadEvent(baseSubmission, tracking);
    const ql = buildQualifiedLeadEvent(baseSubmission, tracking);
    expect(ql.event_id).not.toBe(lead.event_id);
  });

  // event_source_url assertions
  it('sets event_source_url to the report page URL for the submission (top-level field)', () => {
    const ev = buildQualifiedLeadEvent(baseSubmission, tracking);
    expect(ev.event_source_url).toBeDefined();
    expect(ev.event_source_url).toContain('/report/sub_test_abc123');
    expect('event_source_url' in ev).toBe(true);
    expect(ev.custom_data).not.toHaveProperty('event_source_url');
    expect(ev.user_data).not.toHaveProperty('event_source_url');
  });

  it('event_source_url falls back to site root when submission id is empty string', () => {
    const ev = buildQualifiedLeadEvent({ ...baseSubmission, id: '' }, tracking);
    expect(ev.event_source_url).toBeDefined();
    expect(ev.event_source_url).toMatch(/^https?:\/\/.+\/$/);
    expect(ev.event_source_url).not.toContain('/report/');
  });

  it('trailing slash in NEXT_PUBLIC_APP_URL does not produce double slash in event_source_url', () => {
    // APP_ORIGIN strips trailing slashes; the path segment adds exactly one /report/...
    // so there should never be a // after the protocol.
    const ev = buildQualifiedLeadEvent(baseSubmission, tracking);
    const url = ev.event_source_url ?? '';
    const afterProtocol = url.replace(/^https?:\/\//, '');
    expect(afterProtocol).not.toContain('//');
  });

  it('dedup is unaffected — event_id unchanged by adding event_source_url', () => {
    // event_source_url is NOT a Meta dedup key; dedup runs on event_id alone.
    // Verify event_id is still the ql- prefixed UUID, no other dedup-relevant field changed.
    const ev = buildQualifiedLeadEvent(baseSubmission, tracking);
    expect(ev.event_id).toBe('ql-evt-uuid-001');
    expect(ev.event_name).toBe('QualifiedLead');
    expect(ev.action_source).toBe('website');
  });
});

// ── DisqualifiedLead ──────────────────────────────────────────────────────────

describe('DisqualifiedLead — not generated by default', () => {
  it('neither buildLeadEvent nor buildQualifiedLeadEvent produces a DisqualifiedLead event', () => {
    const lead = buildLeadEvent({ ...baseSubmission, qualified: false, dqReason: 'national_chain' }, tracking);
    const ql = buildQualifiedLeadEvent(baseSubmission, tracking);
    expect(lead.event_name).not.toBe('DisqualifiedLead');
    expect(ql.event_name).not.toBe('DisqualifiedLead');
  });
});
