#!/usr/bin/env npx tsx
// One-shot script: creates all FSIQ tags in GHL location.
// Run: npx tsx scripts/setup-ghl-tags.ts
// Requires: GHL_ACCESS_TOKEN (or GHL_API_KEY) + GHL_LOCATION_ID in .env

import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env.local');
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch { /* .env not found, rely on existing env */ }
}

loadEnv();

const API_BASE = process.env.GHL_API_BASE_URL ?? 'https://services.leadconnectorhq.com';
const TOKEN = process.env.GHL_ACCESS_TOKEN ?? process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;

if (!TOKEN || !LOCATION_ID) {
  console.error('Missing GHL_ACCESS_TOKEN/GHL_API_KEY or GHL_LOCATION_ID in .env');
  process.exit(1);
}

const TAGS = [
  'FSIQ Analyzer Submitted',
  'FSIQ Full PDF Ready',
  'FSIQ Conservative PDF Ready',
  'FSIQ Qualified',
  'FSIQ DQ Invalid Website',
  'FSIQ DQ Below Threshold',
  'FSIQ DQ National Chain',
  'FSIQ DQ Clear Non Fit',
  'FSIQ Non US',
  'FSIQ Manual Review',
  'FSIQ PDF Failed',
  'FSIQ Workflow Failed',
  'FSIQ Possible Test Submission',
  'FSIQ Possible Spam Submission',
];

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
  Version: '2021-07-28',
};

async function getExistingTags(): Promise<Set<string>> {
  const res = await fetch(`${API_BASE}/locations/${LOCATION_ID}/tags`, { headers });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Failed to list tags: ${res.status} ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as { tags?: Array<{ name: string }> };
  return new Set((data.tags ?? []).map((t) => t.name));
}

async function createTag(name: string): Promise<'created' | 'exists'> {
  const res = await fetch(`${API_BASE}/locations/${LOCATION_ID}/tags`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ name }),
  });
  if (res.ok) return 'created';
  const detail = await res.text().catch(() => '');
  if (detail.includes('already exist')) return 'exists';
  throw new Error(`Failed to create tag "${name}": ${res.status} ${detail.slice(0, 300)}`);
}

async function main() {
  console.log(`GHL Location: ${LOCATION_ID}`);
  console.log(`API Base:     ${API_BASE}\n`);

  const existing = await getExistingTags();
  console.log(`Found ${existing.size} existing tag(s) in GHL.\n`);

  let created = 0;
  let skipped = 0;

  for (const tag of TAGS) {
    if (existing.has(tag)) {
      console.log(`  ✓ "${tag}" — already exists (from list)`);
      skipped++;
    } else {
      const result = await createTag(tag);
      if (result === 'exists') {
        console.log(`  ✓ "${tag}" — already exists (confirmed by API)`);
        skipped++;
      } else {
        console.log(`  + "${tag}" — created`);
        created++;
      }
    }
  }

  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}, Total: ${TAGS.length}`);
}

main().catch((err) => {
  console.error('\nFatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
