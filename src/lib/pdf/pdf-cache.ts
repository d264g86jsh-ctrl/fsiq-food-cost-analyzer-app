// PDF permanent caching — Supabase Storage fallback for expired PDFMonkey URLs.
// Server-side only. Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
// The service role key (not anon key) is needed for storage write operations.

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'pdf-cache';

function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

function storagePath(submissionId: string): string {
  return `submissions/${submissionId}.pdf`;
}

/**
 * Cache a PDF to Supabase Storage.
 * Returns the public URL on success, null on failure (non-fatal).
 */
export async function cachePdfToSupabase(
  submissionId: string,
  pdfBuffer: ArrayBuffer | Buffer,
): Promise<{ url: string; cachedAt: Date } | null> {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    console.warn('[PDF Cache] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set — skipping cache');
    return null;
  }

  try {
    const buffer = Buffer.isBuffer(pdfBuffer) ? pdfBuffer : Buffer.from(pdfBuffer);

    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath(submissionId), buffer, {
        contentType: 'application/pdf',
        upsert: true,
      });

    if (error) {
      console.error(`[PDF Cache] Upload failed for ${submissionId}:`, error.message);
      return null;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath(submissionId));

    console.log(`[PDF Cache] Cached ${submissionId}: ${data.publicUrl}`);
    return { url: data.publicUrl, cachedAt: new Date() };
  } catch (err) {
    console.error(`[PDF Cache] Unexpected error caching ${submissionId}:`, err);
    return null;
  }
}

/**
 * Verify a cached PDF URL is still accessible (HEAD request).
 * Returns the URL if valid, null if missing or unreachable.
 */
export async function verifyCachedPdfUrl(cachedUrl: string): Promise<string | null> {
  try {
    const res = await fetch(cachedUrl, {
      method: 'HEAD',
      signal: AbortSignal.timeout(5000),
    });
    return res.ok ? cachedUrl : null;
  } catch {
    return null;
  }
}

/**
 * Fetch fresh PDF bytes from a URL and cache them to Supabase.
 * Used in the proxy route for lazy caching of existing PDFs that predate this feature.
 */
export async function fetchAndCache(
  submissionId: string,
  sourceUrl: string,
): Promise<{ url: string; cachedAt: Date } | null> {
  try {
    const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    const buffer = await res.arrayBuffer();
    return cachePdfToSupabase(submissionId, buffer);
  } catch {
    return null;
  }
}
