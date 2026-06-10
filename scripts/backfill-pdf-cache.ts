#!/usr/bin/env npx tsx
// Backfill script: Cache all un-cached PDFs from stress test to Supabase Storage.
// Requires env vars: DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, PDFMONKEY_API_KEY
//
// Usage:
//   npx tsx scripts/backfill-pdf-cache.ts
//
// Resume-safe: only processes submissions where pdfCachedUrl IS NULL.
// Re-running is always safe — already-cached submissions are skipped.

import path from 'node:path';
import fs from 'node:fs';

// Load .env.local manually so this script picks up local dev vars
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
const BUCKET            = 'pdf-cache';
const BATCH_DELAY_MS    = 600; // ms between submissions to avoid rate limits

const db       = new PrismaClient();
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getFreshPdfMonkeyUrl(docId: string): Promise<string | null> {
  try {
    const res = await fetch(`https://api.pdfmonkey.io/api/v1/documents/${docId}`, {
      headers: { Authorization: `Bearer ${PDFMONKEY_API_KEY}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { document?: { download_url?: string | null } };
    return data?.document?.download_url ?? null;
  } catch {
    return null;
  }
}

async function fetchPdfBytes(url: string): Promise<ArrayBuffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return null;
    return res.arrayBuffer();
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
  console.log('\n' + '═'.repeat(70));
  console.log('BACKFILL: Cache Old PDFs to Supabase Storage');
  console.log('═'.repeat(70));
  console.log(`  Supabase URL: ${SUPABASE_URL}`);
  console.log(`  Bucket:       ${BUCKET}\n`);

  // Query uncached completed PDFs
  const submissions = await db.submission.findMany({
    where: {
      pdfStatus:     'complete',
      pdfDownloadUrl: { not: null },
      pdfCachedUrl:  null,
    },
    select: {
      id: true,
      restaurantName: true,
      pdfDownloadUrl: true,
      pdfMonkeyDocumentId: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  console.log(`📋 Found ${submissions.length} submissions to cache.\n`);
  if (!submissions.length) {
    console.log('✅ All PDFs already cached — nothing to do.\n');
    await db.$disconnect();
    return;
  }

  let cached = 0, failed = 0;
  const failures: { id: string; name: string; reason: string }[] = [];

  for (let i = 0; i < submissions.length; i++) {
    const sub = submissions[i];
    const num = `[${i + 1}/${submissions.length}]`;
    const pct = `${Math.round((i + 1) / submissions.length * 100)}%`;
    const name = sub.restaurantName.slice(0, 35);
    process.stdout.write(`${num} ${pct} | ${name}\n`);

    try {
      // Strategy 1: fresh URL from PDFMonkey (preferred — never expires on fetch)
      let pdfBytes: ArrayBuffer | null = null;
      if (sub.pdfMonkeyDocumentId) {
        const freshUrl = await getFreshPdfMonkeyUrl(sub.pdfMonkeyDocumentId);
        if (freshUrl) {
          pdfBytes = await fetchPdfBytes(freshUrl);
          if (pdfBytes) process.stdout.write('     ↳ fetched via fresh PDFMonkey URL\n');
        }
      }

      // Strategy 2: try stored download_url (may be expired, worth trying)
      if (!pdfBytes && sub.pdfDownloadUrl) {
        pdfBytes = await fetchPdfBytes(sub.pdfDownloadUrl);
        if (pdfBytes) process.stdout.write('     ↳ fetched via stored URL\n');
      }

      if (!pdfBytes) {
        throw new Error('PDF bytes unavailable from all sources (URL expired, doc may be deleted)');
      }

      // Upload to Supabase
      const cachedUrl = await uploadToSupabase(sub.id, pdfBytes);
      if (!cachedUrl) throw new Error('Supabase upload returned null URL');

      // Update DB
      await db.submission.update({
        where: { id: sub.id },
        data: { pdfCachedUrl: cachedUrl, pdfCachedAt: new Date() },
      });

      cached++;
      process.stdout.write(`     ✅ Cached (${cached} total)\n`);

    } catch (err) {
      failed++;
      const reason = err instanceof Error ? err.message.slice(0, 80) : 'Unknown';
      failures.push({ id: sub.id, name: sub.restaurantName, reason });
      process.stdout.write(`     ❌ Failed: ${reason}\n`);
    }

    await sleep(BATCH_DELAY_MS);
  }

  // Summary
  console.log('\n' + '═'.repeat(70));
  console.log('BACKFILL COMPLETE');
  console.log('═'.repeat(70));
  console.log(`  Total:        ${submissions.length}`);
  console.log(`  ✅ Cached:    ${cached}`);
  console.log(`  ❌ Failed:    ${failed}`);
  console.log(`  Success rate: ${Math.round(cached / submissions.length * 100)}%`);
  console.log('═'.repeat(70) + '\n');

  if (failures.length) {
    console.log(`⚠️  Failed submissions (${Math.min(failures.length, 15)} shown):`);
    failures.slice(0, 15).forEach((f) => {
      console.log(`  - ${f.name.slice(0, 35)} | ${f.reason}`);
    });
    if (failures.length > 15) console.log(`  ... and ${failures.length - 15} more`);
    console.log();
  }

  await db.$disconnect();

  if (failed > 0) {
    console.log(`ℹ️  ${failed} PDFs could not be cached — likely expired PDFMonkey documents.`);
    console.log('   These will return 410 until the user regenerates. Acceptable for stress-test data.\n');
  }
}

main().catch((err) => {
  console.error('\n❌ Fatal:', err.message);
  db.$disconnect().catch(() => {});
  process.exit(1);
});
