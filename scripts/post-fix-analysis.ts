#!/usr/bin/env npx tsx
// Runs post-overhaul validation analysis and writes Phase 4 artifacts.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FinalDecision, ValidationResult } from '../src/lib/website/types';
import { runValidation } from '../src/lib/website/run-validation';

interface DatasetRestaurant {
  url: string;
  name: string;
  city: string;
  state: string;
  cuisine: string;
  source: string;
}

interface DatasetNonRestaurant {
  url: string;
  name: string;
  category: string;
  source: string;
}

interface ValidationDataset {
  restaurants: DatasetRestaurant[];
  non_restaurants: DatasetNonRestaurant[];
}

interface ScenarioFile {
  scenarios: Array<{
    id: number;
    name: string;
    examples: Array<{
      name: string;
      url: string;
      state?: string;
      finalDecision?: FinalDecision;
      restaurantSignalScore?: number;
      failureCategory?: string;
    }>;
  }>;
}

interface BenchmarkBaseline {
  metrics: {
    truePositiveRate: number;
    falseNegativeRate: number;
    falsePositiveRate: number;
    verifiedRestaurantRate: number;
    softMissRate: number;
  };
  falsePositives?: Array<{ url: string; name: string }>;
}

const DATASET_PATH = path.join(process.cwd(), 'scripts', 'validation-dataset.json');
const BASELINE_BENCHMARK_PATH = path.join(process.cwd(), 'scripts', 'benchmark-results.json');
const SCENARIOS_PATH = path.join(process.cwd(), 'scripts', '10-scenarios.json');
const ANALYSIS_PATH = path.join(process.cwd(), 'scripts', 'post-fix-analysis.json');
const SUMMARY_PATH = path.join(process.cwd(), 'scripts', 'post-fix-summary.txt');
const CONCURRENCY = 12;

type ExpectedKind = 'restaurant' | 'non_restaurant';

interface BenchmarkRow {
  expected: ExpectedKind;
  name: string;
  url: string;
  finalDecision: FinalDecision;
  restaurantSignalScore: number;
  negativeSignalScore: number;
  httpStatus: number;
  reachability: string;
  passed: boolean;
  falseNegative: boolean;
  falsePositive: boolean;
  softMiss: boolean;
  internalFlags: string[];
  reasons: string[];
}

async function main(): Promise<void> {
  const [dataset, baseline, scenarios] = await Promise.all([
    readJson<ValidationDataset>(DATASET_PATH),
    readJson<BenchmarkBaseline>(BASELINE_BENCHMARK_PATH),
    readJson<ScenarioFile>(SCENARIOS_PATH),
  ]);

  const scenarioRows = await runScenarioValidation(scenarios);
  const benchmarkRows = await runBenchmark(dataset);
  const metrics = summarizeBenchmark(benchmarkRows);
  const currentFalsePositives = benchmarkRows.filter((row) => row.falsePositive);
  const baselineFalsePositiveUrls = new Set((baseline.falsePositives ?? []).map((row) => row.url));
  const newlyIntroducedFalsePositives = currentFalsePositives.filter((row) => !baselineFalsePositiveUrls.has(row.url));
  const remainingRestaurantFailures = benchmarkRows.filter((row) => row.expected === 'restaurant' && row.finalDecision !== 'verified_restaurant');
  const headlessRequired = remainingRestaurantFailures.filter((row) =>
    row.reachability === 'thin' ||
    row.internalFlags.some((flag) => /thin|headless|http_403|http_503|cloudflare|connection_timeout|request_timeout/.test(flag)),
  ).length;

  const analysis = {
    generatedAt: new Date().toISOString(),
    scenarioValidation: {
      totalExamples: scenarioRows.length,
      verified: scenarioRows.filter((row) => row.afterDecision === 'verified_restaurant').length,
      rows: scenarioRows,
    },
    benchmark: {
      baselineMetrics: baseline.metrics,
      currentMetrics: metrics,
      deltas: {
        truePositiveRate: round(metrics.truePositiveRate - baseline.metrics.truePositiveRate),
        falseNegativeRate: round(metrics.falseNegativeRate - baseline.metrics.falseNegativeRate),
        falsePositiveRate: round(metrics.falsePositiveRate - baseline.metrics.falsePositiveRate),
        verifiedRestaurantRate: round(metrics.verifiedRestaurantRate - baseline.metrics.verifiedRestaurantRate),
      },
      theoreticalMaximumTruePositiveRateWithoutHeadless: round(100 - ((headlessRequired / dataset.restaurants.length) * 100)),
      remainingFailuresRequiringHeadlessPercent: round((headlessRequired / Math.max(1, remainingRestaurantFailures.length)) * 100),
      highestRoiFix: 'Trusted platform fast-path plus signal bundles; they rescue verifiable pages without new dependencies or external calls.',
      currentFalsePositives,
      newlyIntroducedFalsePositives,
      rows: benchmarkRows,
    },
  };

  await writeFile(ANALYSIS_PATH, `${JSON.stringify(analysis, null, 2)}\n`, 'utf8');
  await writeFile(SUMMARY_PATH, buildSummary(analysis), 'utf8');
  console.log(buildSummary(analysis));
}

async function runScenarioValidation(scenarios: ScenarioFile): Promise<Array<Record<string, unknown>>> {
  const rows: Array<Record<string, unknown>> = [];
  const examples = scenarios.scenarios.flatMap((scenario) =>
    scenario.examples.map((example) => ({ scenarioId: scenario.id, scenarioName: scenario.name, example })),
  );

  for (const item of examples) {
    const result = await runValidation({
      website: item.example.url,
      restaurantName: '',
    });

    rows.push({
      scenarioId: item.scenarioId,
      scenarioName: item.scenarioName,
      name: item.example.name,
      url: item.example.url,
      beforeDecision: item.example.finalDecision ?? null,
      beforeScore: item.example.restaurantSignalScore ?? null,
      beforeFailureCategory: item.example.failureCategory ?? null,
      afterDecision: result.finalDecision,
      afterScore: result.restaurantSignalScore,
      afterHttpStatus: result.httpStatus,
      afterReachability: result.websiteReachabilityStatus,
      fixedToVerified: result.finalDecision === 'verified_restaurant',
      internalFlags: result.internalFlags,
    });
    process.stdout.write(`\rScenario validation ${rows.length}/${examples.length}: ${item.example.name.slice(0, 35)}`);
  }
  process.stdout.write('\n');
  return rows;
}

async function runBenchmark(dataset: ValidationDataset): Promise<BenchmarkRow[]> {
  const entries = [
    ...dataset.restaurants.map((entry) => ({ ...entry, expected: 'restaurant' as const })),
    ...dataset.non_restaurants.map((entry) => ({ ...entry, state: 'CA', expected: 'non_restaurant' as const })),
  ];
  const rows: BenchmarkRow[] = [];
  let index = 0;
  let done = 0;

  async function worker(): Promise<void> {
    while (index < entries.length) {
      const entry = entries[index++];
      const result = await runValidation({
        website: entry.url,
        restaurantName: entry.name,
      });
      rows.push(toBenchmarkRow(entry.expected, entry.name, entry.url, result));
      done += 1;
      process.stdout.write(`\rBenchmark ${done}/${entries.length}: ${entry.name.slice(0, 35)}`);
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  process.stdout.write('\n');
  return rows;
}

function toBenchmarkRow(expected: ExpectedKind, name: string, url: string, result: ValidationResult): BenchmarkRow {
  const qualifies = result.finalDecision === 'verified_restaurant' || result.finalDecision === 'plausible_unverified';
  const rejected = result.finalDecision === 'clear_non_fit' || result.finalDecision === 'national_chain' || result.finalDecision === 'invalid_website';
  return {
    expected,
    name,
    url,
    finalDecision: result.finalDecision,
    restaurantSignalScore: result.restaurantSignalScore,
    negativeSignalScore: result.negativeSignalScore,
    httpStatus: result.httpStatus,
    reachability: result.websiteReachabilityStatus,
    passed: expected === 'restaurant' ? qualifies : rejected,
    falseNegative: expected === 'restaurant' && !qualifies,
    falsePositive: expected === 'non_restaurant' && qualifies,
    softMiss: expected === 'restaurant' && result.finalDecision === 'plausible_unverified',
    internalFlags: result.internalFlags,
    reasons: result.reasons,
  };
}

function summarizeBenchmark(rows: BenchmarkRow[]) {
  const restaurants = rows.filter((row) => row.expected === 'restaurant');
  const nonRestaurants = rows.filter((row) => row.expected === 'non_restaurant');
  return {
    truePositiveRate: pct(restaurants.filter((row) => row.finalDecision === 'verified_restaurant' || row.finalDecision === 'plausible_unverified').length, restaurants.length),
    verifiedRestaurantRate: pct(restaurants.filter((row) => row.finalDecision === 'verified_restaurant').length, restaurants.length),
    softMissRate: pct(restaurants.filter((row) => row.softMiss).length, restaurants.length),
    falseNegativeRate: pct(restaurants.filter((row) => row.falseNegative).length, restaurants.length),
    trueNegativeRate: pct(nonRestaurants.filter((row) => !row.falsePositive).length, nonRestaurants.length),
    falsePositiveRate: pct(nonRestaurants.filter((row) => row.falsePositive).length, nonRestaurants.length),
    overallAccuracy: pct(rows.filter((row) => row.passed).length, rows.length),
  };
}

function buildSummary(analysis: {
  scenarioValidation: { totalExamples: number; verified: number };
  benchmark: {
    baselineMetrics: BenchmarkBaseline['metrics'];
    currentMetrics: ReturnType<typeof summarizeBenchmark>;
    deltas: Record<string, number>;
    theoreticalMaximumTruePositiveRateWithoutHeadless: number;
    remainingFailuresRequiringHeadlessPercent: number;
    highestRoiFix: string;
    currentFalsePositives: BenchmarkRow[];
    newlyIntroducedFalsePositives: BenchmarkRow[];
  };
}): string {
  return [
    'Post-Fix Website Validation Analysis',
    '====================================',
    `Scenario examples verified: ${analysis.scenarioValidation.verified}/${analysis.scenarioValidation.totalExamples}`,
    '',
    'Benchmark Metrics',
    '-----------------',
    `True positive rate: ${analysis.benchmark.currentMetrics.truePositiveRate}% (previous ${analysis.benchmark.baselineMetrics.truePositiveRate}%, delta ${analysis.benchmark.deltas.truePositiveRate})`,
    `False negative rate: ${analysis.benchmark.currentMetrics.falseNegativeRate}% (previous ${analysis.benchmark.baselineMetrics.falseNegativeRate}%, delta ${analysis.benchmark.deltas.falseNegativeRate})`,
    `False positive rate: ${analysis.benchmark.currentMetrics.falsePositiveRate}% (previous ${analysis.benchmark.baselineMetrics.falsePositiveRate}%, delta ${analysis.benchmark.deltas.falsePositiveRate})`,
    `Verified restaurant rate: ${analysis.benchmark.currentMetrics.verifiedRestaurantRate}% (previous ${analysis.benchmark.baselineMetrics.verifiedRestaurantRate}%, delta ${analysis.benchmark.deltas.verifiedRestaurantRate})`,
    '',
    `Highest ROI fix: ${analysis.benchmark.highestRoiFix}`,
    `Current false positives: ${analysis.benchmark.currentFalsePositives.length}`,
    `New false positives introduced vs baseline URL set: ${analysis.benchmark.newlyIntroducedFalsePositives.length}`,
    `Theoretical maximum true positive rate without headless browser: ${analysis.benchmark.theoreticalMaximumTruePositiveRateWithoutHeadless}%`,
    `Remaining restaurant failures requiring headless browser: ${analysis.benchmark.remainingFailuresRequiringHeadlessPercent}%`,
    '',
  ].join('\n');
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, 'utf8')) as T;
}

function pct(numerator: number, denominator: number): number {
  return round((numerator / Math.max(1, denominator)) * 100);
}

function round(value: number): number {
  return Number(value.toFixed(2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
