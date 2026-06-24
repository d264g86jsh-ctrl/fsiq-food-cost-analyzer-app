import { describe, it, expect, afterEach } from 'vitest';
import { buildReportUrl } from '../pdf/report-url';

// buildReportUrl reads process.env.NEXT_PUBLIC_APP_URL at call time, so each test
// sets it directly. Restore the original after each test.
const ORIGINAL = process.env.NEXT_PUBLIC_APP_URL;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = ORIGINAL;
});

describe('buildReportUrl', () => {
  it('strips a trailing slash so it never produces //report', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.foodserviceiq.com/';
    const url = buildReportUrl('abc123');
    expect(url).toBe('https://app.foodserviceiq.com/report/abc123');
    expect(url.replace(/^https?:\/\//, '')).not.toContain('//');
  });

  it('handles a value with no trailing slash', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.foodserviceiq.com';
    expect(buildReportUrl('abc123')).toBe('https://app.foodserviceiq.com/report/abc123');
  });

  it('strips multiple trailing slashes', () => {
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.foodserviceiq.com///';
    expect(buildReportUrl('abc123')).toBe('https://app.foodserviceiq.com/report/abc123');
  });

  it('defaults to the production host when unset (never a host-less URL)', () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(buildReportUrl('abc123')).toBe('https://app.foodserviceiq.com/report/abc123');
  });
});
