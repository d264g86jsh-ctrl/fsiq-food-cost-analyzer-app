// Tests for generatePdf.
// All fetch calls are mocked — no real network requests.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GeneratePdfInput } from '../pdf/pdf-types';

// ── Fixture ───────────────────────────────────────────────────────────────────

const baseInput: GeneratePdfInput = {
  restaurantName:       'Casa Roberto',
  fullName:             'Maria Garcia',
  conceptType:          'Casual dining',
  locations:            '2 – 4 locations',
  annualSpend:          2_000_000,
  spendBucket:          '$1M–$3M',
  finalPctDisplay:      '7.4%',
  dollarEstimateDisplay: '$147,000',
  dollarEstimate:       147_000,
  caseStudy:            "MaryAnn's Diner",
  year1:                147_000,
  year2:                152_733,
  year3:                158_690,
  year4:                164_879,
  year5:                171_310,
  projectionHeights:    { year1: 18, year2: 38, year3: 58, year4: 78, year5: 100 },
  logoUrl:              'https://casaroberto.com/logo.png',
  businessSummary:      'Casa Roberto is a casual Mexican restaurant.',
  narrativeDistributor: 'Distributor copy.',
  narrativeProcurement: 'Procurement copy.',
  narrativeSku:         'SKU copy.',
  mode:                 'full',
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

const successBody = {
  document: {
    id: 'doc_abc123',
    download_url: 'https://cdn.pdfmonkey.io/doc_abc123.pdf',
    status: 'generating',
  },
};

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.stubEnv('PDFMONKEY_API_KEY', 'test-api-key');
  vi.stubEnv('PDFMONKEY_TEMPLATE_ID', 'tmpl_test123');
  vi.stubGlobal('fetch', mockFetch(200, successBody));
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('generatePdf — missing credentials', () => {
  it('returns skipped when PDFMONKEY_API_KEY is missing', async () => {
    vi.stubEnv('PDFMONKEY_API_KEY', '');
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await generatePdf(baseInput);
    expect(r.pdfStatus).toBe('skipped');
    expect(r.pdfDownloadUrl).toBeNull();
    expect(r.pdfError).toMatch(/not configured/i);
  });

  it('returns skipped when PDFMONKEY_TEMPLATE_ID is missing', async () => {
    vi.stubEnv('PDFMONKEY_TEMPLATE_ID', '');
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await generatePdf(baseInput);
    expect(r.pdfStatus).toBe('skipped');
  });

  it('skipped result has pdfMode set', async () => {
    vi.stubEnv('PDFMONKEY_API_KEY', '');
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await generatePdf(baseInput);
    expect(r.pdfMode).toBe('full');
  });
});

describe('generatePdf — successful API call', () => {
  it('returns pdfStatus complete on 200', async () => {
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await generatePdf(baseInput);
    expect(r.pdfStatus).toBe('complete');
    expect(r.pdfError).toBeNull();
  });

  it('returns pdfMonkeyDocumentId', async () => {
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await generatePdf(baseInput);
    expect(r.pdfMonkeyDocumentId).toBe('doc_abc123');
  });

  it('returns pdfDownloadUrl', async () => {
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await generatePdf(baseInput);
    expect(r.pdfDownloadUrl).toBe('https://cdn.pdfmonkey.io/doc_abc123.pdf');
  });

  it('returns pdfMode matching input mode', async () => {
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await generatePdf(baseInput);
    expect(r.pdfMode).toBe('full');
  });

  it('pdfRetryCount is 0 on success', async () => {
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await generatePdf(baseInput);
    expect(r.pdfRetryCount).toBe(0);
  });
});

describe('generatePdf — API error responses', () => {
  it('returns pdfStatus error on 422', async () => {
    vi.stubGlobal('fetch', mockFetch(422, { errors: ['invalid template'] }));
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await generatePdf(baseInput);
    expect(r.pdfStatus).toBe('error');
    expect(r.pdfError).toMatch(/422/);
  });

  it('returns pdfStatus error on 500', async () => {
    vi.stubGlobal('fetch', mockFetch(500, { message: 'internal server error' }));
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await generatePdf(baseInput);
    expect(r.pdfStatus).toBe('error');
  });

  it('error result has null pdfDownloadUrl', async () => {
    vi.stubGlobal('fetch', mockFetch(500, {}));
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await generatePdf(baseInput);
    expect(r.pdfDownloadUrl).toBeNull();
  });

  it('returns error when response is missing document.id', async () => {
    vi.stubGlobal('fetch', mockFetch(200, { document: {} }));
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await generatePdf(baseInput);
    expect(r.pdfStatus).toBe('error');
    expect(r.pdfError).toMatch(/missing/i);
  });
});

describe('generatePdf — network/throw errors', () => {
  it('returns error on fetch throw', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network timeout')));
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await generatePdf(baseInput);
    expect(r.pdfStatus).toBe('error');
    expect(r.pdfError).toContain('Network timeout');
  });

  it('does not throw — always returns a result', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const { generatePdf } = await import('../pdf/pdfmonkey');
    await expect(generatePdf(baseInput)).resolves.toBeDefined();
  });
});

describe('generatePdf — conservative mode', () => {
  it('returns pdfMode conservative', async () => {
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await generatePdf({ ...baseInput, mode: 'conservative' });
    expect(r.pdfMode).toBe('conservative');
  });
});

describe('generatePdf — fetch call shape', () => {
  it('calls PDFMonkey API with Authorization header', async () => {
    const mockFetchFn = mockFetch(200, successBody);
    vi.stubGlobal('fetch', mockFetchFn);
    const { generatePdf } = await import('../pdf/pdfmonkey');
    await generatePdf(baseInput);
    const [, options] = mockFetchFn.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-api-key');
  });

  it('calls PDFMonkey API with correct URL', async () => {
    const mockFetchFn = mockFetch(200, successBody);
    vi.stubGlobal('fetch', mockFetchFn);
    const { generatePdf } = await import('../pdf/pdfmonkey');
    await generatePdf(baseInput);
    const [url] = mockFetchFn.mock.calls[0] as [string];
    expect(url).toContain('pdfmonkey.io');
  });

  it('sends document_template_id in body', async () => {
    const mockFetchFn = mockFetch(200, successBody);
    vi.stubGlobal('fetch', mockFetchFn);
    const { generatePdf } = await import('../pdf/pdfmonkey');
    await generatePdf(baseInput);
    const [, options] = mockFetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    expect(body.document.document_template_id).toBe('tmpl_test123');
  });

  it('sends payload as stringified JSON', async () => {
    const mockFetchFn = mockFetch(200, successBody);
    vi.stubGlobal('fetch', mockFetchFn);
    const { generatePdf } = await import('../pdf/pdfmonkey');
    await generatePdf(baseInput);
    const [, options] = mockFetchFn.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string);
    const payload = JSON.parse(body.document.payload);
    expect(payload).toHaveProperty('restaurantName');
    expect(payload).toHaveProperty('reportDate');
  });
});
