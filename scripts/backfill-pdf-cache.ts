#!/usr/bin/env npx tsx
// Backfill script: Cache all un-cached PDFs to Supabase Storage.
//
// Targets: qualified=true, pdfStatus='complete', pdfCachedUrl IS NULL
// (~24 rows as of 2026-06-11 — mix of stress-test and early real leads)
//
// Strategy per row:
//   1. Fetch a FRESH download_url via the PDFMonkey API (avoids expired S3 URLs)
//   2. If PDFMonkey returns 404/gone → mark as DEAD, skip and report
//   3. Download PDF bytes, upload to Supabase Storage, write pdfCachedUrl to DB
//
// Resume-safe: re-running skips already-cached rows.
// Sequential with BATCH_DELAY_MS between requests to respect rate limits.
//
// Required env vars (add to .env.local):
//   DATABASE_URL              — Supabase pooler (already set)
//   SUPABASE_URL              — e.g. https://PROJECT.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY — from Supabase dashboard → Settings → API
//   PDFMONKEY_API_KEY         — from PDFMonkey dashboard → Settings
//
// Usage:
//   npx tsx scripts/backfill-pdf-cache.ts

import path from 'node:path';
import fs from 'node:fs';

// ── Env loading ───────────────────────────────────────────────────────────────
function loadEnvFile(p: string) {
  if (!fs.existsSync(p)) return;
  const fileVars: Record<string, string> = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (key) fileVars[key] = val;
  }
  for (const [key, val] of Object.entries(fileVars)) {
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile(path.join(process.cwd(), '.env.local'));
loadEnvFile(path.join(process.cwd(), '.env'));

import { PrismaClient } from '@prisma/client';
import { createClient } from '@supabase/supabase-js';

// ── Env validation ────────────────────────────────────────────────────────────
const REQUIRED = ['DATABASE_URL', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PDFMONKEY_API_KEY'];
const missing  = REQUIRED.filter((k) => !process.env[k]);
if (missing.length) {
  console.error('\n❌ Missing required environment variables:');
  missing.forEach((k) => console.error(`   ${k}`));
  console.error('\nAdd them to .env.local and re-run.\n');
  process.exit(1);
}

const SUPABASE_URL      = process.env.SUPABASE_URL!;
const SUPABASE_KEY      = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PDFMONKEY_API_KEY = process.env.PDFMONKEY_API_KEY!;
const PDFMONKEY_BASE    = 'https://api.pdfmonkey.io/api/v1';
const BUCKET            = 'pdf-cache';
const BATCH_DELAY_MS    = 800;

const db       = new PrismaClient();
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
const sleep    = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── PDFMonkey helpers ─────────────────────────────────────────────────────────

type PdfMonkeyStatus = 'found' | 'dead' | 'error';
interface PdfMonkeyResult {
  status: PdfMonkeyStatus;
  downloadUrl: string | null;
  httpStatus: number;
}

async function getFreshPdfMonkeyUrl(docId: string): Promise<PdfMonkeyResult> {
  try {
    const res = await fetch(`${PDFMONKEY_BASE}/documents/${docId}`, {
      headers: { Authorization: `Bearer ${PDFMONKEY_API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status === 404 || res.status === 410) {
      return { status: 'dead', downloadUrl: null, httpStatus: res.status };
    }
    if (!res.ok) {
      return { status: 'error', downloadUrl: null, httpStatus: res.status };
    }
    const data = (await res.json()) as { document?: { download_url?: string | null } };
    const url = data?.document?.download_url ?? null;
    return { status: 'found', downloadUrl: url, httpStatus: res.status };
  } catch (err) {
    return { status: 'error', downloadUrl: null, httpStatus: 0 };
  }
}

// ── Storage helpers ───────────────────────────────────────────────────────────

async function fetchPdfBytes(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    return res.ok ? res.arrayBuffer() : null;
  } catch {
    return null;
  }
}

async function uploadToSupabase(submissionId: string, buffer: ArrayBuffer): Promise<string | null> {
  const filePath = `submissions/${submissionId}.pdf`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, Buffer.from(buffer), { contentType: 'application/pdf', upsert: true });
  if (error) {
    console.error(`     Supabase upload error: ${error.message}`);
    return null;
  }
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
  return data.publicUrl;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n' + '═'.repeat(72));
  console.log('PDF CACHE BACKFILL');
  console.log('═'.repeat(72));
  console.log(`  Target: qualified=true, pdfStatus=complete, pdfCachedUrl=NULL`);
  console.log(`  Bucket: ${BUCKET}`);
  console.log(`  Delay:  ${BATCH_DELAY_MS}ms between rows\n`);

  // Query: ALL uncached complete PDFs for qualified submissions
  // (does NOT filter pdfDownloadUrl != null — some rows have null stored URL
  //  but still have a valid pdfMonkeyDocumentId we can use)
  const submissions = await db.submission.findMany({
    where: {
      qualified:    true,
      pdfStatus:    'complete',
      pdfCachedUrl: null,
    },
    select: {
      id:                  true,
      restaurantName:      true,
      pdfDownloadUrl:      true,
      pdfMonkeyDocumentId: true,
      createdAt:           true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`📋 Found ${submissions.length} uncached rows to process.\n`);
  if (!submissions.length) {
    console.log('✅ Nothing to do — all qualified+complete PDFs already cached.\n');
    await db.$disconnect();
    return;
  }

  let cached = 0;
  let dead   = 0;
  let failed = 0;

  type FailureRecord = { id: string; name: string; reason: string; docId: string | null };
  const deadDocs:    FailureRecord[] = [];
  const failedRows:  FailureRecord[] = [];

  for (let i = 0; i < submissions.length; i++) {
    const sub = submissions[i];
    const num  = `[${String(i + 1).padStart(2)}/${submissions.length}]`;
    const date = sub.createdAt.toISOString().slice(0, 10);
    const name = sub.restaurantName.slice(0, 38);
    console.log(`${num} ${date} | ${name}`);
    console.log(`       id=${sub.id}  docId=${sub.pdfMonkeyDocumentId ?? 'null'}`);

    try {
      let pdfBytes: ArrayBuffer | null = null;
      let source = '';

      // ── Strategy 1: fresh URL from PDFMonkey API ──────────────────────────
      if (sub.pdfMonkeyDocumentId) {
        const pmResult = await getFreshPdfMonkeyUrl(sub.pdfMonkeyDocumentId);

        if (pmResult.status === 'dead') {
          dead++;
          const reason = `PDFMonkey document gone (HTTP ${pmResult.httpStatus})`;
          deadDocs.push({ id: sub.id, name: sub.restaurantName, reason, docId: sub.pdfMonkeyDocumentId });
          console.log(`       💀 DEAD: ${reason}\n`);
          await sleep(BATCH_DELAY_MS);
          continue;
        }

        if (pmResult.status === 'found' && pmResult.downloadUrl) {
          pdfBytes = await fetchPdfBytes(pmResult.downloadUrl);
          if (pdfBytes) source = 'PDFMonkey fresh URL';
        }
        // status=error or no downloadUrl → fall through to Strategy 2
      }

      // ── Strategy 2: stored pdfDownloadUrl (may be expired S3 presigned URL) ─
      if (!pdfBytes && sub.pdfDownloadUrl) {
        pdfBytes = await fetchPdfBytes(sub.pdfDownloadUrl);
        if (pdfBytes) source = 'stored pdfDownloadUrl (possibly expired)';
      }

      if (!pdfBytes) {
        throw new Error('PDF unavailable from all sources');
      }

      const sizeKb = Math.round(pdfBytes.byteLength / 1024);
      console.log(`       ↳ fetched ${sizeKb} KB via ${source}`);

      // ── Upload to Supabase Storage ──────────────────────────────────────────
      const cachedUrl = await uploadToSupabase(sub.id, pdfBytes);
      if (!cachedUrl) throw new Error('Supabase upload returned null URL');

      // ── Update DB ───────────────────────────────────────────────────────────
      await db.submission.update({
        where: { id: sub.id },
        data:  { pdfCachedUrl: cachedUrl, pdfCachedAt: new Date() },
      });

      cached++;
      console.log(`       ✅ Cached (${cached} done)\n`);

    } catch (err) {
      failed++;
      const reason = err instanceof Error ? err.message.slice(0, 100) : 'Unknown';
      failedRows.push({ id: sub.id, name: sub.restaurantName, reason, docId: sub.pdfMonkeyDocumentId ?? null });
      console.log(`       ❌ FAILED: ${reason}\n`);
    }

    await sleep(BATCH_DELAY_MS);
  }

  // ── Final count from DB (source of truth) ──────────────────────────────────
  const stillUncached = await db.submission.count({
    where: { qualified: true, pdfStatus: 'complete', pdfCachedUrl: null },
  });

  await db.$disconnect();

  // ── Summary ─────────────────────────────────────────────────────────────────
  console.log('═'.repeat(72));
  console.log('BACKFILL COMPLETE');
  console.log('═'.repeat(72));
  console.log(`  Processed:      ${submissions.length}`);
  console.log(`  ✅ Cached:      ${cached}`);
  console.log(`  💀 Dead docs:   ${dead}  (PDFMonkey document gone — expected for old test data)`);
  console.log(`  ❌ Failed:      ${failed}`);
  console.log(`  Still uncached: ${stillUncached}  (target: 0, or = dead docs only)`);
  console.log('═'.repeat(72) + '\n');

  if (deadDocs.length) {
    console.log(`💀 Dead documents (${deadDocs.length}):`);
    deadDocs.forEach((d) => console.log(`   ${d.id.slice(-8)} | ${d.name.slice(0, 35)} | ${d.reason}`));
    console.log();
  }

  if (failedRows.length) {
    console.log(`❌ Failures (${failedRows.length}):`);
    failedRows.forEach((f) => console.log(`   ${f.id.slice(-8)} | ${f.name.slice(0, 35)} | ${f.reason}`));
    console.log();
  }
}

main().catch((err) => {
  console.error('\n❌ Fatal:', err instanceof Error ? err.message : String(err));
  db.$disconnect().catch(() => {});
  process.exit(1);
});
