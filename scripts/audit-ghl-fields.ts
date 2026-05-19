#!/usr/bin/env npx tsx
// Audit script: fetches all custom fields from GHL location and checks that every
// field the app sends exists with a matching key.
// Run: npx tsx scripts/audit-ghl-fields.ts
// Requires: GHL_ACCESS_TOKEN (or GHL_API_KEY) + GHL_LOCATION_ID in .env.local

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
  } catch { /* .env.local not found, rely on existing env */ }
}

loadEnv();

const API_BASE = process.env.GHL_API_BASE_URL ?? 'https://services.leadconnectorhq.com';
const TOKEN = process.env.GHL_ACCESS_TOKEN ?? process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;

if (!TOKEN || !LOCATION_ID) {
  console.error('Missing GHL_ACCESS_TOKEN/GHL_API_KEY or GHL_LOCATION_ID in .env');
  process.exit(1);
}

// Every field key the app sends via buildCustomFields in src/lib/crm/ghl.ts
const REQUIRED_FIELDS = [
  // Always sent
  'fsiq_submission_id',
  'fsiq_restaurant_name',
  'fsiq_website',
  'fsiq_state',
  'fsiq_concept_type',
  'fsiq_locations',
  'fsiq_annual_food_spend',
  'fsiq_distributor_type',
  'fsiq_procurement_strategy',
  'fsiq_top_skus',
  'fsiq_lead_status',
  'fsiq_communication_route',
  'fsiq_qualified',
  'fsiq_final_decision',
  'fsiq_country_eligibility',
  'fsiq_estimated_savings',
  'fsiq_final_pct',
  'fsiq_spend_bucket',
  'fsiq_pdf_status',
  'fsiq_manual_review_required',
  'fsiq_workflow_status',
  'fsiq_workflow_stage',
  // Conditionally sent (non-null only)
  'fsiq_dq_reason',
  'fsiq_pdf_mode',
  'fsiq_pdf_url',
  'fsiq_pdf_ready_at',
];

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
  Version: '2021-07-28',
};

interface GhlCustomField {
  id: string;
  name: string;
  fieldKey: string;
  dataType: string;
}

async function getCustomFields(): Promise<GhlCustomField[]> {
  const res = await fetch(`${API_BASE}/locations/${LOCATION_ID}/customFields`, { headers });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Failed to list custom fields: ${res.status} ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as { customFields?: GhlCustomField[] };
  return data.customFields ?? [];
}

async function main() {
  console.log(`GHL Location: ${LOCATION_ID}`);
  console.log(`API Base:     ${API_BASE}\n`);

  const ghlFields = await getCustomFields();
  const byKey = new Map(ghlFields.map((f) => [f.fieldKey, f]));

  console.log(`Found ${ghlFields.length} custom field(s) in GHL.\n`);
  console.log('─'.repeat(80));
  console.log('AUDIT: Checking all 26 required fsiq_* fields\n');

  let ok = 0;
  let missing = 0;

  for (const key of REQUIRED_FIELDS) {
    // GHL stores fieldKey as "contact.fsiq_*" but the app sends "fsiq_*"
    const field = byKey.get(key) ?? byKey.get(`contact.${key}`);
    if (field) {
      console.log(`  ✓  ${key}`);
      console.log(`     GHL key: "${field.fieldKey}"  |  type: ${field.dataType}  |  id: ${field.id}`);
      ok++;
    } else {
      console.log(`  ✗  ${key}  — MISSING in GHL`);
      missing++;
    }
  }

  console.log('\n' + '─'.repeat(80));

  // Check for extra fsiq_ fields in GHL not expected by the app
  const extra = ghlFields.filter((f) => {
    const normalizedKey = f.fieldKey.replace(/^contact\./, '');
    return normalizedKey.startsWith('fsiq_') && !REQUIRED_FIELDS.includes(normalizedKey);
  });
  if (extra.length > 0) {
    console.log(`\nExtra fsiq_* fields in GHL not sent by the app (may be stale):\n`);
    for (const f of extra) {
      console.log(`  ?  ${f.fieldKey}  ("${f.name}", ${f.dataType}, id: ${f.id})`);
    }
  }

  console.log(`\nResult: ${ok} found, ${missing} missing, ${extra.length} extra`);

  if (missing > 0) {
    console.log('\n⚠  Some fields are missing. The app will fail to write to these fields');
    console.log('   until they are created in GHL → Settings → Custom Fields → Contact.');
    process.exit(1);
  } else {
    console.log('\n✓  All fields present. GHL is ready for the app to sync.');
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
