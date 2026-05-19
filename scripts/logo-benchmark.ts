#!/usr/bin/env npx tsx
// Logo extraction benchmark — runs the full 9-source waterfall against 100 restaurant URLs.
// Run with: npx tsx scripts/logo-benchmark.ts
// Uses live network — takes ~5-10 minutes for 100 URLs.

import { readFileSync } from 'node:fs';
import path from 'node:path';

const FETCH_TIMEOUT_MS = 5_000;
const MAX_URLS = 100;

interface DatasetEntry {
  url: string;
  name?: string;
}

interface BenchmarkEntry {
  url: string;
  name: string;
  logoUrl: string | null;
  source: string;
  durationMs: number;
  htmlFetched: boolean;
}

async function fetchHtml(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; FSIQBot/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

async function main() {
  const datasetPath = path.resolve(process.cwd(), 'scripts/validation-dataset.json');
  const dataset = JSON.parse(readFileSync(datasetPath, 'utf-8')) as {
    restaurants: DatasetEntry[];
  };

  // Dynamic import avoids top-level await and path-alias issues
  const { extractLogoUrl } = await import('../src/lib/website/logo-extractor.js');

  const restaurants = dataset.restaurants.slice(0, MAX_URLS);
  const startAll = Date.now();

  console.log(`\nFSIQ Logo Benchmark — ${restaurants.length} URLs\n${'─'.repeat(60)}`);

  // ── Source capture ──────────────────────────────────────────────────────────
  let capturedSource: string | null = null;
  const origLog = console.log.bind(console);
  console.log = (...args: unknown[]) => {
    const msg = args.join(' ');
    if (msg.includes('[FSIQ LOGO] source:')) {
      capturedSource = msg.replace(/.*\[FSIQ LOGO\] source:\s*/, '').trim();
    }
    // suppress per-source noise during benchmark; keep progress lines
  };

  const results: BenchmarkEntry[] = [];

  for (let i = 0; i < restaurants.length; i++) {
    const entry = restaurants[i];
    const url   = entry.url;
    const name  = entry.name ?? url;

    origLog(`[${i + 1}/${restaurants.length}] ${name}`);

    const html = await fetchHtml(url);
    capturedSource = null;

    const t0 = Date.now();
    const logoUrl = await extractLogoUrl(url, html ?? undefined);
    const durationMs = Date.now() - t0;

    const source = capturedSource ?? (logoUrl ? 'unknown' : 'null');

    results.push({ url, name, logoUrl, source, durationMs, htmlFetched: html !== null });

    origLog(`   → ${logoUrl ? `✓ [${source}] ${logoUrl.slice(0, 70)} (${durationMs}ms)` : `✗ null (${durationMs}ms) html=${html !== null}`}`);
  }

  // Restore console.log
  console.log = origLog;

  const totalMs = Date.now() - startAll;

  // ── Report ──────────────────────────────────────────────────────────────────
  const total      = results.length;
  const succeeded  = results.filter((r) => r.logoUrl !== null).length;
  const failed     = total - succeeded;
  const successRate = ((succeeded / total) * 100).toFixed(1);
  const avgMs      = Math.round(results.reduce((s, r) => s + r.durationMs, 0) / total);

  const sourceCounts: Record<string, number> = {};
  for (const r of results) {
    sourceCounts[r.source] = (sourceCounts[r.source] ?? 0) + 1;
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`FSIQ LOGO BENCHMARK RESULTS`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`Total tested:  ${total}`);
  console.log(`Found logo:    ${succeeded}  (${successRate}%)`);
  console.log(`No logo:       ${failed}`);
  console.log(`Avg time/URL:  ${avgMs}ms`);
  console.log(`Total time:    ${(totalMs / 1000).toFixed(0)}s`);

  console.log(`\nSource breakdown:`);
  const sorted = Object.entries(sourceCounts).sort(([, a], [, b]) => b - a);
  for (const [src, count] of sorted) {
    const pct = ((count / total) * 100).toFixed(1);
    console.log(`  ${src.padEnd(22)} ${String(count).padStart(3)}  (${pct}%)`);
  }

  if (failed > 0) {
    console.log(`\nFailures (${failed}):`);
    for (const r of results.filter((x) => !x.logoUrl)) {
      console.log(`  ✗ ${r.name}`);
      console.log(`     url:      ${r.url}`);
      console.log(`     html:     ${r.htmlFetched ? 'fetched' : 'failed to fetch'}`);
    }
  }

  console.log(`\n${'═'.repeat(60)}`);
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
