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

// status: 'success' so the poll resolves on the first attempt.
const VIEWER_URL = 'https://preview.pdfmonkey.io/pdf/web/viewer.html?file=https%3A%2F%2Fpreview.pdfmonkey.io%2Fdocument-render%2Fdoc_abc123%2Ftest-token';
const successBody = {
  document: {
    id: 'doc_abc123',
    download_url: 'https://cdn.pdfmonkey.io/doc_abc123.pdf',
    preview_url: VIEWER_URL,
    status: 'success',
  },
};

const safeTemplateBody = `
<div class="cover-logos">
      {% if hasLogo and logoUrl != blank %}
        <div class="cover-operator-logo">
          <img src="{{ logoUrl }}" alt="{{ restaurantName }}">
        </div>
      {% endif %}
      <div class="fsiq-cover-logo">
        <img src="data:image/png;base64,abc" alt="FoodServiceIQ">
      </div>
</div>
<a href="{{ calendlyUrl }}" target="_blank">Book</a>`;

const unsafeTemplateBody = `
<div class="cover-logos">
      <div class="cover-operator-logo">
      {% if hasLogo %}
  <img src="{{ logoUrl }}" alt="{{ restaurantName }}"
       onerror="this.onerror=null; this.src=this.nextElementSibling.src;"
       style="max-width:80%; max-height:80%; object-fit:contain;">
  <img src="data:image/png;base64,badfallback" style="display:none;">
{% else %}
  <img src="data:image/png;base64,badfallback" alt="FoodServiceIQ">
{% endif %}
      </div>
      <div class="fsiq-cover-logo">
        <img src="data:image/png;base64,abc" alt="FoodServiceIQ">
      </div>
</div>
<a href="https://calendly.com/neil-foodserviceiq/15-minute-meeting-clone-1">Book</a>`;

const templateBody = {
  document_template: {
    body: safeTemplateBody,
    body_draft: safeTemplateBody,
  },
};

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockImplementation((input: unknown) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    const isTemplate = url.includes('/document_templates/');
    const responseBody = isTemplate ? templateBody : body;
    const responseStatus = isTemplate ? 200 : status;

    return Promise.resolve({
      ok: responseStatus >= 200 && responseStatus < 300,
      status: responseStatus,
      headers: { get: () => null },
      json: () => Promise.resolve(responseBody),
      text: () => Promise.resolve(JSON.stringify(responseBody)),
    });
  });
}

// Helper: run generatePdf while advancing fake timers so the poll resolves.
async function runWithTimers<T>(fn: () => Promise<T>): Promise<T> {
  const promise = fn();
  await vi.runAllTimersAsync();
  return promise;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers();
  vi.stubEnv('PDFMONKEY_API_KEY', 'test-api-key');
  vi.stubEnv('PDFMONKEY_TEMPLATE_ID', 'tmpl_test123');
  vi.stubGlobal('fetch', mockFetch(200, successBody));
});

afterEach(() => {
  vi.useRealTimers();
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
    const r = await runWithTimers(() => generatePdf(baseInput));
    expect(r.pdfStatus).toBe('complete');
    expect(r.pdfError).toBeNull();
  });

  it('returns pdfMonkeyDocumentId', async () => {
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await runWithTimers(() => generatePdf(baseInput));
    expect(r.pdfMonkeyDocumentId).toBe('doc_abc123');
  });

  it('returns pdfDownloadUrl as web viewer URL (preview_url preferred over download_url)', async () => {
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await runWithTimers(() => generatePdf(baseInput));
    expect(r.pdfDownloadUrl).toBe(VIEWER_URL);
  });

  it('returns pdfUrlType viewer when preview_url is present', async () => {
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await runWithTimers(() => generatePdf(baseInput));
    expect(r.pdfUrlType).toBe('viewer');
  });

  it('falls back to download_url when preview_url is absent', async () => {
    const noPreview = {
      document: { id: 'doc_abc123', download_url: 'https://cdn.pdfmonkey.io/doc_abc123.pdf', status: 'success' },
    };
    vi.stubGlobal('fetch', mockFetch(200, noPreview));
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await runWithTimers(() => generatePdf(baseInput));
    expect(r.pdfDownloadUrl).toBe('https://cdn.pdfmonkey.io/doc_abc123.pdf');
    expect(r.pdfUrlType).toBe('download');
  });

  it('returns pdfUrlType null on error', async () => {
    vi.stubGlobal('fetch', mockFetch(500, {}));
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await generatePdf(baseInput);
    expect(r.pdfUrlType).toBeNull();
  });

  it('returns error immediately when status is success but both URLs are null', async () => {
    const successNoUrl = {
      document: { id: 'doc_abc123', download_url: null, preview_url: null, status: 'success' },
    };
    vi.stubGlobal('fetch', mockFetch(200, successNoUrl));
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await runWithTimers(() => generatePdf(baseInput));
    expect(r.pdfStatus).toBe('error');
    expect(r.pdfError).toMatch(/success status but no url/i);
    expect(r.pdfUrlType).toBeNull();
  });

  it('returns pdfMode matching input mode', async () => {
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await runWithTimers(() => generatePdf(baseInput));
    expect(r.pdfMode).toBe('full');
  });

  it('pdfRetryCount is 0 on success', async () => {
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await runWithTimers(() => generatePdf(baseInput));
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
    const r = await runWithTimers(() => generatePdf({ ...baseInput, mode: 'conservative' }));
    expect(r.pdfMode).toBe('conservative');
  });
});

describe('generatePdf — fetch call shape', () => {
  // NOTE: PDF generation now performs logo validation and template safety checks
  // before the document POST. Use findDocumentPost() for the creation request.

  it('calls PDFMonkey API with Authorization header', async () => {
    const mockFetchFn = mockFetch(200, successBody);
    vi.stubGlobal('fetch', mockFetchFn);
    const { generatePdf } = await import('../pdf/pdfmonkey');
    await runWithTimers(() => generatePdf(baseInput));
    const pdfCall = findDocumentPost(mockFetchFn.mock.calls);
    expect(pdfCall).toBeDefined();
    const options = pdfCall![1] as RequestInit;
    const headers = options.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer test-api-key');
  });

  it('calls PDFMonkey API with correct URL', async () => {
    const mockFetchFn = mockFetch(200, successBody);
    vi.stubGlobal('fetch', mockFetchFn);
    const { generatePdf } = await import('../pdf/pdfmonkey');
    await runWithTimers(() => generatePdf(baseInput));
    const pdfCall = findDocumentPost(mockFetchFn.mock.calls);
    expect(pdfCall).toBeDefined();
    expect(pdfCall![0] as string).toContain('pdfmonkey.io');
  });

  it('sends document_template_id in body', async () => {
    const mockFetchFn = mockFetch(200, successBody);
    vi.stubGlobal('fetch', mockFetchFn);
    const { generatePdf } = await import('../pdf/pdfmonkey');
    await runWithTimers(() => generatePdf(baseInput));
    const pdfCall = findDocumentPost(mockFetchFn.mock.calls);
    expect(pdfCall).toBeDefined();
    const body = JSON.parse((pdfCall![1] as RequestInit).body as string);
    expect(body.document.document_template_id).toBe('tmpl_test123');
  });

  it('sends payload as stringified JSON', async () => {
    const mockFetchFn = mockFetch(200, successBody);
    vi.stubGlobal('fetch', mockFetchFn);
    const { generatePdf } = await import('../pdf/pdfmonkey');
    await runWithTimers(() => generatePdf(baseInput));
    const pdfCall = findDocumentPost(mockFetchFn.mock.calls);
    expect(pdfCall).toBeDefined();
    const body = JSON.parse((pdfCall![1] as RequestInit).body as string);
    const payload = JSON.parse(body.document.payload);
    expect(payload).toHaveProperty('restaurantName');
    expect(payload).toHaveProperty('reportDate');
  });
});

describe('PDFMonkey template safety patch', () => {
  it('injects an idempotent no-logo safety style into template HTML', async () => {
    const { patchPdfMonkeyTemplateHtml } = await import('../pdf/pdfmonkey-template');
    const first = patchPdfMonkeyTemplateHtml('<html><head></head><body><div class="cover-operator-logo"><img src="{{ logoUrl }}"></div></body></html>');
    const second = patchPdfMonkeyTemplateHtml(first.html);

    expect(first.changed).toBe(true);
    expect(first.html).toContain('{% unless hasLogo and logoUrl != blank %}');
    expect(first.html).toContain('id="fsiq-app-logo-safety"');
    expect(first.html).toContain('.cover-operator-logo {');
    expect(first.html).toContain('display: none !important;');
    expect(second.changed).toBe(false);
    expect(second.html.match(/fsiq-app-logo-safety/g)).toHaveLength(1);
  });

  it('patches the remote template before creating a document', async () => {
    const mockFetchFn = vi.fn().mockImplementation((input: unknown, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : (input as Request).url;

      if (url.includes('casaroberto.com')) {
        return headResponse(200, 'image/png', 5000);
      }

      if (url.includes('/document_templates/') && init?.method === 'PUT') {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: () => Promise.resolve(templateBody),
          text: () => Promise.resolve(JSON.stringify(templateBody)),
        });
      }

      if (url.includes('/document_templates/')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          headers: { get: () => null },
          json: () => Promise.resolve({
            document_template: {
              body: unsafeTemplateBody,
              body_draft: unsafeTemplateBody,
            },
          }),
          text: () => Promise.resolve(JSON.stringify(templateBody)),
        });
      }

      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve(successBody),
        text: () => Promise.resolve(JSON.stringify(successBody)),
      });
    });

    vi.stubGlobal('fetch', mockFetchFn);
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await runWithTimers(() => generatePdf(baseInput));
    expect(r.pdfStatus).toBe('complete');

    const putCall = mockFetchFn.mock.calls.find((c) => {
      if (typeof c[0] !== 'string') return false;
      const init = c[1] as RequestInit | undefined;
      return (c[0] as string).includes('/document_templates/') && init?.method === 'PUT';
    });

    expect(putCall).toBeDefined();
    const body = JSON.parse((putCall![1] as RequestInit).body as string);
    const patchedHtml = body.document_template.body;
    expect(patchedHtml).toContain('{% if hasLogo and logoUrl != blank %}');
    expect(patchedHtml).toContain('{% unless hasLogo and logoUrl != blank %}');
    expect(patchedHtml).toContain('id="fsiq-app-logo-safety"');
    expect(patchedHtml).toContain('.cover-operator-logo {');
    expect(patchedHtml).not.toContain('cover-operator-logo">\n      {% if hasLogo %}');
    expect(patchedHtml).not.toContain('15-minute-meeting-clone-1');
    expect(patchedHtml).toContain('href="{{ calendlyUrl }}" target="_blank"');
  });

  it('blocks PDF generation when the template safety check fails', async () => {
    const mockFetchFn = vi.fn().mockImplementation((input: unknown) => {
      const url = typeof input === 'string' ? input : (input as Request).url;
      if (url.includes('casaroberto.com')) {
        return headResponse(200, 'image/png', 5000);
      }
      if (url.includes('/document_templates/')) {
        return Promise.resolve({
          ok: false,
          status: 403,
          headers: { get: () => null },
          json: () => Promise.resolve({ error: 'forbidden' }),
          text: () => Promise.resolve('forbidden'),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve(successBody),
        text: () => Promise.resolve(JSON.stringify(successBody)),
      });
    });

    vi.stubGlobal('fetch', mockFetchFn);
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await generatePdf(baseInput);
    expect(r.pdfStatus).toBe('error');
    expect(r.pdfError).toMatch(/template safety check failed 403/i);
    expect(findDocumentPost(mockFetchFn.mock.calls)).toBeUndefined();
  });
});

// ── Logo validation ───────────────────────────────────────────────────────────
//
// Mock strategy: HEAD requests to casaroberto.com = logo validation
//                POST/GET requests to pdfmonkey.io = PDFMonkey API
//
// We use mockFetchByUrl to route responses by URL pattern.

function headResponse(status: number, contentType: string, contentLength?: number) {
  const headers: Record<string, string> = { 'content-type': contentType };
  if (contentLength !== undefined) headers['content-length'] = String(contentLength);
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key: string) => headers[key.toLowerCase()] ?? null },
    json: () => Promise.resolve(successBody),
    text: () => Promise.resolve(JSON.stringify(successBody)),
  });
}

function imageGetResponse(status: number, contentType: string, contentLength = 5000) {
  const bytes = new Uint8Array(contentLength);
  bytes.fill(1);
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (key: string) => key.toLowerCase() === 'content-type' ? contentType : String(contentLength) },
    json: () => Promise.resolve(successBody),
    text: () => Promise.resolve(JSON.stringify(successBody)),
    arrayBuffer: () => Promise.resolve(bytes.buffer),
  });
}

function mockFetchByUrl(
  logoResponse: { status: number; contentType: string; contentLength?: number },
) {
  return vi.fn().mockImplementation((input: unknown, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : (input as Request).url;
    if (url.includes('casaroberto.com')) {
      if (init?.method === 'GET') {
        return imageGetResponse(logoResponse.status, logoResponse.contentType, logoResponse.contentLength ?? 5000);
      }
      return headResponse(logoResponse.status, logoResponse.contentType, logoResponse.contentLength);
    }
    if (url.includes('/document_templates/')) {
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: () => Promise.resolve(templateBody),
        text: () => Promise.resolve(JSON.stringify(templateBody)),
      });
    }
    // PDFMonkey API calls — return success
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => null },
      json: () => Promise.resolve(successBody),
      text: () => Promise.resolve(JSON.stringify(successBody)),
    });
  });
}

/** Find the first fetch call whose URL includes the given pattern */
function findCall(
  calls: unknown[][],
  pattern: string,
): [string, RequestInit] | undefined {
  const match = calls.find((c) => typeof c[0] === 'string' && (c[0] as string).includes(pattern));
  return match as [string, RequestInit] | undefined;
}

/** Find the PDFMonkey document creation POST, excluding template safety and polling calls */
function findDocumentPost(calls: unknown[][]): [string, RequestInit] | undefined {
  const match = calls.find((c) => {
    if (typeof c[0] !== 'string') return false;
    const init = c[1] as RequestInit | undefined;
    return (c[0] as string).endsWith('/api/v1/documents') && init?.method === 'POST';
  });
  return match as [string, RequestInit] | undefined;
}

describe('generatePdf — logo validation', () => {
  it('passes null logoUrl through without error → hasLogo=false in payload', async () => {
    const mockFetchFn = mockFetchByUrl({ status: 404, contentType: 'text/html' });
    vi.stubGlobal('fetch', mockFetchFn);
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await runWithTimers(() => generatePdf({ ...baseInput, logoUrl: null }));
    // Should complete successfully — null logo is fine
    expect(r.pdfStatus).toBe('complete');
    // Verify hasLogo=false in the payload sent
    const pdfCallArgs = findDocumentPost(mockFetchFn.mock.calls);
    expect(pdfCallArgs).toBeDefined();
    const body = JSON.parse(pdfCallArgs![1].body as string);
    const payload = JSON.parse(body.document.payload);
    expect(payload.hasLogo).toBe(false);
  });

  it('validates logoUrl with HEAD request before sending to PDFMonkey', async () => {
    const mockFetchFn = mockFetchByUrl({ status: 200, contentType: 'image/png', contentLength: 5000 });
    vi.stubGlobal('fetch', mockFetchFn);
    const { generatePdf } = await import('../pdf/pdfmonkey');
    await runWithTimers(() => generatePdf(baseInput));
    // HEAD call to logo URL should have been made
    const headCall = findCall(mockFetchFn.mock.calls, 'casaroberto.com');
    expect(headCall).toBeDefined();
    expect(headCall![1].method).toBe('HEAD');
  });

  it('sets logoUrl=null (hasLogo=false) when HEAD returns 404', async () => {
    const mockFetchFn = mockFetchByUrl({ status: 404, contentType: 'text/html' });
    vi.stubGlobal('fetch', mockFetchFn);
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await runWithTimers(() => generatePdf(baseInput));
    expect(r.pdfStatus).toBe('complete');
    const pdfCallArgs = findDocumentPost(mockFetchFn.mock.calls);
    const body = JSON.parse(pdfCallArgs![1].body as string);
    const payload = JSON.parse(body.document.payload);
    expect(payload.hasLogo).toBe(false);
    expect(payload.logoUrl).toBe('');
  });

  it('sets logoUrl=null when content-type is not image/', async () => {
    const mockFetchFn = mockFetchByUrl({ status: 200, contentType: 'text/html' });
    vi.stubGlobal('fetch', mockFetchFn);
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await runWithTimers(() => generatePdf(baseInput));
    expect(r.pdfStatus).toBe('complete');
    const pdfCallArgs = findDocumentPost(mockFetchFn.mock.calls);
    const body = JSON.parse(pdfCallArgs![1].body as string);
    const payload = JSON.parse(body.document.payload);
    expect(payload.hasLogo).toBe(false);
  });

  it('sets logoUrl=null for ICO files', async () => {
    const mockFetchFn = mockFetchByUrl({ status: 200, contentType: 'image/x-icon' });
    vi.stubGlobal('fetch', mockFetchFn);
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await runWithTimers(() => generatePdf(baseInput));
    expect(r.pdfStatus).toBe('complete');
    const pdfCallArgs = findDocumentPost(mockFetchFn.mock.calls);
    const body = JSON.parse(pdfCallArgs![1].body as string);
    const payload = JSON.parse(body.document.payload);
    expect(payload.hasLogo).toBe(false);
  });

  it('sets logoUrl=null when Content-Length < 500', async () => {
    const mockFetchFn = mockFetchByUrl({ status: 200, contentType: 'image/png', contentLength: 100 });
    vi.stubGlobal('fetch', mockFetchFn);
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await runWithTimers(() => generatePdf(baseInput));
    expect(r.pdfStatus).toBe('complete');
    const pdfCallArgs = findDocumentPost(mockFetchFn.mock.calls);
    const body = JSON.parse(pdfCallArgs![1].body as string);
    const payload = JSON.parse(body.document.payload);
    expect(payload.hasLogo).toBe(false);
  });

  it('accepts valid logo URL and embeds it in payload (hasLogo=true)', async () => {
    const mockFetchFn = mockFetchByUrl({ status: 200, contentType: 'image/png', contentLength: 5000 });
    vi.stubGlobal('fetch', mockFetchFn);
    const { generatePdf } = await import('../pdf/pdfmonkey');
    const r = await runWithTimers(() => generatePdf(baseInput));
    expect(r.pdfStatus).toBe('complete');
    const pdfCallArgs = findDocumentPost(mockFetchFn.mock.calls);
    const body = JSON.parse(pdfCallArgs![1].body as string);
    const payload = JSON.parse(body.document.payload);
    expect(payload.hasLogo).toBe(true);
    expect(payload.logoUrl).toMatch(/^data:image\/png;base64,/);
    expect(payload.logoUrl).not.toBe('https://casaroberto.com/logo.png');
  });

  it('conservative mode skips logo validation — hasLogo always false', async () => {
    const mockFetchFn = mockFetchByUrl({ status: 200, contentType: 'image/png', contentLength: 5000 });
    vi.stubGlobal('fetch', mockFetchFn);
    const { generatePdf } = await import('../pdf/pdfmonkey');
    await runWithTimers(() => generatePdf({ ...baseInput, mode: 'conservative' }));
    // No HEAD request to logo URL should have been made
    const headCall = findCall(mockFetchFn.mock.calls, 'casaroberto.com');
    expect(headCall).toBeUndefined();
  });
});
