// Tests for GET /api/report/[id] proxy route.
// Verifies PDF is served inline with correct headers — no download triggered.
// CSP sandbox headers must NOT be present (they cause Chrome to block the page).
// Verifies Strategy 1 (PDFMonkey fresh URL) uses a SINGLE fetch and offloads
// caching to background via waitUntil — the prior double-fetch was the root cause
// of white-page on first visit when Vercel killed the function at the 15s default.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

// vi.hoisted ensures waitUntilMock is initialized before vi.mock factories run
const { waitUntilMock } = vi.hoisted(() => ({ waitUntilMock: vi.fn() }));

vi.mock('@/lib/db', () => ({
  db: {
    submission: {
      findUnique: vi.fn(),
      update:     vi.fn().mockResolvedValue({}),
    },
  },
}));

// Mock @vercel/functions so waitUntil can be captured without causing import errors
vi.mock('@vercel/functions', () => ({ waitUntil: waitUntilMock }));

// Mock pdf-cache so tests are isolated from Supabase
vi.mock('@/lib/pdf/pdf-cache', () => ({
  cachePdfToSupabase:  vi.fn().mockResolvedValue({ url: 'https://supabase.example.com/cached.pdf', cachedAt: new Date() }),
  verifyCachedPdfUrl:  vi.fn().mockResolvedValue('https://supabase.example.com/cached.pdf'),
  fetchAndCache:       vi.fn().mockResolvedValue(null),
}));

import { db } from '@/lib/db';
import { GET } from '@/app/api/report/[id]/route';

const MOCK_PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF magic bytes

function makeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeRequest() {
  return new NextRequest('http://localhost/api/report/test-id');
}

beforeEach(async () => {
  vi.resetAllMocks();
  waitUntilMock.mockReset();
  // Re-apply stable defaults for pdf-cache mocks after resetAllMocks wipes them
  const pdfCache = await import('@/lib/pdf/pdf-cache');
  vi.mocked(pdfCache.cachePdfToSupabase).mockResolvedValue({ url: 'https://supabase.example.com/cached.pdf', cachedAt: new Date() });
  vi.mocked(pdfCache.verifyCachedPdfUrl).mockResolvedValue('https://supabase.example.com/cached.pdf');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// ── Strategy 1: PDFMonkey fresh URL ──────────────────────────────────────────

describe('Strategy 1 — PDFMonkey fresh URL (pdfMonkeyDocumentId present)', () => {
  beforeEach(() => {
    vi.stubEnv('PDFMONKEY_API_KEY', 'test-key');
    vi.mocked(db.submission.findUnique).mockResolvedValue({
      qualified:           true,
      pdfMonkeyDocumentId: 'doc_123',
      pdfDownloadUrl:      'https://old.s3.example.com/old.pdf',
      pdfCachedUrl:        null,
    } as never);

    // First fetch: PDFMonkey API returns fresh URL
    // Second fetch: S3 returns the PDF bytes
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ document: { download_url: 'https://s3.example.com/fresh.pdf' } }), { status: 200 }))
      .mockResolvedValueOnce(new Response(MOCK_PDF.buffer, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  it('returns 200 with the PDF bytes', async () => {
    const res = await GET(makeRequest(), makeParams('sub_123'));
    expect(res.status).toBe(200);
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body).toEqual(MOCK_PDF);
  });

  it('uses exactly ONE fetch to S3 — not two (single-fetch fix)', async () => {
    await GET(makeRequest(), makeParams('sub_123'));
    const fetchMock = vi.mocked(global.fetch as ReturnType<typeof vi.fn>);
    // 2 total calls: 1 PDFMonkey API + 1 S3 fetch (NOT 3)
    expect(fetchMock.mock.calls).toHaveLength(2);
    const s3Calls = fetchMock.mock.calls.filter(([url]) => String(url).includes('s3.example.com/fresh.pdf'));
    expect(s3Calls).toHaveLength(1);
  });

  it('schedules cache write via waitUntil — does NOT block the response', async () => {
    await GET(makeRequest(), makeParams('sub_123'));
    // waitUntil should have been called once for the background cache
    expect(waitUntilMock).toHaveBeenCalledOnce();
    // The response arrives before the waitUntil promise settles (non-blocking)
  });

  it('does NOT call waitUntil when pdfCachedUrl already exists', async () => {
    vi.mocked(db.submission.findUnique).mockResolvedValue({
      qualified:           true,
      pdfMonkeyDocumentId: 'doc_123',
      pdfDownloadUrl:      null,
      pdfCachedUrl:        'https://supabase.example.com/cached.pdf',
    } as never);
    await GET(makeRequest(), makeParams('sub_123'));
    expect(waitUntilMock).not.toHaveBeenCalled();
  });

  it('falls through to Strategy 2 when PDFMonkey API returns non-OK', async () => {
    const { verifyCachedPdfUrl } = await import('@/lib/pdf/pdf-cache');
    vi.mocked(db.submission.findUnique).mockResolvedValue({
      qualified:           true,
      pdfMonkeyDocumentId: 'doc_123',
      pdfDownloadUrl:      null,
      pdfCachedUrl:        'https://supabase.example.com/cached.pdf',
    } as never);
    vi.mocked(verifyCachedPdfUrl).mockResolvedValue('https://supabase.example.com/cached.pdf');
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))  // PDFMonkey API fails
      .mockResolvedValueOnce(new Response(MOCK_PDF.buffer, { status: 200 })),  // Supabase cache
    );
    const res = await GET(makeRequest(), makeParams('sub_123'));
    expect(res.status).toBe(200);
  });
});

// ── Strategy 2: Supabase cached copy ─────────────────────────────────────────

describe('Strategy 2 — Supabase cached copy (pdfCachedUrl present)', () => {
  beforeEach(() => {
    vi.mocked(db.submission.findUnique).mockResolvedValue({
      qualified:           true,
      pdfMonkeyDocumentId: null,
      pdfDownloadUrl:      null,
      pdfCachedUrl:        'https://supabase.example.com/cached.pdf',
    } as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(MOCK_PDF.buffer, { status: 200 })));
  });

  it('serves PDF from Supabase cache', async () => {
    const res = await GET(makeRequest(), makeParams('cached-id'));
    expect(res.status).toBe(200);
  });
});

// ── Strategy 3: stored download_url ──────────────────────────────────────────

describe('GET /api/report/[id] — stored URL fallback (Strategy 3)', () => {
  beforeEach(() => {
    vi.mocked(db.submission.findUnique).mockResolvedValue({
      qualified:           true,
      pdfMonkeyDocumentId: null,
      pdfCachedUrl:        null,
      pdfDownloadUrl:      'https://cdn.example.com/report.pdf',
    } as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(MOCK_PDF.buffer, { status: 200 })));
  });

  it('returns 200', async () => {
    const res = await GET(makeRequest(), makeParams('test-id'));
    expect(res.status).toBe(200);
  });

  it('sets Content-Type: application/pdf', async () => {
    const res = await GET(makeRequest(), makeParams('test-id'));
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
  });

  it('sets Content-Disposition with inline — no download', async () => {
    const res = await GET(makeRequest(), makeParams('test-id'));
    const cd = res.headers.get('Content-Disposition') ?? '';
    expect(cd).toContain('inline');
    expect(cd).not.toContain('attachment');
  });

  it('sets Content-Disposition filename to Food-Cost-Analyzer.pdf', async () => {
    const res = await GET(makeRequest(), makeParams('test-id'));
    const cd = res.headers.get('Content-Disposition') ?? '';
    expect(cd).toContain('filename="Food-Cost-Analyzer.pdf"');
  });

  it('does NOT set Content-Security-Policy — CSP sandbox causes Chrome block', async () => {
    const res = await GET(makeRequest(), makeParams('test-id'));
    expect(res.headers.get('Content-Security-Policy')).toBeNull();
  });

  it('proxies the PDF bytes from upstream', async () => {
    const res = await GET(makeRequest(), makeParams('test-id'));
    const body = new Uint8Array(await res.arrayBuffer());
    expect(body).toEqual(MOCK_PDF);
  });
});

// ── Error cases ───────────────────────────────────────────────────────────────

describe('error cases', () => {
  it('returns 404 when submission is not found', async () => {
    vi.mocked(db.submission.findUnique).mockResolvedValue(null);
    const res = await GET(makeRequest(), makeParams('missing-id'));
    expect(res.status).toBe(404);
  });

  it('returns 404 when submission is not qualified', async () => {
    vi.mocked(db.submission.findUnique).mockResolvedValue({
      qualified: false,
      pdfDownloadUrl: 'https://cdn.example.com/report.pdf',
    } as never);
    const res = await GET(makeRequest(), makeParams('dq-id'));
    expect(res.status).toBe(404);
  });

  it('returns 410 when all URL strategies exhausted (no docId, no cache, no stored URL)', async () => {
    vi.mocked(db.submission.findUnique).mockResolvedValue({
      qualified:           true,
      pdfDownloadUrl:      null,
      pdfMonkeyDocumentId: null,
      pdfCachedUrl:        null,
    } as never);
    const res = await GET(makeRequest(), makeParams('no-pdf-id'));
    expect(res.status).toBe(410);
  });

  it('returns 410 when all upstream fetches fail (PDFMonkey unreachable, no cache)', async () => {
    vi.mocked(db.submission.findUnique).mockResolvedValue({
      qualified:           true,
      pdfDownloadUrl:      'https://cdn.example.com/report.pdf',
      pdfMonkeyDocumentId: null,
      pdfCachedUrl:        null,
    } as never);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    const res = await GET(makeRequest(), makeParams('test-id'));
    expect(res.status).toBe(410);
  });
});
