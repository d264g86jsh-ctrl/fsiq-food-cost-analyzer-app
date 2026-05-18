#!/usr/bin/env npx tsx
// Runs the validation pipeline against the benchmark dataset and reports metrics.
// Usage:
//   npx tsx scripts/run-validation-benchmark.ts             # full run
//   npx tsx scripts/run-validation-benchmark.ts --dry-run    # first 50 URLs only

import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { ValidationResult, FinalDecision, ReachabilityStatus } from '../src/lib/website/types';

// ── Types ────────────────────────────────────────────────────────────────────

interface RestaurantEntry {
  url: string;
  name: string;
  city: string;
  state: string;
  cuisine: string;
  source: string;
}

interface NonRestaurantEntry {
  url: string;
  name: string;
  category: string;
  source: string;
}

interface ValidationDataset {
  restaurants: RestaurantEntry[];
  non_restaurants: NonRestaurantEntry[];
  metadata: { total_restaurants: number; total_non_restaurants: number; built_at: string };
}

type ExpectedKind = 'restaurant' | 'non_restaurant';

type FailurePattern =
  | 'cloudflare_or_bot_protection'
  | 'minimal_html'
  | 'javascript_rendered'
  | 'low_restaurant_signals'
  | 'national_chain_false_positive'
  | 'invalid_or_dns'
  | 'other';

interface BenchmarkRow {
  expected: ExpectedKind;
  name: string;
  url: string;
  state?: string;
  cuisine?: string;
  category?: string;
  finalDecision: FinalDecision;
  passed: boolean;
  falsePositive: boolean;
  falseNegative: boolean;
  softMiss: boolean;
  httpStatus: number;
  restaurantSignalScore: number;
  negativeSignalScore: number;
  websiteReachabilityStatus: ReachabilityStatus;
  nationalChainScore: number;
  timeTakenMs: number;
  reasons: string[];
  internalFlags: string[];
  failurePattern: FailurePattern | null;
  error?: string;
}

interface BenchmarkResults {
  generatedAt: string;
  dryRun: boolean;
  totals: { restaurants: number; nonRestaurants: number; total: number };
  metrics: {
    truePositiveRate: number;
    verifiedRestaurantRate: number;
    softMissRate: number;
    falseNegativeRate: number;
    trueNegativeRate: number;
    falsePositiveRate: number;
    overallAccuracy: number;
  };
  breakdownByCuisine: Record<string, { total: number; verified: number; plausible: number; falseNeg: number }>;
  breakdownByState: Record<string, { total: number; verified: number; plausible: number; falseNeg: number }>;
  breakdownByCategory: Record<string, { total: number; rejected: number; falsePos: number }>;
  failurePatterns: Record<FailurePattern, number>;
  falseNegatives: BenchmarkRow[];
  softMisses: BenchmarkRow[];
  falsePositives: BenchmarkRow[];
  rows: BenchmarkRow[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const DATASET_PATH = path.join(process.cwd(), 'scripts', 'validation-dataset.json');
const RESULTS_PATH = path.join(process.cwd(), 'scripts', 'benchmark-results.json');
const SUMMARY_PATH = path.join(process.cwd(), 'scripts', 'benchmark-summary.txt');
const CONCURRENCY = 10;
const DRY_RUN_LIMIT = 50;

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  if (dryRun) console.log('DRY RUN: testing first 50 URLs only.\n');

  const dataset = await loadDataset();
  const runValidation = await loadRunValidation();

  const allEntries = [
    ...dataset.restaurants.map((e) => ({ ...e, expected: 'restaurant' as const })),
    ...dataset.non_restaurants.map((e) => ({ ...e, expected: 'non_restaurant' as const })),
  ];

  const entries = dryRun ? allEntries.slice(0, DRY_RUN_LIMIT) : allEntries;
  console.log(`Running ${entries.length} URLs with concurrency ${CONCURRENCY}...\n`);

  const rows = await runAll(entries, runValidation);
  const results = summarize(rows, dryRun);

  await writeFile(RESULTS_PATH, `${JSON.stringify(results, null, 2)}\n`, 'utf8');

  const summaryText = buildSummaryText(results);
  await writeFile(SUMMARY_PATH, summaryText, 'utf8');

  console.log(summaryText);
  console.log(`\nFull results: ${RESULTS_PATH}`);
  console.log(`Summary: ${SUMMARY_PATH}`);
}

// ── Dataset loading ──────────────────────────────────────────────────────────

async function loadDataset(): Promise<ValidationDataset> {
  if (!existsSync(DATASET_PATH)) {
    throw new Error(`Dataset not found at ${DATASET_PATH}. Run: npx tsx scripts/build-validation-dataset.ts`);
  }
  return JSON.parse(await readFile(DATASET_PATH, 'utf8'));
}

async function loadRunValidation(): Promise<
  (input: { website: string; restaurantName: string; state: string }) => Promise<ValidationResult>
> {
  const mod = await import('../src/lib/website/run-validation.js');
  return mod.runValidation;
}

// ── Concurrent runner ────────────────────────────────────────────────────────

type QueueEntry = (RestaurantEntry | NonRestaurantEntry) & { expected: ExpectedKind };

async function runAll(
  entries: QueueEntry[],
  runValidation: (input: { website: string; restaurantName: string; state: string }) => Promise<ValidationResult>,
): Promise<BenchmarkRow[]> {
  const rows: BenchmarkRow[] = [];
  let idx = 0;
  let done = 0;

  async function worker() {
    while (idx < entries.length) {
      const current = entries[idx++];
      const row = await runOne(current, runValidation);
      rows.push(row);
      done++;
      const pct = ((done / entries.length) * 100).toFixed(0);
      process.stdout.write(`\r  ${done}/${entries.length} (${pct}%) — ${row.passed ? 'PASS' : 'FAIL'} ${row.name.slice(0, 30)}`);
    }
  }

  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, entries.length) }, worker));
  process.stdout.write('\n\n');
  return rows;
}

async function runOne(entry: QueueEntry, runValidation: Function): Promise<BenchmarkRow> {
  const state = 'state' in entry ? entry.state : 'CA';
  const cuisine = 'cuisine' in entry ? entry.cuisine : undefined;
  const category = 'category' in entry ? entry.category : undefined;
  const startMs = Date.now();

  try {
    const result: ValidationResult = await runValidation({
      website: entry.url,
      restaurantName: entry.name,
      state,
    });
    return toRow(entry, state, cuisine, category, result, Date.now() - startMs);
  } catch (err) {
    return {
      expected: entry.expected,
      name: entry.name,
      url: entry.url,
      state,
      cuisine,
      category,
      finalDecision: 'invalid_website',
      passed: false,
      falsePositive: false,
      falseNegative: entry.expected === 'restaurant',
      softMiss: false,
      httpStatus: 0,
      restaurantSignalScore: 0,
      negativeSignalScore: 0,
      websiteReachabilityStatus: 'inaccessible',
      nationalChainScore: 0,
      timeTakenMs: Date.now() - startMs,
      reasons: ['benchmark_exception'],
      internalFlags: [],
      failurePattern: 'other',
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function toRow(
  entry: QueueEntry,
  state: string,
  cuisine: string | undefined,
  category: string | undefined,
  r: ValidationResult,
  timeTakenMs: number,
): BenchmarkRow {
  const qualifies = r.finalDecision === 'verified_restaurant' || r.finalDecision === 'plausible_unverified';
  const rejected = r.finalDecision === 'clear_non_fit' || r.finalDecision === 'national_chain' || r.finalDecision === 'invalid_website';
  const passed = entry.expected === 'restaurant' ? qualifies : rejected;
  const falseNeg = entry.expected === 'restaurant' && !qualifies;
  const softMiss = entry.expected === 'restaurant' && r.finalDecision === 'plausible_unverified';
  const falsePosFlag = entry.expected === 'non_restaurant' && qualifies;

  return {
    expected: entry.expected,
    name: entry.name,
    url: entry.url,
    state,
    cuisine,
    category,
    finalDecision: r.finalDecision as FinalDecision,
    passed,
    falsePositive: falsePosFlag,
    falseNegative: falseNeg,
    softMiss,
    httpStatus: r.httpStatus,
    restaurantSignalScore: r.restaurantSignalScore,
    negativeSignalScore: r.negativeSignalScore,
    websiteReachabilityStatus: r.websiteReachabilityStatus,
    nationalChainScore: r.nationalChainScore,
    timeTakenMs,
    reasons: r.reasons,
    internalFlags: r.internalFlags,
    failurePattern: falseNeg || softMiss ? categorizeFailure(r) : null,
  };
}

// ── Failure categorization ───────────────────────────────────────────────────

function categorizeFailure(r: ValidationResult): FailurePattern {
  const flags = r.internalFlags.join(' ');
  if (
    r.websiteReachabilityStatus === 'blocked' ||
    /http_403|http_401|http_429|http_50|cloudflare|bot|captcha|request_timeout|connection_timeout|network_error/.test(flags)
  )
    return 'cloudflare_or_bot_protection';
  if (r.websiteReachabilityStatus === 'thin' || flags.includes('thin_content'))
    return r.headlessBrowserUsed ? 'javascript_rendered' : 'minimal_html';
  if (r.finalDecision === 'national_chain' || r.nationalChainScore >= 85)
    return 'national_chain_false_positive';
  if (r.websiteReachabilityStatus === 'invalid' || /dns_nxdomain|http_404/.test(flags))
    return 'invalid_or_dns';
  if (r.restaurantSignalScore < 60)
    return 'low_restaurant_signals';
  return 'other';
}

// ── Summarization ────────────────────────────────────────────────────────────

function summarize(rows: BenchmarkRow[], dryRun: boolean): BenchmarkResults {
  const restaurants = rows.filter((r) => r.expected === 'restaurant');
  const nonRest = rows.filter((r) => r.expected === 'non_restaurant');
  const verified = restaurants.filter((r) => r.finalDecision === 'verified_restaurant');
  const tp = restaurants.filter((r) => r.passed);
  const fn = restaurants.filter((r) => r.falseNegative);
  const sm = restaurants.filter((r) => r.softMiss);
  const tn = nonRest.filter((r) => r.passed);
  const fp = nonRest.filter((r) => r.falsePositive);
  const accurate = rows.filter((r) => r.passed);

  const patterns = emptyPatterns();
  for (const r of [...fn, ...sm]) {
    if (r.failurePattern) patterns[r.failurePattern]++;
  }

  return {
    generatedAt: new Date().toISOString(),
    dryRun,
    totals: { restaurants: restaurants.length, nonRestaurants: nonRest.length, total: rows.length },
    metrics: {
      truePositiveRate: pct(tp.length, restaurants.length),
      verifiedRestaurantRate: pct(verified.length, restaurants.length),
      softMissRate: pct(sm.length, restaurants.length),
      falseNegativeRate: pct(fn.length, restaurants.length),
      trueNegativeRate: pct(tn.length, nonRest.length),
      falsePositiveRate: pct(fp.length, nonRest.length),
      overallAccuracy: pct(accurate.length, rows.length),
    },
    breakdownByCuisine: buildCuisineBreakdown(restaurants),
    breakdownByState: buildStateBreakdown(restaurants),
    breakdownByCategory: buildCategoryBreakdown(nonRest),
    failurePatterns: patterns,
    falseNegatives: fn,
    softMisses: sm,
    falsePositives: fp,
    rows,
  };
}

function buildCuisineBreakdown(rows: BenchmarkRow[]) {
  const out: Record<string, { total: number; verified: number; plausible: number; falseNeg: number }> = {};
  for (const r of rows) {
    const c = r.cuisine ?? 'Unknown';
    if (!out[c]) out[c] = { total: 0, verified: 0, plausible: 0, falseNeg: 0 };
    out[c].total++;
    if (r.finalDecision === 'verified_restaurant') out[c].verified++;
    if (r.finalDecision === 'plausible_unverified') out[c].plausible++;
    if (r.falseNegative) out[c].falseNeg++;
  }
  return out;
}

function buildStateBreakdown(rows: BenchmarkRow[]) {
  const out: Record<string, { total: number; verified: number; plausible: number; falseNeg: number }> = {};
  for (const r of rows) {
    const s = r.state ?? 'Unknown';
    if (!out[s]) out[s] = { total: 0, verified: 0, plausible: 0, falseNeg: 0 };
    out[s].total++;
    if (r.finalDecision === 'verified_restaurant') out[s].verified++;
    if (r.finalDecision === 'plausible_unverified') out[s].plausible++;
    if (r.falseNegative) out[s].falseNeg++;
  }
  return out;
}

function buildCategoryBreakdown(rows: BenchmarkRow[]) {
  const out: Record<string, { total: number; rejected: number; falsePos: number }> = {};
  for (const r of rows) {
    const c = r.category ?? 'Unknown';
    if (!out[c]) out[c] = { total: 0, rejected: 0, falsePos: 0 };
    out[c].total++;
    if (r.passed) out[c].rejected++;
    if (r.falsePositive) out[c].falsePos++;
  }
  return out;
}

function emptyPatterns(): Record<FailurePattern, number> {
  return {
    cloudflare_or_bot_protection: 0,
    minimal_html: 0,
    javascript_rendered: 0,
    low_restaurant_signals: 0,
    national_chain_false_positive: 0,
    invalid_or_dns: 0,
    other: 0,
  };
}

// ── Text report builder ──────────────────────────────────────────────────────

function buildSummaryText(r: BenchmarkResults): string {
  const lines: string[] = [];
  const hr = '═'.repeat(72);
  lines.push(hr);
  lines.push('  WEBSITE VALIDATION BENCHMARK REPORT');
  lines.push(`  Generated: ${r.generatedAt}${r.dryRun ? '  (DRY RUN)' : ''}`);
  lines.push(hr);
  lines.push('');

  lines.push('DATASET');
  lines.push(`  Restaurants:     ${r.totals.restaurants}`);
  lines.push(`  Non-restaurants: ${r.totals.nonRestaurants}`);
  lines.push(`  Total:           ${r.totals.total}`);
  lines.push('');

  lines.push('PIPELINE ACCURACY');
  lines.push(`  Overall accuracy:       ${fmt(r.metrics.overallAccuracy)}`);
  lines.push(`  True positive rate:     ${fmt(r.metrics.truePositiveRate)}  (restaurants correctly qualified)`);
  lines.push(`  Verified restaurant:    ${fmt(r.metrics.verifiedRestaurantRate)}  (full confidence)`);
  lines.push(`  Soft miss (plausible):  ${fmt(r.metrics.softMissRate)}  (qualified but not fully verified)`);
  lines.push(`  FALSE NEGATIVE RATE:    ${fmt(r.metrics.falseNegativeRate)}  *** MOST IMPORTANT — real restaurants lost ***`);
  lines.push(`  True negative rate:     ${fmt(r.metrics.trueNegativeRate)}  (non-restaurants correctly rejected)`);
  lines.push(`  False positive rate:    ${fmt(r.metrics.falsePositiveRate)}  (non-restaurants incorrectly qualified)`);
  lines.push('');

  lines.push('FAILURE PATTERNS (false negatives + soft misses)');
  const sorted = Object.entries(r.failurePatterns).sort((a, b) => b[1] - a[1]);
  for (const [pattern, count] of sorted) {
    if (count > 0) lines.push(`  ${count.toString().padStart(4)}  ${pattern}`);
  }
  if (sorted.every(([, c]) => c === 0)) lines.push('  (none)');
  lines.push('');

  lines.push('BREAKDOWN BY STATE (top 15 by count)');
  const states = Object.entries(r.breakdownByState)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 15);
  lines.push('  State | Total | Verified | Plausible | FalseNeg');
  for (const [state, s] of states) {
    lines.push(
      `  ${state.padEnd(5)} | ${pad(s.total)} | ${pad(s.verified)}    | ${pad(s.plausible)}     | ${pad(s.falseNeg)}`,
    );
  }
  lines.push('');

  lines.push('BREAKDOWN BY CUISINE (top 15)');
  const cuisines = Object.entries(r.breakdownByCuisine)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, 15);
  lines.push('  Cuisine          | Total | Verified | Plausible | FalseNeg');
  for (const [cuisine, c] of cuisines) {
    lines.push(
      `  ${cuisine.padEnd(18)} | ${pad(c.total)} | ${pad(c.verified)}    | ${pad(c.plausible)}     | ${pad(c.falseNeg)}`,
    );
  }
  lines.push('');

  lines.push('BREAKDOWN BY NON-RESTAURANT CATEGORY');
  const cats = Object.entries(r.breakdownByCategory).sort((a, b) => b[1].total - a[1].total);
  lines.push('  Category         | Total | Rejected | FalsePos');
  for (const [cat, c] of cats) {
    lines.push(`  ${cat.padEnd(18)} | ${pad(c.total)} | ${pad(c.rejected)}    | ${pad(c.falsePos)}`);
  }
  lines.push('');

  if (r.falseNegatives.length > 0) {
    lines.push('FALSE NEGATIVES (real restaurants DQ\'d or invalid)');
    for (const row of r.falseNegatives.slice(0, 30)) {
      lines.push(
        `  ${row.name.slice(0, 30).padEnd(30)} | ${row.url.slice(0, 40).padEnd(40)} | ${row.finalDecision.padEnd(20)} | score=${row.restaurantSignalScore} | http=${row.httpStatus} | ${row.failurePattern ?? ''}`,
      );
    }
    if (r.falseNegatives.length > 30) lines.push(`  ... and ${r.falseNegatives.length - 30} more`);
    lines.push('');
  }

  if (r.softMisses.length > 0) {
    lines.push('SOFT MISSES (plausible_unverified instead of verified_restaurant, top 30)');
    for (const row of r.softMisses.slice(0, 30)) {
      lines.push(
        `  ${row.name.slice(0, 30).padEnd(30)} | ${row.url.slice(0, 40).padEnd(40)} | score=${row.restaurantSignalScore} | http=${row.httpStatus} | ${row.failurePattern ?? ''}`,
      );
    }
    if (r.softMisses.length > 30) lines.push(`  ... and ${r.softMisses.length - 30} more`);
    lines.push('');
  }

  if (r.falsePositives.length > 0) {
    lines.push('FALSE POSITIVES (non-restaurants that passed, top 20)');
    for (const row of r.falsePositives.slice(0, 20)) {
      lines.push(
        `  ${row.name.slice(0, 30).padEnd(30)} | ${row.url.slice(0, 40).padEnd(40)} | ${row.finalDecision.padEnd(20)} | restScore=${row.restaurantSignalScore} negScore=${row.negativeSignalScore}`,
      );
    }
    if (r.falsePositives.length > 20) lines.push(`  ... and ${r.falsePositives.length - 20} more`);
    lines.push('');
  }

  lines.push(hr);
  return lines.join('\n') + '\n';
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function pct(num: number, den: number): number {
  if (den === 0) return 0;
  return Number(((num / den) * 100).toFixed(2));
}

function fmt(v: number): string {
  return `${v.toFixed(2)}%`.padStart(8);
}

function pad(n: number): string {
  return n.toString().padStart(5);
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
