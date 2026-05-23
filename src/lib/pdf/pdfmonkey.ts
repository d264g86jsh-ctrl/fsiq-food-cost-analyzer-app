// Phase 6 — PDFMonkey direct API client.
// App backend calls PDFMonkey directly. No Zapier.
// Source of truth: docs/build-phases.md §Phase 6, docs/FSIQ_SOP_v3.3.md §19.
//
// Never throws — all error paths return a GeneratePdfResult with pdfStatus: "error" or "skipped".
// pdfStatus: "skipped" when credentials are missing (safe dev/staging behavior).

import type { PdfPayload, GeneratePdfInput, GeneratePdfResult } from './pdf-types';
import { buildPdfPayload } from './build-pdf-payload';
import { patchPdfMonkeyTemplateHtml } from './pdfmonkey-template';

const PDFMONKEY_API_URL = 'https://api.pdfmonkey.io/api/v1/documents';
const PDFMONKEY_TEMPLATE_API_URL = 'https://api.pdfmonkey.io/api/v1/document_templates';
const LOGO_VALIDATE_TIMEOUT_MS = 5_000;

// Private IP patterns that PDFMonkey's network can't reach
const PRIVATE_IP_PATTERNS = ['127.0.0.1', 'localhost', '192.168.', '10.0.', '172.16.'];

const patchedTemplateIds = new Set<string>();

// ── Logo validation ───────────────────────────────────────────────────────────

/**
 * Validates a logo URL before passing it to PDFMonkey.
 * Returns a data URI if valid, null otherwise. Embedding the image avoids a
 * second network fetch from PDFMonkey during render, which is where broken
 * image boxes can appear even after app-side URL validation succeeds.
 * Conservative PDFs never show a restaurant logo — always return null.
 */
async function validateLogoForPdf(url: string | null, isConservative: boolean): Promise<string | null> {
  // Rule 1: Conservative PDF never shows restaurant logo
  if (isConservative) return null;

  // Rule 2: Null or non-http URL
  if (!url || !url.startsWith('http')) {
    if (url) console.warn(`[FSIQ PDF LOGO] non-http URL → hasLogo=false: ${url}`);
    return null;
  }

  // Rule 6: Private/local IP guard (PDFMonkey can't reach these)
  for (const pattern of PRIVATE_IP_PATTERNS) {
    if (url.includes(pattern)) {
      console.error(`[FSIQ PDF LOGO] private IP in URL → hasLogo=false: ${url}`);
      return null;
    }
  }

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(LOGO_VALIDATE_TIMEOUT_MS),
    });

    // Rule 3a: Non-OK status
    if (!res.ok) {
      console.log(`[FSIQ PDF LOGO] HEAD ${res.status} → hasLogo=false: ${url}`);
      return null;
    }

    const ct = res.headers.get('content-type') ?? '';
    const cl = res.headers.get('content-length');
    const clInt = cl !== null ? parseInt(cl, 10) : null;

    // Rule 3b: Not an image
    if (!ct.startsWith('image/')) {
      console.warn(`[FSIQ PDF LOGO] content-type "${ct}" is not image/ → hasLogo=false: ${url}`);
      return null;
    }

    // Rule 3c: ICO files — poor quality for PDF
    if (ct === 'image/x-icon' || ct === 'image/vnd.microsoft.icon') {
      console.warn(`[FSIQ PDF LOGO] ICO content-type → hasLogo=false: ${url}`);
      return null;
    }

    // Rule 4: CDN returns 200 for any URL — zero-byte content
    if (clInt !== null && clInt === 0) {
      console.warn(`[FSIQ PDF LOGO] Content-Length=0 → hasLogo=false: ${url}`);
      return null;
    }

    // Rule 5: Tracking pixel / blank image
    if (clInt !== null && clInt < 500) {
      console.warn(`[FSIQ PDF LOGO] Content-Length=${clInt} < 500 → hasLogo=false: ${url}`);
      return null;
    }

    const imageDataUri = await fetchLogoAsDataUri(url, ct);
    if (!imageDataUri) return null;

    // Rule 7: Paper trail
    const timestamp = new Date().toISOString();
    console.log(`[FSIQ PDF LOGO] validated and embedded at ${timestamp}: ${url}`);
    return imageDataUri;
  } catch {
    console.warn(`[FSIQ PDF LOGO] HEAD request failed → hasLogo=false: ${url}`);
    return null;
  }
}

async function fetchLogoAsDataUri(url: string, expectedContentType: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      signal: AbortSignal.timeout(LOGO_VALIDATE_TIMEOUT_MS),
    });

    if (!res.ok) {
      console.warn(`[FSIQ PDF LOGO] GET ${res.status} → hasLogo=false: ${url}`);
      return null;
    }

    const ct = res.headers.get('content-type') ?? expectedContentType;
    if (!ct.startsWith('image/')) {
      console.warn(`[FSIQ PDF LOGO] GET content-type "${ct}" is not image/ → hasLogo=false: ${url}`);
      return null;
    }
    if (ct === 'image/x-icon' || ct === 'image/vnd.microsoft.icon') {
      console.warn(`[FSIQ PDF LOGO] GET ICO content-type → hasLogo=false: ${url}`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 500) {
      console.warn(`[FSIQ PDF LOGO] downloaded image ${buffer.length} bytes < 500 → hasLogo=false: ${url}`);
      return null;
    }

    return `data:${ct};base64,${buffer.toString('base64')}`;
  } catch {
    console.warn(`[FSIQ PDF LOGO] GET request failed → hasLogo=false: ${url}`);
    return null;
  }
}

// ── Exported API client ───────────────────────────────────────────────────────

export async function generatePdf(input: GeneratePdfInput): Promise<GeneratePdfResult> {
  const apiKey    = process.env.PDFMONKEY_API_KEY;
  const templateId = process.env.PDFMONKEY_TEMPLATE_ID;

  // Warn if FSIQ_IQ_LOGO_URL fallback is not configured
  if (!process.env.FSIQ_IQ_LOGO_URL) {
    console.warn('[FSIQ PDF] FSIQ_IQ_LOGO_URL is not set — PDF fallback logo will be empty');
  }

  // Graceful no-op when credentials are missing (dev / misconfigured environments)
  if (!apiKey || !templateId) {
    return {
      pdfStatus: 'skipped',
      pdfMode: input.mode,
      pdfMonkeyDocumentId: null,
      pdfDownloadUrl: null,
      pdfError: 'PDFMONKEY_API_KEY or PDFMONKEY_TEMPLATE_ID not configured',
      pdfRetryCount: 0,
      pdfUrlType: null,
    };
  }

  // Validate logo URL before building payload
  const validatedLogoUrl = await validateLogoForPdf(input.logoUrl, input.mode === 'conservative');
  const validatedInput = { ...input, logoUrl: validatedLogoUrl };

  const payload = buildPdfPayload(validatedInput);

  try {
    const templatePatch = await ensureTemplateSafe(apiKey, templateId);
    if (!templatePatch.ok) {
      return {
        pdfStatus: 'error',
        pdfMode: input.mode,
        pdfMonkeyDocumentId: null,
        pdfDownloadUrl: null,
        pdfError: templatePatch.error,
        pdfRetryCount: 0,
        pdfUrlType: null,
      };
    }

    const response = await fetch(PDFMONKEY_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        document: {
          document_template_id: templateId,
          payload: JSON.stringify(payload),
          status: 'pending',
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => `HTTP ${response.status}`);
      return {
        pdfStatus: 'error',
        pdfMode: input.mode,
        pdfMonkeyDocumentId: null,
        pdfDownloadUrl: null,
        pdfError: `PDFMonkey API error ${response.status}: ${errorText.slice(0, 300)}`,
        pdfRetryCount: 0,
        pdfUrlType: null,
      };
    }

    const data = (await response.json()) as PdfMonkeyResponse;
    const doc  = data?.document;

    if (!doc?.id) {
      return {
        pdfStatus: 'error',
        pdfMode: input.mode,
        pdfMonkeyDocumentId: null,
        pdfDownloadUrl: null,
        pdfError: 'PDFMonkey response missing document.id',
        pdfRetryCount: 0,
        pdfUrlType: null,
      };
    }

    // PDFMonkey generates asynchronously — poll until a URL is available.
    // Initial response has status: "pending" and no URLs.
    const polled = await pollForDownloadUrl(apiKey, doc.id);

    if (polled.urlType === 'viewer') {
      console.warn(`[FSIQ PDF] download_url unavailable — fell back to preview_url for document: ${doc.id}`);
    }

    return {
      pdfStatus:           polled.downloadUrl ? 'complete' : 'error',
      pdfMode:             input.mode,
      pdfMonkeyDocumentId: doc.id,
      pdfDownloadUrl:      polled.downloadUrl,
      pdfError:            polled.error,
      pdfRetryCount:       0,
      pdfUrlType:          polled.urlType,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      pdfStatus: 'error',
      pdfMode: input.mode,
      pdfMonkeyDocumentId: null,
      pdfDownloadUrl: null,
      pdfError: message,
      pdfRetryCount: 0,
      pdfUrlType: null,
    };
  }
}

// ── Internal response type ────────────────────────────────────────────────────

interface PdfMonkeyResponse {
  document?: {
    id: string;
    download_url?: string | null;
    preview_url?: string | null;  // web viewer URL — preferred for storage and GHL
    status?: string;
  };
}

interface PdfMonkeyTemplateResponse {
  document_template?: {
    body?: string | null;
    body_draft?: string | null;
  };
}

// ── Template safety helper ────────────────────────────────────────────────────
// Keeps the remote PDFMonkey Code Template aligned with app-owned invariants:
// no empty restaurant-logo container and no hardcoded stale Calendly links.

async function ensureTemplateSafe(
  apiKey: string,
  templateId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (patchedTemplateIds.has(templateId)) return { ok: true };

  const templateUrl = `${PDFMONKEY_TEMPLATE_API_URL}/${templateId}`;

  const getRes = await fetch(templateUrl, {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!getRes.ok) {
    const errorText = await getRes.text().catch(() => `HTTP ${getRes.status}`);
    return {
      ok: false,
      error: `PDFMonkey template safety check failed ${getRes.status}: ${errorText.slice(0, 300)}`,
    };
  }

  const data = (await getRes.json()) as PdfMonkeyTemplateResponse;
  const template = data.document_template;
  if (!template) {
    return { ok: false, error: 'PDFMonkey template safety check failed: response missing document_template' };
  }

  const update: { body?: string; body_draft?: string } = {};

  if (typeof template.body === 'string') {
    const patched = patchPdfMonkeyTemplateHtml(template.body);
    if (patched.changed) update.body = patched.html;
  }

  if (typeof template.body_draft === 'string') {
    const patched = patchPdfMonkeyTemplateHtml(template.body_draft);
    if (patched.changed) update.body_draft = patched.html;
  }

  if (Object.keys(update).length === 0) {
    patchedTemplateIds.add(templateId);
    return { ok: true };
  }

  const putRes = await fetch(templateUrl, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ document_template: update }),
  });

  if (!putRes.ok) {
    const errorText = await putRes.text().catch(() => `HTTP ${putRes.status}`);
    return {
      ok: false,
      error: `PDFMonkey template safety update failed ${putRes.status}: ${errorText.slice(0, 300)}`,
    };
  }

  console.log(`[FSIQ PDF TEMPLATE] safety patch applied: ${templateId}`);
  patchedTemplateIds.add(templateId);
  return { ok: true };
}

// ── Polling helper — waits for PDFMonkey to finish generating the document ────
// PDFMonkey statuses: pending → generating → success | failure
// Polls every 3 s, up to 10 attempts (30 s total).
// Returns preview_url (web viewer) when available; falls back to download_url.
// FIX: status === 'success' with both URLs null returns error immediately (unrecoverable).

async function pollForDownloadUrl(
  apiKey: string,
  docId: string,
): Promise<{ downloadUrl: string | null; urlType: 'viewer' | 'download' | null; error: string | null }> {
  const MAX_ATTEMPTS = 10;
  const INTERVAL_MS  = 3000;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    await new Promise((r) => setTimeout(r, INTERVAL_MS));

    try {
      const res = await fetch(`${PDFMONKEY_API_URL}/${docId}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (!res.ok) {
        return { downloadUrl: null, urlType: null, error: `PDFMonkey poll ${res.status} on attempt ${attempt + 1}` };
      }
      const data = (await res.json()) as PdfMonkeyResponse;
      const status     = data?.document?.status;
      const viewerUrl  = data?.document?.preview_url ?? null;
      const s3Url      = data?.document?.download_url ?? null;
      // Prefer download_url (direct PDF binary) — browser-native PDF rendering
      // honours annotation links. Fall back to preview_url only when download_url
      // is absent (PDFMonkey has not yet uploaded to S3).
      const resolvedUrl = s3Url ?? viewerUrl;

      if (status === 'success') {
        if (resolvedUrl) {
          return {
            downloadUrl: resolvedUrl,
            urlType: s3Url ? 'download' : 'viewer',
            error: null,
          };
        }
        // status is success but both URLs are null — unrecoverable, don't burn remaining attempts
        return { downloadUrl: null, urlType: null, error: 'PDFMonkey returned success status but no URL' };
      }
      if (status === 'failure') {
        return { downloadUrl: null, urlType: null, error: 'PDFMonkey document generation failed' };
      }
      // status is still "pending" or "generating" — continue polling
    } catch (err) {
      return { downloadUrl: null, urlType: null, error: err instanceof Error ? err.message : String(err) };
    }
  }

  return { downloadUrl: null, urlType: null, error: `PDFMonkey did not finish within ${MAX_ATTEMPTS * INTERVAL_MS / 1000}s` };
}

// ── Test helper (exported for unit tests only) ────────────────────────────────

export { buildPdfPayload };
export type { PdfPayload };
