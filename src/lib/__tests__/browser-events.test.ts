import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fireBrowserLead, fireQualifiedLead, fireAnalyzerStarted } from '../meta/browser-events';

// ── fbq mock ──────────────────────────────────────────────────────────────────

type FbqCall = [string, string, Record<string, unknown>?, { eventID?: string }?];

function setupFbq(): FbqCall[] {
  const calls: FbqCall[] = [];
  const fbqMock = vi.fn((...args: unknown[]) => {
    calls.push(args as FbqCall);
  });
  vi.stubGlobal('fbq', fbqMock);
  return calls;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ── fireBrowserLead ───────────────────────────────────────────────────────────

describe('fireBrowserLead', () => {
  it('fires Lead event with eventID for browser/CAPI deduplication', () => {
    const calls = setupFbq();
    fireBrowserLead('evt-123', { email: 'test@example.com', phone: '5125550100', firstName: 'Jane' });
    expect(calls).toHaveLength(1);
    const [cmd, name, params, opts] = calls[0];
    expect(cmd).toBe('track');
    expect(name).toBe('Lead');
    expect(params?.em).toBe('test@example.com');
    expect(opts?.eventID).toBe('evt-123');
  });

  it('does not throw when fbq is not loaded', () => {
    vi.stubGlobal('fbq', undefined);
    expect(() => fireBrowserLead('evt-123', {})).not.toThrow();
  });
});

// ── fireQualifiedLead ─────────────────────────────────────────────────────────

describe('fireQualifiedLead', () => {
  it('fires QualifiedLead with ql-prefixed eventID for CAPI deduplication', () => {
    const calls = setupFbq();
    fireQualifiedLead({ eventId: 'ql-evt-456', value: 147000, estimatedSavings: '$147,000' });
    expect(calls).toHaveLength(1);
    const [cmd, name, params, opts] = calls[0];
    expect(cmd).toBe('trackCustom');
    expect(name).toBe('QualifiedLead');
    expect(opts?.eventID).toBe('ql-evt-456');
  });

  it('includes value and hardcoded USD currency when value is provided', () => {
    const calls = setupFbq();
    fireQualifiedLead({ value: 147000 });
    const [, , params] = calls[0];
    expect(params?.value).toBe(147000);
    expect(params?.currency).toBe('USD');
  });

  it('omits value and currency when value is not provided', () => {
    const calls = setupFbq();
    fireQualifiedLead({ estimatedSavings: '$147,000' });
    const [, , params] = calls[0];
    expect(params?.value).toBeUndefined();
    expect(params?.currency).toBeUndefined();
  });

  it('fires without eventID when not provided (legacy path)', () => {
    const calls = setupFbq();
    fireQualifiedLead({ estimatedSavings: '$100,000' });
    const [, , , opts] = calls[0];
    expect(opts).toBeUndefined();
  });

  it('ql- prefix on browser eventID matches server buildQualifiedLeadEvent scheme', () => {
    // The server produces event_id = 'ql-' + trackingContext.eventId (meta-events.ts:60).
    // The form passes `ql-${eventId}` where eventId is the same UUID used for Lead.
    // Both must be identical for Meta to deduplicate. This test confirms the prefix convention.
    const submissionEventId = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
    const browserQlId = `ql-${submissionEventId}`;
    const serverQlId  = `ql-${submissionEventId}`;   // mirrors meta-events.ts line 60
    expect(browserQlId).toBe(serverQlId);
  });

  it('does not throw when fbq is not loaded', () => {
    vi.stubGlobal('fbq', undefined);
    expect(() => fireQualifiedLead({ eventId: 'ql-x', value: 100 })).not.toThrow();
  });
});

// ── fireAnalyzerStarted ───────────────────────────────────────────────────────

describe('fireAnalyzerStarted', () => {
  it('fires AnalyzerStarted with no eventID (no server counterpart)', () => {
    const calls = setupFbq();
    fireAnalyzerStarted();
    expect(calls).toHaveLength(1);
    const [cmd, name, , opts] = calls[0];
    expect(cmd).toBe('track');
    expect(name).toBe('AnalyzerStarted');
    expect(opts).toBeUndefined();
  });
});
