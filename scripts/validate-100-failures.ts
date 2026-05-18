#!/usr/bin/env npx tsx
// Re-runs scripts/100-failures.json through the current validation pipeline and
// writes before/after fix metrics.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { runValidation } from '../src/lib/website/run-validation';

interface FailureRecord {
  url: string;
  name: string;
  city: string;
  finalDecision: string;
  httpStatus: number;
  restaurantSignalScore: number;
  failureCategory: string;
}

interface FailureDataset {
  failures: FailureRecord[];
}

const INPUT_PATH = path.join(process.cwd(), 'scripts', '100-failures.json');
const OUTPUT_PATH = path.join(process.cwd(), 'scripts', '100-failures-after.json');
const SUMMARY_PATH = path.join(process.cwd(), 'scripts', '100-failures-summary.txt');

async function main(): Promise<void> {
  const dataset = JSON.parse(await readFile(INPUT_PATH, 'utf8')) as FailureDataset;
  const rows = [];

  for (const failure of dataset.failures) {
    const result = await runValidation({
      website: failure.url,
      restaurantName: '',
      state: extractState(failure.city) || 'CA',
    });

    rows.push({
      url: failure.url,
      name: failure.name,
      city: failure.city,
      beforeDecision: failure.finalDecision,
      beforeScore: failure.restaurantSignalScore,
      beforeCategory: failure.failureCategory,
      afterDecision: result.finalDecision,
      afterHttpStatus: result.httpStatus,
      afterScore: result.restaurantSignalScore,
      afterReachability: result.websiteReachabilityStatus,
      fixed: result.finalDecision === 'verified_restaurant',
      reasons: result.reasons,
      internalFlags: result.internalFlags,
    });

    process.stdout.write(`\rValidated ${rows.length}/${dataset.failures.length}: ${failure.name.slice(0, 40)}`);
  }

  const fixed = rows.filter((row) => row.fixed);
  const stillFailing = rows.filter((row) => !row.fixed);
  const summary = {
    generatedAt: new Date().toISOString(),
    total: rows.length,
    fixed: fixed.length,
    stillFailing: stillFailing.length,
    beforeAccuracy: 0,
    afterAccuracy: fixed.length / rows.length,
    stillFailingByCategory: countBy(stillFailing, 'beforeCategory'),
    fixedByCategory: countBy(fixed, 'beforeCategory'),
    stillFailingByDecision: countBy(stillFailing, 'afterDecision'),
  };

  await writeFile(OUTPUT_PATH, `${JSON.stringify({ summary, rows }, null, 2)}\n`, 'utf8');
  await writeFile(SUMMARY_PATH, buildSummaryText(summary), 'utf8');
  console.log(`\nWrote ${OUTPUT_PATH}`);
  console.log(`Wrote ${SUMMARY_PATH}`);
  console.log(buildSummaryText(summary));
}

function extractState(city: string): string | null {
  const parts = city.split(',').map((part) => part.trim());
  return parts[1] || null;
}

function countBy(rows: Array<Record<string, unknown>>, key: string): Record<string, number> {
  return rows.reduce<Record<string, number>>((counts, row) => {
    const value = String(row[key] ?? 'unknown');
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function buildSummaryText(summary: {
  total: number;
  fixed: number;
  stillFailing: number;
  beforeAccuracy: number;
  afterAccuracy: number;
  stillFailingByCategory: Record<string, number>;
  fixedByCategory: Record<string, number>;
  stillFailingByDecision: Record<string, number>;
}): string {
  return [
    '100 Failure Validation Summary',
    '==============================',
    `Total baseline failures: ${summary.total}`,
    `Fixed after changes: ${summary.fixed}`,
    `Still failing: ${summary.stillFailing}`,
    `Before accuracy on this dataset: ${(summary.beforeAccuracy * 100).toFixed(2)}%`,
    `After accuracy on this dataset: ${(summary.afterAccuracy * 100).toFixed(2)}%`,
    '',
    `Fixed by baseline category: ${JSON.stringify(summary.fixedByCategory)}`,
    `Still failing by baseline category: ${JSON.stringify(summary.stillFailingByCategory)}`,
    `Still failing by current decision: ${JSON.stringify(summary.stillFailingByDecision)}`,
    '',
  ].join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
