import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateAdminToken } from '../admin/admin-auth';

beforeEach(() => {
  vi.stubEnv('ADMIN_ACCESS_TOKEN', 'test-secret-token-abc123');
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('validateAdminToken', () => {
  it('returns true when token matches env var', () => {
    expect(validateAdminToken('test-secret-token-abc123')).toBe(true);
  });
  it('returns false when token does not match', () => {
    expect(validateAdminToken('wrong-token')).toBe(false);
  });
  it('returns false when token is empty string', () => {
    expect(validateAdminToken('')).toBe(false);
  });
  it('returns false when ADMIN_ACCESS_TOKEN is not set', () => {
    vi.stubEnv('ADMIN_ACCESS_TOKEN', '');
    expect(validateAdminToken('any-token')).toBe(false);
  });
  it('does not include the raw token in any return value (no accidental exposure)', () => {
    const result = validateAdminToken('wrong-token');
    // validateAdminToken returns boolean — verify no token leakage
    expect(typeof result).toBe('boolean');
    expect(String(result)).not.toContain('test-secret-token-abc123');
  });
  it('is case-sensitive', () => {
    expect(validateAdminToken('Test-Secret-Token-Abc123')).toBe(false);
  });
});
