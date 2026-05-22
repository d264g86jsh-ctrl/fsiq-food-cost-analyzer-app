import { describe, it, expect } from 'vitest';
import { buildLeadEvent, buildQualifiedLeadEvent } from '../meta/meta-events';
import type { TrackingContext } from '../meta/meta-types';
import { createHash } from 'crypto';

function sha256(val: string): string {
  return createHash('sha256').update(val).digest('hex');
}

const baseSubmission = {
  email:    'chef@demorestaurant.com',
  phone:    '512-555-0100',
  qualified: true,
  dqReason: null as string | null,
  dollarEstimate: 45000,
};

const tracking: TrackingContext = {
  fbp:             'fb.1.123.abc',
  fbc:             'fb.1.456.def',
  eventId:         'evt-uuid-001',
  clientUserAgent: 'Mozilla/5.0',
  clientIpAddress: '1.2.3.4',
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
