// Phase 6 — PDFMonkey direct API client.
// App backend calls PDFMonkey directly. No Zapier.
// Source of truth: docs/build-phases.md §Phase 6, docs/FSIQ_SOP_v3.3.md §19.
//
// Never throws — all error paths return a GeneratePdfResult with pdfStatus: "error" or "skipped".
// pdfStatus: "skipped" when credentials are missing (safe dev/staging behavior).

import type { PdfPayload, GeneratePdfInput, GeneratePdfResult } from './pdf-types';
import { buildPdfPayload } from './build-pdf-payload';

const PDFMONKEY_API_URL = 'https://api.pdfmonkey.io/api/v1/documents';

// ── Exported API client ───────────────────────────────────────────────────────

export async function generatePdf(input: GeneratePdfInput): Promise<GeneratePdfResult> {
  const apiKey    = process.env.PDFMONKEY_API_KEY;
  const templateId = process.env.PDFMONKEY_TEMPLATE_ID;

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

  const payload = buildPdfPayload(input);

  try {
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

    if (polled.urlType === 'download') {
      console.warn(`[FSIQ PDF] preview_url unavailable — fell back to S3 download_url for document: ${doc.id}`);
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
      const resolvedUrl = viewerUrl ?? s3Url;

      if (status === 'success') {
        if (resolvedUrl) {
          return {
            downloadUrl: resolvedUrl,
            urlType: viewerUrl ? 'viewer' : 'download',
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
