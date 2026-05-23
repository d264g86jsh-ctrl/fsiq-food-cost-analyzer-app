// Tests for GET /api/report/[id] proxy route.
// Verifies PDF is served inline with correct headers — no download triggered.
// CSP sandbox headers must NOT be present (they cause Chrome to block the page).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  db: {
    submission: {
      findUnique: vi.fn(),
    },
  },
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

beforeEach(() => {
  vi.resetAllMocks();
});

describe('GET /api/report/[id]', () => {
  describe('successful PDF proxy', () => {
    beforeEach(() => {
      vi.mocked(db.submission.findUnique).mockResolvedValue({
        qualified: true,
        pdfDownloadUrl: 'https://cdn.example.com/report.pdf',
      } as never);

      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
        new Response(MOCK_PDF.buffer, { status: 200 }),
      ));
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

    it('returns 404 when pdfDownloadUrl is null', async () => {
      vi.mocked(db.submission.findUnique).mockResolvedValue({
        qualified: true,
        pdfDownloadUrl: null,
      } as never);
      const res = await GET(makeRequest(), makeParams('no-pdf-id'));
      expect(res.status).toBe(404);
    });

    it('returns 502 when upstream fetch fails', async () => {
      vi.mocked(db.submission.findUnique).mockResolvedValue({
        qualified: true,
        pdfDownloadUrl: 'https://cdn.example.com/report.pdf',
      } as never);
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
      const res = await GET(makeRequest(), makeParams('test-id'));
      expect(res.status).toBe(502);
    });
  });
});
