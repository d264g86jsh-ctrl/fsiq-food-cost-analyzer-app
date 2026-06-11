// GET /api/report/[id] — PDF proxy with hybrid delivery strategy:
//   1. Fresh download_url from PDFMonkey API (always current, expires in hours)
//   2. Cached copy in Supabase Storage (permanent, written at generation time or after first visit)
//   3. Stored download_url from DB (may be expired, last resort)
//   4. Friendly 410 if all sources unavailable
//
// Hard rules (docs/hard-rules.md):
//   - Never trigger a download. Content-Disposition must be "inline".
//   - No sandbox attribute on the iframe that embeds this route.
//   - No Content-Security-Policy: sandbox header on this response.

import { NextRequest, NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import { db } from '@/lib/db';
import { cachePdfToSupabase, verifyCachedPdfUrl } from '@/lib/pdf/pdf-cache';

// Explicit maxDuration for this API route — separate from the page route's segment config.
// First-visit path: PDFMonkey API call + S3 fetch ≈ 3–6s. 30s gives substantial headroom.
export const maxDuration = 30;

const PDFMONKEY_API_BASE = 'https://api.pdfmonkey.io/api/v1';

/**
 * Fetch a fresh download_url from PDFMonkey using the stored document ID.
 * PDFMonkey always returns a current pre-signed S3 URL regardless of document age.
 */
async function getFreshDownloadUrl(documentId: string): Promise<string | null> {
  // Read at call time so vi.stubEnv works in tests and env changes take effect.
  const apiKey = process.env.PDFMONKEY_API_KEY;
  if (!documentId || !apiKey) return null;
  try {
    const res = await fetch(`${PDFMONKEY_API_BASE}/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) {
      console.warn(`[PDF Proxy] PDFMonkey ${res.status} for doc ${documentId}`);
      return null;
    }
    const data = (await res.json()) as { document?: { download_url?: string | null } };
    return data?.document?.download_url ?? null;
  } catch (err) {
    console.warn(`[PDF Proxy] PDFMonkey fetch error:`, err);
    return null;
  }
}

/**
 * Build the PDF NextResponse from a raw ArrayBuffer.
 */
function pdfResponse(buffer: ArrayBuffer): NextResponse {
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type':        'application/pdf',
      'Content-Disposition': 'inline; filename="Food-Cost-Analyzer.pdf"',
      'Cache-Control':       'private, max-age=3600',
    },
  });
}

/**
 * Fetch PDF bytes from any URL. Returns null if unreachable or non-OK.
 */
async function fetchPdfBuffer(sourceUrl: string, timeoutMs = 20_000): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(timeoutMs) });
    if (!res.ok) return null;
    return res.arrayBuffer();
  } catch {
    return null;
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const submission = await db.submission.findUnique({
    where: { id },
    select: {
      qualified:           true,
      pdfMonkeyDocumentId: true,
      pdfDownloadUrl:      true,
      pdfCachedUrl:        true,
    },
  });

  if (!submission || submission.qualified !== true) {
    return new NextResponse(null, { status: 404 });
  }

  // ── Strategy 1: fresh URL from PDFMonkey API ─────────────────────────────
  // Fetch the PDF buffer ONCE, return the response immediately, then cache
  // in the background via waitUntil. This eliminates the prior double-fetch
  // pattern that was blocking the response and risking the 15s default timeout.
  if (submission.pdfMonkeyDocumentId) {
    const freshUrl = await getFreshDownloadUrl(submission.pdfMonkeyDocumentId);
    if (freshUrl) {
      const buffer = await fetchPdfBuffer(freshUrl);
      if (buffer) {
        // Lazy cache: if no Supabase copy yet, write it in the background after
        // the response is sent — never block the client on the cache write.
        if (!submission.pdfCachedUrl) {
          waitUntil(
            cachePdfToSupabase(id, buffer)
              .then((cached) => {
                if (cached) {
                  return db.submission.update({
                    where: { id },
                    data: { pdfCachedUrl: cached.url, pdfCachedAt: cached.cachedAt },
                  });
                }
              })
              .catch(() => {}),
          );
        }
        return pdfResponse(buffer);
      }
    }
  }

  // ── Strategy 2: Supabase Storage cached copy ─────────────────────────────
  if (submission.pdfCachedUrl) {
    const validCachedUrl = await verifyCachedPdfUrl(submission.pdfCachedUrl);
    if (validCachedUrl) {
      const buffer = await fetchPdfBuffer(validCachedUrl);
      if (buffer) {
        console.log(`[PDF Proxy] Served from cache for ${id}`);
        return pdfResponse(buffer);
      }
    }
  }

  // ── Strategy 3: stored download_url (may be expired, worth trying) ────────
  if (submission.pdfDownloadUrl) {
    const buffer = await fetchPdfBuffer(submission.pdfDownloadUrl);
    if (buffer) {
      console.log(`[PDF Proxy] Served from stored URL for ${id}`);
      return pdfResponse(buffer);
    }
  }

  // ── All strategies exhausted ──────────────────────────────────────────────
  console.error(`[PDF Proxy] No available PDF for submission ${id}`);
  return new NextResponse(
    'This report is temporarily unavailable. Please check your email for the PDF attachment, or contact support.',
    {
      status: 410,
      headers: { 'Content-Type': 'text/plain' },
    },
  );
}
