// Attribution encoding integrity test.
//
// Verifies that the exact production Meta ad URL survives the decode-once rule:
//   URLSearchParams.get() at capture → decoded string stored in sessionStorage →
//   form state → payload → DB → GHL.
//
// The canonical rule: URLSearchParams.get() decodes ONCE (+ → space, %xx → char).
// Every downstream hop operates on the already-decoded string unchanged.

import { describe, it, expect, beforeEach } from 'vitest';
import { persistTrackingParams, getTrackingParams } from '../meta/tracking-params';
import { deriveLeadSource } from '../meta/lead-source';

// ── Production fixture URL (exact real campaign URL format) ───────────────────

const FIXTURE_SEARCH = [
  'utm_source=facebook',
  'utm_medium=FSIQ+%7C+ABO_Prospecting+%7C+Leads',
  'utm_campaign=FSIQ-VIDEO-AD-35+%7C+A+Dollar+Saved+is+a+Dollar+Earned+%7C+iPhone+%7C+Broad+%7C+LP2-EB',
  'utm_content=FSIQ-VIDEO-AD-28+%7C+117+%7C+Podcast+Ad+Blurred+Book+%7C+No+Book+%7C+Direct+Offer+%2F+Gift+%7C+Solution+Aware+%7C+LP2-EB+%7C+COPY-02+%7C+60s%2B',
  'fbadid=120246189234770546',
  'utm_id=120229729801330546',
  'utm_term=120246189234780546',
  'fbclid=IwY2xjawSWmELxyzTestValue',
].join('&');

const FIXTURE_URL = `https://go.getfoodserviceiq.com/5provenways?${FIXTURE_SEARCH}`;

// Expected decoded values — URLSearchParams.get() decodes %xx and treats + as space
const EXPECTED = {
  utm_source:    'facebook',
  utm_medium:    'FSIQ | ABO_Prospecting | Leads',
  utm_campaign:  'FSIQ-VIDEO-AD-35 | A Dollar Saved is a Dollar Earned | iPhone | Broad | LP2-EB',
  utm_content:   'FSIQ-VIDEO-AD-28 | 117 | Podcast Ad Blurred Book | No Book | Direct Offer / Gift | Solution Aware | LP2-EB | COPY-02 | 60s+',
  fbadid:        '120246189234770546',
  utm_id:        '120229729801330546',
  utm_term:      '120246189234780546',
  fbclid:        'IwY2xjawSWmELxyzTestValue',
};

// ── URLSearchParams decode — the canonical single decode point ────────────────

describe('URLSearchParams.get() — fixture URL decode', () => {
  const p = new URLSearchParams(new URL(FIXTURE_URL).search);

  it('utm_source decodes cleanly', () =>
    expect(p.get('utm_source')).toBe(EXPECTED.utm_source));

  it('utm_medium: + decoded as space, | preserved (URL-encoded as %7C)', () =>
    expect(p.get('utm_medium')).toBe(EXPECTED.utm_medium));

  it('utm_campaign: + decoded as space, | preserved', () =>
    expect(p.get('utm_campaign')).toBe(EXPECTED.utm_campaign));

  it('utm_content: %2B decoded as literal +, %2F as /, %7C as |, + as space', () => {
    const val = p.get('utm_content')!;
    expect(val).toBe(EXPECTED.utm_content);
    expect(val).toContain('60s+');       // %2B → +
    expect(val).toContain(' / ');        // %2F → /
    expect(val).toContain(' | ');        // %7C → |
    expect(val).not.toContain('%');      // no unresolved percent-encoding remains
  });

  it('fbadid: plain numeric ID unchanged', () =>
    expect(p.get('fbadid')).toBe(EXPECTED.fbadid));

  it('utm_id: plain numeric ID unchanged', () =>
    expect(p.get('utm_id')).toBe(EXPECTED.utm_id));

  it('utm_term: plain numeric ID unchanged', () =>
    expect(p.get('utm_term')).toBe(EXPECTED.utm_term));

  it('fbclid: opaque token unchanged', () =>
    expect(p.get('fbclid')).toBe(EXPECTED.fbclid));
});

// ── persistTrackingParams — write path ───────────────────────────────────────

describe('persistTrackingParams with fixture URL', () => {
  beforeEach(() => {
    sessionStorage.clear();
    window.history.replaceState(null, '', `/?${FIXTURE_SEARCH}`);
  });

  it('stores all params decoded (no re-encoding at sessionStorage write)', () => {
    persistTrackingParams();
    const stored = getTrackingParams();

    expect(stored.utm_source).toBe(EXPECTED.utm_source);
    expect(stored.utm_medium).toBe(EXPECTED.utm_medium);
    expect(stored.utm_campaign).toBe(EXPECTED.utm_campaign);
    expect(stored.utm_content).toBe(EXPECTED.utm_content);
    expect(stored.utm_id).toBe(EXPECTED.utm_id);
    expect(stored.fbadid).toBe(EXPECTED.fbadid);
    expect(stored.utm_term).toBe(EXPECTED.utm_term);
    expect(stored.fbclid).toBe(EXPECTED.fbclid);
  });

  it('utm_content contains no percent-encoding after storage', () => {
    persistTrackingParams();
    const stored = getTrackingParams();
    expect(stored.utm_content).not.toContain('%');
  });

  it('utm_content pipe characters are literal | not encoded', () => {
    persistTrackingParams();
    const stored = getTrackingParams();
    expect(stored.utm_content).toContain(' | ');
  });

  it('first-touch: second call with different URL does not overwrite', () => {
    persistTrackingParams();
    window.history.replaceState(null, '', '/?utm_source=google');
    persistTrackingParams();
    expect(getTrackingParams().utm_source).toBe('facebook');
  });

  it('landing_page_url is always captured and contains the full query string', () => {
    persistTrackingParams();
    const stored = getTrackingParams();
    expect(stored.landing_page_url).toBeDefined();
    expect(stored.landing_page_url).toContain('utm_source=facebook');
    expect(stored.landing_page_url).toContain('fbclid=');
  });
});

// ── deriveLeadSource — fixture URL maps to meta ───────────────────────────────

describe('deriveLeadSource with fixture URL values', () => {
  it('fbclid present → meta (regardless of utm_source)', () =>
    expect(deriveLeadSource('facebook', 'IwY2xjawSWmELxyzTestValue')).toBe('meta'));

  it('utm_source=facebook alone → meta', () =>
    expect(deriveLeadSource('facebook')).toBe('meta'));

  it('no fbclid, utm_source=facebook → meta (fallback)', () =>
    expect(deriveLeadSource('facebook', null)).toBe('meta'));
});

// ── JSON round-trip — values must survive JSON.stringify used in GHL API call ─

describe('JSON round-trip preserves decoded values', () => {
  it('pipe characters, plus signs, and slashes survive JSON.stringify/parse', () => {
    const payload = {
      utm_medium:  EXPECTED.utm_medium,
      utm_content: EXPECTED.utm_content,
    };
    const roundtripped = JSON.parse(JSON.stringify(payload));
    expect(roundtripped.utm_medium).toBe(EXPECTED.utm_medium);
    expect(roundtripped.utm_content).toBe(EXPECTED.utm_content);
    expect(roundtripped.utm_content).toContain('60s+');
    expect(roundtripped.utm_content).toContain(' / ');
    expect(roundtripped.utm_content).toContain(' | ');
  });
});
