// Tests for /report/[id] page component.
// Verifies iframe src points to the proxy route and no sandbox attribute is present.
// sandbox on the iframe causes Chrome to block the page — it must not be set.

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
}));

import { db } from '@/lib/db';
import ReportPage from '@/app/report/[id]/page';

function makeParams(id: string) {
  return Promise.resolve({ id });
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe('ReportPage', () => {
  describe('qualified submission', () => {
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

    it('iframe has NO sandbox attribute — sandbox causes Chrome security block', async () => {
      const html = await getHtml();
      expect(html).not.toContain('sandbox');
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
