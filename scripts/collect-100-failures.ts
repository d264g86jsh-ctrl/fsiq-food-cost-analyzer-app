#!/usr/bin/env npx tsx
// Collects exactly 100 restaurant URLs from the validation dataset that do not
// currently validate as verified_restaurant when no restaurant name is supplied.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkWebsite } from '../src/lib/website/check-website';
import { runValidation } from '../src/lib/website/run-validation';
import type { ValidationResult } from '../src/lib/website/types';
import type { WebsiteSignals } from '../src/lib/website/extract-signals';

interface DatasetRestaurant {
  url: string;
  name: string;
  city: string;
  state: string;
  cuisine: string;
  source: string;
}

interface ValidationDataset {
  restaurants: DatasetRestaurant[];
}

interface FailureRecord {
  url: string;
  name: string;
  city: string;
  finalDecision: string;
  httpStatus: number;
  restaurantSignalScore: number;
  signalsFound: string[];
  signalsMissing: string[];
  failureCategory: string;
  domainWords: string[];
  titleTag: string;
  metaDescription: string;
  ogTitle: string;
}

const DATASET_PATH = path.join(process.cwd(), 'scripts', 'validation-dataset.json');
const OUTPUT_PATH = path.join(process.cwd(), 'scripts', '100-failures.json');
const TARGET_FAILURES = 100;

async function main(): Promise<void> {
  const dataset = JSON.parse(await readFile(DATASET_PATH, 'utf8')) as ValidationDataset;
  const failures: FailureRecord[] = [];

  for (const entry of dataset.restaurants) {
    const result = await runValidation({
      website: entry.url,
      restaurantName: '',
      state: entry.state || 'CA',
    });

    if (result.finalDecision === 'verified_restaurant') {
      continue;
    }

    const diagnostics = await fetchDiagnostics(result.finalUrl || entry.url);
    const signals = diagnostics.signals;
    failures.push({
      url: entry.url,
      name: entry.name,
      city: [entry.city, entry.state].filter(Boolean).join(', '),
      finalDecision: result.finalDecision,
      httpStatus: result.httpStatus,
      restaurantSignalScore: result.restaurantSignalScore,
      signalsFound: buildSignalsFound(result, signals),
      signalsMissing: buildSignalsMissing(signals),
      failureCategory: categorizeFailure(result, signals),
      domainWords: splitDomainWords(result.finalUrl || entry.url),
      titleTag: signals?.pageTitle ?? '',
      metaDescription: signals?.metaDescription ?? '',
      ogTitle: signals?.ogTitle ?? '',
    });

    process.stdout.write(`\rCollected ${failures.length}/${TARGET_FAILURES}: ${entry.name.slice(0, 40)}`);
    if (failures.length === TARGET_FAILURES) break;
  }

  if (failures.length !== TARGET_FAILURES) {
    throw new Error(`Expected ${TARGET_FAILURES} failures; collected ${failures.length}.`);
  }

  await writeFile(OUTPUT_PATH, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    source: 'scripts/validation-dataset.json seed restaurant URLs',
    note: 'Each URL is from the curated restaurant seed dataset and was run with restaurantName set to an empty string.',
    failures,
  }, null, 2)}\n`, 'utf8');

  console.log(`\nWrote ${OUTPUT_PATH}`);
}

async function fetchDiagnostics(url: string): Promise<{ signals: WebsiteSignals | null }> {
  try {
    const checked = await checkWebsite(url);
    return { signals: checked.signals };
  } catch {
    return { signals: null };
  }
}

function buildSignalsFound(result: ValidationResult, signals: WebsiteSignals | null): string[] {
  const found: string[] = [];
  if (signals?.hasRestaurantSchema) found.push('restaurant_schema');
  if (signals?.hasAgeGate) found.push('age_gate');
  if (signals?.hasBotProtection) found.push('bot_protection');
  if (signals?.pageTitle) found.push('title_tag');
  if (signals?.metaDescription) found.push('meta_description');
  if (signals?.ogTitle) found.push('og_title');
  if (signals?.ogDescription) found.push('og_description');
  if (signals?.navLinkTexts.some((text) => /menu|reservation|order|catering|private dining/i.test(text))) {
    found.push('restaurant_nav');
  }
  if (signals?.socialLinks.length) found.push('social_or_ordering_links');
  if (result.internalFlags.includes('thin_content')) found.push('thin_html');
  if (result.internalFlags.includes('http_403')) found.push('http_403');
  if (result.internalFlags.includes('network_error')) found.push('network_error');
  return [...new Set(found)];
}

function buildSignalsMissing(signals: WebsiteSignals | null): string[] {
  const missing: string[] = [];
  if (!signals?.hasRestaurantSchema) missing.push('restaurant_schema');
  if (!signals?.navLinkTexts.some((text) => /menu|reservation|order|catering|private dining/i.test(text))) {
    missing.push('restaurant_nav');
  }
  if (!signals?.metaDescription) missing.push('meta_description');
  if (!signals?.ogTitle) missing.push('og_title');
  if (!signals?.socialLinks.length) missing.push('social_or_ordering_links');
  return missing;
}

function categorizeFailure(result: ValidationResult, signals: WebsiteSignals | null): string {
  if (result.websiteReachabilityStatus === 'blocked' || signals?.hasBotProtection) return 'cloudflare_blocked';
  if (result.httpStatus === 0 || result.websiteReachabilityStatus === 'inaccessible') return 'timeout';
  if (result.websiteReachabilityStatus === 'thin') return 'minimal_html';
  if (signals && signals.bodyText.length < 300 && signals.navLinkTexts.length === 0) return 'js_rendered';
  if (result.restaurantSignalScore < 60) return 'low_signal_score';
  return 'other';
}

function splitDomainWords(url: string): string[] {
  let hostname = url;
  try {
    hostname = new URL(url).hostname;
  } catch {
    hostname = url.replace(/^https?:\/\//i, '').split('/')[0] ?? url;
  }

  const root = hostname
    .replace(/^www\./, '')
    .replace(/\.(com|net|org|co|us|biz|info|restaurant)$/i, '');

  return root
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[^a-z0-9]+/gi, ' ')
    .toLowerCase()
    .split(/\s+/)
    .flatMap(splitCompactRestaurantWords)
    .filter((word, index, words) => word.length > 1 && words.indexOf(word) === index);
}

function splitCompactRestaurantWords(word: string): string[] {
  const terms = ['restaurant', 'grill', 'bistro', 'kitchen', 'cafe', 'eatery', 'diner', 'brasserie', 'trattoria', 'cantina', 'tavern', 'chophouse', 'smokehouse', 'gastropub', 'bodega', 'taqueria', 'bbq', 'bar'];
  const matches = terms.filter((term) => word.includes(term));
  return matches.length ? [...word.replace(new RegExp(matches.join('|'), 'g'), ' ').split(/\s+/), ...matches] : [word];
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
