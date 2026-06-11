import { describe, it, expect } from 'vitest';
import { normaliseDatabaseUrl } from '../db';

// The normaliseDatabaseUrl function must ALWAYS produce a URL with both
// pgbouncer=true and connection_limit=1 appended, regardless of the input
// format. This is the permanent fix for the 2026-06-11 production incident:
// the rotated DATABASE_URL was missing ?pgbouncer=true, which caused Prisma
// to use named prepared statements on PgBouncer sessions, leading to 42P05
// errors ("prepared statement s0 already exists") on every subsequent request.

const BASE = 'postgresql://user:pass@host:6543/postgres';

describe('normaliseDatabaseUrl', () => {
  // ── Ensures required params are appended ────────────────────────────────

  it('appends pgbouncer=true and connection_limit=1 when no query string exists', () => {
    const result = normaliseDatabaseUrl(BASE);
    expect(result).toContain('pgbouncer=true');
    expect(result).toContain('connection_limit=1');
    expect(result).toContain('?');
  });

  it('appends with & when URL already has a query string', () => {
    const url = `${BASE}?sslmode=require`;
    const result = normaliseDatabaseUrl(url);
    expect(result).toContain('sslmode=require');
    expect(result).toContain('pgbouncer=true');
    expect(result).toContain('connection_limit=1');
    // Should not have double ?
    expect(result.split('?')).toHaveLength(2);
  });

  // ── Idempotency — existing params are replaced, not duplicated ───────────

  it('does not duplicate pgbouncer=true when already present', () => {
    const url = `${BASE}?pgbouncer=true`;
    const result = normaliseDatabaseUrl(url);
    expect(result.split('pgbouncer=true')).toHaveLength(2); // exactly one occurrence
  });

  it('does not duplicate connection_limit=1 when already present', () => {
    const url = `${BASE}?connection_limit=1`;
    const result = normaliseDatabaseUrl(url);
    expect(result.split('connection_limit=1')).toHaveLength(2);
  });

  it('replaces pgbouncer=false with pgbouncer=true', () => {
    const url = `${BASE}?pgbouncer=false`;
    const result = normaliseDatabaseUrl(url);
    expect(result).toContain('pgbouncer=true');
    expect(result).not.toContain('pgbouncer=false');
  });

  it('replaces connection_limit=5 with connection_limit=1', () => {
    const url = `${BASE}?connection_limit=5`;
    const result = normaliseDatabaseUrl(url);
    expect(result).toContain('connection_limit=1');
    expect(result).not.toContain('connection_limit=5');
  });

  it('is fully idempotent — normalising twice gives the same result', () => {
    const once  = normaliseDatabaseUrl(BASE);
    const twice = normaliseDatabaseUrl(once);
    expect(twice).toBe(once);
  });

  // ── Preserves existing params ────────────────────────────────────────────

  it('preserves unrelated query params (e.g. sslmode)', () => {
    const url = `${BASE}?sslmode=require&application_name=myapp`;
    const result = normaliseDatabaseUrl(url);
    expect(result).toContain('sslmode=require');
    expect(result).toContain('application_name=myapp');
  });

  it('handles URL that already has all correct params alongside others', () => {
    const url = `${BASE}?pgbouncer=true&connection_limit=1&sslmode=require`;
    const result = normaliseDatabaseUrl(url);
    expect(result).toContain('pgbouncer=true');
    expect(result).toContain('connection_limit=1');
    expect(result).toContain('sslmode=require');
    // Still idempotent
    expect(result.split('pgbouncer=true')).toHaveLength(2);
    expect(result.split('connection_limit=1')).toHaveLength(2);
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  it('returns empty string unchanged', () => {
    expect(normaliseDatabaseUrl('')).toBe('');
  });

  it('handles a URL with only a ? and no params', () => {
    const result = normaliseDatabaseUrl(`${BASE}?`);
    expect(result).toContain('pgbouncer=true');
    expect(result).toContain('connection_limit=1');
    // Should not have double ?
    expect(result.split('?')).toHaveLength(2);
  });
});
