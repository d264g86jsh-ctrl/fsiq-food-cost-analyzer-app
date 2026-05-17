import { describe, it, expect, beforeEach } from 'vitest';
import {
  persistTrackingParams,
  getTrackingParams,
  readMetaCookies,
} from '../meta/tracking-params';

const STORAGE_KEY = 'fsiq_tracking';

beforeEach(() => {
  sessionStorage.clear();
  // Reset URL to plain origin between tests
  window.history.replaceState(null, '', '/');
  Object.defineProperty(document, 'referrer', { value: '', configurable: true });
  Object.defineProperty(document, 'cookie', { value: '', configurable: true, writable: true });
});

// ── persistTrackingParams ─────────────────────────────────────────────────────

describe('persistTrackingParams', () => {
  it('writes URL params and landing_page_url on first call', () => {
    window.history.replaceState(null, '', '/?utm_source=facebook&utm_medium=cpc&fbclid=abc123');
    persistTrackingParams();
    const stored = getTrackingParams();
    expect(stored.utm_source).toBe('facebook');
    expect(stored.utm_medium).toBe('cpc');
    expect(stored.fbclid).toBe('abc123');
    expect(stored.landing_page_url).toContain('utm_source=facebook');
  });

  it('captures new Phase 9 params: utm_id, fbadid, creative_name, creative_id, campaign', () => {
    window.history.replaceState(
      null, '',
      '/?utm_id=uid1&fbadid=ad42&creative_name=hero&creative_id=c99&campaign=spring',
    );
    persistTrackingParams();
    const stored = getTrackingParams();
    expect(stored.utm_id).toBe('uid1');
    expect(stored.fbadid).toBe('ad42');
    expect(stored.creative_name).toBe('hero');
    expect(stored.creative_id).toBe('c99');
    expect(stored.campaign).toBe('spring');
  });

  it('does not overwrite on second call (first-touch)', () => {
    window.history.replaceState(null, '', '/?utm_source=facebook');
    persistTrackingParams();

    window.history.replaceState(null, '', '/?utm_source=google');
    persistTrackingParams(); // should not overwrite

    expect(getTrackingParams().utm_source).toBe('facebook');
  });

  it('stores empty object when no params are present', () => {
    persistTrackingParams();
    const stored = getTrackingParams();
    expect(stored.utm_source).toBeUndefined();
    expect(stored.fbclid).toBeUndefined();
    expect(stored.landing_page_url).toBeDefined();
  });
});

// ── getTrackingParams ─────────────────────────────────────────────────────────

describe('getTrackingParams', () => {
  it('returns empty object when sessionStorage is empty', () => {
    expect(getTrackingParams()).toEqual({});
  });

  it('returns parsed stored params', () => {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ utm_source: 'email', utm_medium: 'newsletter' }));
    const params = getTrackingParams();
    expect(params.utm_source).toBe('email');
    expect(params.utm_medium).toBe('newsletter');
  });

  it('returns empty object on corrupt JSON', () => {
    sessionStorage.setItem(STORAGE_KEY, 'not-json{{{');
    expect(getTrackingParams()).toEqual({});
  });
});

// ── readMetaCookies ───────────────────────────────────────────────────────────

describe('readMetaCookies', () => {
  it('reads fbp and fbc from cookies', () => {
    Object.defineProperty(document, 'cookie', {
      value: '_fbp=fb.1.123.abc; _fbc=fb.1.456.def',
      configurable: true,
    });
    const { fbp, fbc } = readMetaCookies();
    expect(fbp).toBe('fb.1.123.abc');
    expect(fbc).toBe('fb.1.456.def');
  });

  it('derives fbc from fbclid when _fbc cookie is absent', () => {
    Object.defineProperty(document, 'cookie', {
      value: '_fbp=fb.1.123.abc',
      configurable: true,
    });
    const { fbc } = readMetaCookies('myfbclid123');
    expect(fbc).toMatch(/^fb\.1\.\d+\.myfbclid123$/);
  });

  it('returns undefined fbc when no _fbc cookie and no fbclid', () => {
    Object.defineProperty(document, 'cookie', { value: '', configurable: true });
    const { fbc } = readMetaCookies();
    expect(fbc).toBeUndefined();
  });

  it('returns empty object when cookies are empty', () => {
    Object.defineProperty(document, 'cookie', { value: '', configurable: true });
    const result = readMetaCookies();
    expect(result.fbp).toBeUndefined();
    expect(result.fbc).toBeUndefined();
  });
});
