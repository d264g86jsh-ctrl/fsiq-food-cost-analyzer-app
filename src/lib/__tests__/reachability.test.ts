import { describe, it, expect } from 'vitest';
import { classifyReachability } from '../website/reachability';

describe('classifyReachability', () => {
  it('HTTP 200 → reachable', () => {
    const r = classifyReachability({ httpStatus: 200, bodyTextLength: 500 });
    expect(r.status).toBe('reachable');
    expect(r.internalFlags).toEqual([]);
  });

  it('HTTP 200 with thin body → thin', () => {
    const r = classifyReachability({ httpStatus: 200, bodyTextLength: 50 });
    expect(r.status).toBe('thin');
    expect(r.internalFlags).toContain('thin_content');
  });

  it('HTTP 200 with exactly 200 chars body → reachable (boundary)', () => {
    const r = classifyReachability({ httpStatus: 200, bodyTextLength: 200 });
    expect(r.status).toBe('reachable');
  });

  it('HTTP 404 → invalid', () => {
    const r = classifyReachability({ httpStatus: 404 });
    expect(r.status).toBe('invalid');
    expect(r.internalFlags).toContain('http_404');
    expect(r.userFacingMessage).toBeTruthy();
  });

  it('DNS NXDOMAIN → invalid', () => {
    const r = classifyReachability({ httpStatus: 0, errorType: 'dns_nxdomain' });
    expect(r.status).toBe('invalid');
    expect(r.internalFlags).toContain('dns_nxdomain');
    expect(r.userFacingMessage).toBeTruthy();
  });

  it('HTTP 403 → blocked', () => {
    const r = classifyReachability({ httpStatus: 403 });
    expect(r.status).toBe('blocked');
    expect(r.internalFlags).toContain('http_403');
    expect(r.userFacingMessage).toBeNull();
  });

  it('HTTP 503 → blocked', () => {
    const r = classifyReachability({ httpStatus: 503 });
    expect(r.status).toBe('blocked');
    expect(r.internalFlags).toContain('http_503');
  });

  it('HTTP 500 → blocked', () => {
    const r = classifyReachability({ httpStatus: 500 });
    expect(r.status).toBe('blocked');
    expect(r.internalFlags).toContain('http_500');
  });

  it('HTTP 502 → blocked', () => {
    const r = classifyReachability({ httpStatus: 502 });
    expect(r.status).toBe('blocked');
    expect(r.internalFlags).toContain('http_502');
  });

  it('HTTP 520 (Cloudflare) → blocked with cloudflare_error flag', () => {
    const r = classifyReachability({ httpStatus: 520 });
    expect(r.status).toBe('blocked');
    expect(r.internalFlags).toContain('cloudflare_error');
  });

  it('Timeout → inaccessible', () => {
    const r = classifyReachability({ httpStatus: 0, errorType: 'timeout' });
    expect(r.status).toBe('inaccessible');
    expect(r.internalFlags).toContain('connection_timeout');
    expect(r.userFacingMessage).toBeNull();
  });

  it('Abort → inaccessible with request_timeout flag', () => {
    const r = classifyReachability({ httpStatus: 0, errorType: 'abort' });
    expect(r.status).toBe('inaccessible');
    expect(r.internalFlags).toContain('request_timeout');
  });

  it('SSL error → blocked', () => {
    const r = classifyReachability({ httpStatus: 0, errorType: 'ssl_error' });
    expect(r.status).toBe('blocked');
    expect(r.internalFlags).toContain('ssl_error');
  });

  it('Redirect loop → inaccessible', () => {
    const r = classifyReachability({ httpStatus: 0, errorType: 'redirect_loop' });
    expect(r.status).toBe('inaccessible');
    expect(r.internalFlags).toContain('redirect_loop');
  });

  it('Redirect to instagram → redirected with redirects_to_social flag', () => {
    const r = classifyReachability({
      httpStatus: 200,
      bodyTextLength: 1000,
      finalUrl: 'https://instagram.com/casaroberto',
      originalUrl: 'https://casaroberto.com',
    });
    expect(r.status).toBe('redirected');
    expect(r.internalFlags).toContain('redirects_to_social');
  });

  it('Redirect to doordash → redirected with redirects_to_ordering_platform flag', () => {
    const r = classifyReachability({
      httpStatus: 200,
      bodyTextLength: 1000,
      finalUrl: 'https://doordash.com/store/casa-roberto',
      originalUrl: 'https://casaroberto.com',
    });
    expect(r.status).toBe('redirected');
    expect(r.internalFlags).toContain('redirects_to_ordering_platform');
  });

  it('HTTP 429 → blocked', () => {
    const r = classifyReachability({ httpStatus: 429 });
    expect(r.status).toBe('blocked');
    expect(r.internalFlags).toContain('http_429');
  });

  it('HTTP 401 → blocked', () => {
    const r = classifyReachability({ httpStatus: 401 });
    expect(r.status).toBe('blocked');
    expect(r.internalFlags).toContain('http_401');
  });
});
