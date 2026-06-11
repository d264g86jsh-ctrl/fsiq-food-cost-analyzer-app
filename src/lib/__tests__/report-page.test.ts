// Tests for /report/[id] page component.
// Verifies proxy-route src, no sandbox attribute, and mobile UA redirect.
//
// next/headers is mocked because Vitest runs outside Next.js request scope.
// The production behavior is unaffected — headers() is only called at runtime.
// redirect() is mocked to capture redirect targets without throwing NEXT_REDIRECT.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToString } from 'react-dom/server';

vi.mock('@/lib/db', () => ({
  db: {
    submission: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('next/navigation', () => ({
  notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND'); }),
  redirect: vi.fn(() => { throw new Error('NEXT_REDIRECT'); }),
}));

// Mock next/headers so the page can run outside a Next.js request context.
// Each test can override the mock to simulate different User-Agent values.
vi.mock('next/headers', () => ({
  headers: vi.fn(),
}));

import { db } from '@/lib/db';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import ReportPage from '@/app/report/[id]/page';

function makeParams(id: string) {
  return Promise.resolve({ id });
}

function mockHeaders(ua: string) {
  vi.mocked(headers).mockResolvedValue({
    get: (key: string) => (key === 'user-agent' ? ua : null),
  } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  // Default: desktop UA → page renders iframe (no redirect)
  mockHeaders('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
});

describe('ReportPage', () => {
  describe('qualified submission — desktop', () => {
    beforeEach(() => {
      vi.mocked(db.submission.findUnique).mockResolvedValue({
        qualified: true,
        pdfDownloadUrl: 'https://cdn.example.com/report.pdf',
      } as never);
    });

    async function getHtml(id = 'abc123') {
      const ui = await ReportPage({ params: makeParams(id) });
      return renderToString(ui);
    }

    it('renders an iframe element', async () => {
      expect(await getHtml()).toContain('<iframe');
    });

    it('iframe src points to proxy route — not a raw URL', async () => {
      const html = await getHtml('abc123');
      expect(html).toContain('/api/report/abc123');
      expect(html).not.toContain('pdfmonkey');
      expect(html).not.toContain('cdn.example.com');
    });

    // Hard rule: sandbox on the iframe causes Chrome to block the PDF page entirely.
    // This must never be set. See docs/hard-rules.md.
    it('iframe has NO sandbox attribute — sandbox causes Chrome security block', async () => {
      const html = await getHtml();
      expect(html).not.toContain('sandbox');
    });
  });

  describe('qualified submission — mobile UA redirect', () => {
    beforeEach(() => {
      vi.mocked(db.submission.findUnique).mockResolvedValue({
        qualified: true,
        pdfDownloadUrl: 'https://cdn.example.com/report.pdf',
      } as never);
    });

    it('iPhone UA → redirects to /api/report/[id] (mobile PDF viewer, not iframe)', async () => {
      mockHeaders('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
      await expect(ReportPage({ params: makeParams('abc123') })).rejects.toThrow('NEXT_REDIRECT');
      expect(redirect).toHaveBeenCalledWith('/api/report/abc123');
    });

    it('Android UA → redirects to proxy route', async () => {
      mockHeaders('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Mobile Safari/537.36');
      await expect(ReportPage({ params: makeParams('sub001') })).rejects.toThrow('NEXT_REDIRECT');
      expect(redirect).toHaveBeenCalledWith('/api/report/sub001');
    });

    it('desktop UA → renders iframe page, no redirect', async () => {
      mockHeaders('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
      const ui = await ReportPage({ params: makeParams('abc123') });
      const html = renderToString(ui);
      expect(html).toContain('<iframe');
      expect(redirect).not.toHaveBeenCalled();
    });
  });

  describe('unqualified / missing submission', () => {
    it('calls notFound() when submission is missing', async () => {
      vi.mocked(db.submission.findUnique).mockResolvedValue(null);
      await expect(ReportPage({ params: makeParams('missing') })).rejects.toThrow('NEXT_NOT_FOUND');
    });

    it('calls notFound() when not qualified', async () => {
      vi.mocked(db.submission.findUnique).mockResolvedValue({
        qualified: false,
        pdfDownloadUrl: 'https://cdn.example.com/report.pdf',
      } as never);
      await expect(ReportPage({ params: makeParams('dq') })).rejects.toThrow('NEXT_NOT_FOUND');
    });

    it('calls notFound() when pdfDownloadUrl is null', async () => {
      vi.mocked(db.submission.findUnique).mockResolvedValue({
        qualified: true,
        pdfDownloadUrl: null,
      } as never);
      await expect(ReportPage({ params: makeParams('no-pdf') })).rejects.toThrow('NEXT_NOT_FOUND');
    });
  });
});
