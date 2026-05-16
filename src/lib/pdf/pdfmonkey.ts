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
      };
    }

    return {
      pdfStatus: 'complete',
      pdfMode: input.mode,
      pdfMonkeyDocumentId: doc.id,
      pdfDownloadUrl: doc.download_url ?? null,
      pdfError: null,
      pdfRetryCount: 0,
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
    };
  }
}

// ── Internal response type ────────────────────────────────────────────────────

interface PdfMonkeyResponse {
  document?: {
    id: string;
    download_url?: string;
    status?: string;
  };
}

// ── Test helper (exported for unit tests only) ────────────────────────────────

export { buildPdfPayload };
export type { PdfPayload };
