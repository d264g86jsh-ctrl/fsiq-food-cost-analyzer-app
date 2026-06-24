// GET /api/report/[id] — PDF proxy with hybrid delivery strategy:
//   1. Fresh download_url from PDFMonkey API (always current, expires in hours)
//   2. Cached copy in Supabase Storage (permanent, set at generation time)
//   3. Lazy cache: if #2 missing, fetch via #1 and cache now for next request
//   4. Friendly 410 if both unavailable (document deleted from PDFMonkey)
//
// Hard rules (docs/hard-rules.md) — see also: docs/pdf-generation.md:
//   - Never trigger a download. Content-Disposition must be "inline".
//   - No sandbox attribute on the iframe that embeds this route.
//   - No Content-Security-Policy: sandbox header on this response.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { debugLog } from '@/lib/debug-log';
import { cachePdfToSupabase, verifyCachedPdfUrl, fetchAndCache } from '@/lib/pdf/pdf-cache';

const PDFMONKEY_API_KEY  = process.env.PDFMONKEY_API_KEY;
const PDFMONKEY_API_BASE = 'https://api.pdfmonkey.io/api/v1';

/**
 * Fetch a fresh download_url from PDFMonkey using the stored document ID.
 * PDFMonkey always returns a current pre-signed S3 URL regardless of age.
 */
async function getFreshDownloadUrl(documentId: string): Promise<string | null> {
  if (!documentId || !PDFMONKEY_API_KEY) return null;
  try {
    const res = await fetch(`${PDFMONKEY_API_BASE}/documents/${documentId}`, {
      headers: { Authorization: `Bearer ${PDFMONKEY_API_KEY}` },
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
 * Stream PDF bytes from any URL back to the client.
 * Returns null if the upstream URL is unreachable or returns an error.
 */
async function streamPdf(sourceUrl: string): Promise<NextResponse | null> {
  try {
    const upstream = await fetch(sourceUrl, { signal: AbortSignal.timeout(20_000) });
    if (!upstream.ok) return null;
    const pdf = await upstream.arrayBuffer();
    return new NextResponse(pdf, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': 'inline; filename="Food-Cost-Analyzer.pdf"',
        'Cache-Control':       'private, max-age=3600',
      },
    });
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
  if (submission.pdfMonkeyDocumentId) {
    const freshUrl = await getFreshDownloadUrl(submission.pdfMonkeyDocumentId);
    if (freshUrl) {
      const res = await streamPdf(freshUrl);
      if (res) {
        // Lazy cache: if no cached copy yet, store it now for future requests
        if (!submission.pdfCachedUrl) {
          const newFresh = await fetch(freshUrl, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
          if (newFresh?.ok) {
            const buffer = await newFresh.arrayBuffer().catch(() => null);
            if (buffer) {
              const cached = await cachePdfToSupabase(id, buffer);
              if (cached) {
                await db.submission.update({
                  where: { id },
                  data: { pdfCachedUrl: cached.url, pdfCachedAt: cached.cachedAt },
                }).catch(() => {});
              }
            }
          }
        }
        return res;
      }
    }
  }

  // ── Strategy 2: Supabase Storage cached copy ─────────────────────────────
  if (submission.pdfCachedUrl) {
    const validCachedUrl = await verifyCachedPdfUrl(submission.pdfCachedUrl);
    if (validCachedUrl) {
      const res = await streamPdf(validCachedUrl);
      if (res) {
        debugLog(`[PDF Proxy] Served from cache for ${id}`);
        return res;
      }
    }
  }

  // ── Strategy 3: stored download_url (may be expired, worth trying) ────────
  if (submission.pdfDownloadUrl) {
    const res = await streamPdf(submission.pdfDownloadUrl);
    if (res) {
      debugLog(`[PDF Proxy] Served from stored URL for ${id}`);
      return res;
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
