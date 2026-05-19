#!/usr/bin/env npx tsx
// One-shot script: creates all 26 fsiq_* custom fields in GHL location.
// Field keys match exactly what src/lib/crm/ghl.ts sends via buildCustomFields().
// Run: npx tsx scripts/setup-ghl-fields.ts

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
  } catch { /* .env.local not found */ }
}

loadEnv();

const API_BASE = process.env.GHL_API_BASE_URL ?? 'https://services.leadconnectorhq.com';
const TOKEN = process.env.GHL_ACCESS_TOKEN ?? process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;

if (!TOKEN || !LOCATION_ID) {
  console.error('Missing GHL_ACCESS_TOKEN/GHL_API_KEY or GHL_LOCATION_ID in .env.local');
  process.exit(1);
}

// Field definitions matching src/lib/crm/ghl.ts buildCustomFields() and ghl-types.ts
// Keys are exactly what the app sends; names are human-readable for GHL UI.
const FIELDS: Array<{ key: string; name: string; dataType: string; placeholder?: string }> = [
  // Identity (submission tracking)
  { key: 'fsiq_submission_id',          name: 'FSIQ Submission ID',          dataType: 'TEXT',   placeholder: 'UUID' },

  // Restaurant profile (from form answers — used in email personalization)
  { key: 'fsiq_restaurant_name',        name: 'FSIQ Restaurant Name',        dataType: 'TEXT',   placeholder: 'Restaurant name' },
  { key: 'fsiq_website',                name: 'FSIQ Website',                dataType: 'TEXT',   placeholder: 'https://...' },
  { key: 'fsiq_state',                  name: 'FSIQ State',                  dataType: 'TEXT',   placeholder: 'TX' },
  { key: 'fsiq_concept_type',           name: 'FSIQ Concept Type',           dataType: 'TEXT',   placeholder: 'Fine dining, casual, etc.' },
  { key: 'fsiq_locations',              name: 'FSIQ Locations',              dataType: 'TEXT',   placeholder: '1, 2-5, etc.' },
  { key: 'fsiq_annual_food_spend',      name: 'FSIQ Annual Food Spend',      dataType: 'TEXT',   placeholder: '$1M–$3M' },
  { key: 'fsiq_distributor_type',       name: 'FSIQ Distributor Type',       dataType: 'TEXT',   placeholder: 'Broadline, specialty, etc.' },
  { key: 'fsiq_procurement_strategy',   name: 'FSIQ Procurement Strategy',   dataType: 'TEXT',   placeholder: 'Owner-managed, etc.' },
  { key: 'fsiq_top_skus',              name: 'FSIQ Top SKUs',               dataType: 'TEXT',   placeholder: 'Proteins, produce, etc.' },

  // Qualification and routing (set by app Phase 7 — drives GHL automation branching)
  { key: 'fsiq_lead_status',            name: 'FSIQ Lead Status',            dataType: 'TEXT',   placeholder: 'qualified_full_pdf_ready' },
  { key: 'fsiq_communication_route',    name: 'FSIQ Communication Route',    dataType: 'TEXT',   placeholder: 'send_full_report' },
  { key: 'fsiq_qualified',              name: 'FSIQ Qualified',              dataType: 'TEXT',   placeholder: 'true / false' },
  { key: 'fsiq_final_decision',         name: 'FSIQ Final Decision',         dataType: 'TEXT',   placeholder: 'verified_restaurant' },
  { key: 'fsiq_country_eligibility',    name: 'FSIQ Country Eligibility',    dataType: 'TEXT',   placeholder: 'us_verified' },
  { key: 'fsiq_dq_reason',              name: 'FSIQ DQ Reason',              dataType: 'TEXT',   placeholder: 'national_chain, below_threshold, etc.' },

  // Savings estimates (pre-formatted strings — ready for email templates)
  { key: 'fsiq_estimated_savings',      name: 'FSIQ Estimated Savings',      dataType: 'TEXT',   placeholder: '$147,000' },
  { key: 'fsiq_final_pct',              name: 'FSIQ Final Pct',              dataType: 'TEXT',   placeholder: '7.4%' },
  { key: 'fsiq_spend_bucket',           name: 'FSIQ Spend Bucket',           dataType: 'TEXT',   placeholder: '$1M–$3M' },

  // PDF (controls report email CTA)
  { key: 'fsiq_pdf_mode',               name: 'FSIQ PDF Mode',               dataType: 'TEXT',   placeholder: 'full / conservative' },
  { key: 'fsiq_pdf_status',             name: 'FSIQ PDF Status',             dataType: 'TEXT',   placeholder: 'complete / error / skipped / pending' },
  { key: 'fsiq_pdf_url',                name: 'FSIQ PDF URL',                dataType: 'TEXT',   placeholder: 'https://... download URL' },
  { key: 'fsiq_pdf_ready_at',           name: 'FSIQ PDF Ready At',           dataType: 'TEXT',   placeholder: 'ISO timestamp' },

  // Workflow state
  { key: 'fsiq_manual_review_required', name: 'FSIQ Manual Review Required', dataType: 'TEXT',   placeholder: 'true / false' },
  { key: 'fsiq_workflow_status',        name: 'FSIQ Workflow Status',        dataType: 'TEXT',   placeholder: 'complete / partial / failed' },
  { key: 'fsiq_workflow_stage',         name: 'FSIQ Workflow Stage',         dataType: 'TEXT',   placeholder: 'qualification_complete' },
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

async function getExistingFields(): Promise<Map<string, GhlCustomField>> {
  const res = await fetch(`${API_BASE}/locations/${LOCATION_ID}/customFields`, {
    headers,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Failed to list custom fields: ${res.status} ${detail.slice(0, 300)}`);
  }
  const data = (await res.json()) as { customFields?: GhlCustomField[] };
  const map = new Map<string, GhlCustomField>();
  for (const f of data.customFields ?? []) {
    map.set(f.fieldKey, f);
  }
  return map;
}

async function createField(field: typeof FIELDS[number]): Promise<'created' | 'exists'> {
  const res = await fetch(`${API_BASE}/locations/${LOCATION_ID}/customFields`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      name: field.name,
      dataType: field.dataType,
      fieldKey: field.key,
      placeholder: field.placeholder ?? '',
      model: 'contact',
    }),
  });
  if (res.ok) return 'created';
  const detail = await res.text().catch(() => '');
  if (detail.includes('already exist') || detail.includes('Duplicate')) return 'exists';
  throw new Error(`Failed to create field "${field.key}": ${res.status} ${detail.slice(0, 300)}`);
}

async function main() {
  console.log(`GHL Location: ${LOCATION_ID}`);
  console.log(`API Base:     ${API_BASE}\n`);

  const existing = await getExistingFields();
  const fsiqCount = [...existing.keys()].filter((k) => k.startsWith('fsiq_')).length;
  console.log(`Found ${existing.size} total custom field(s) in GHL (${fsiqCount} fsiq_* fields).\n`);
  console.log('─'.repeat(80));
  console.log(`Creating ${FIELDS.length} fields...\n`);

  let created = 0;
  let skipped = 0;

  for (const field of FIELDS) {
    const existingField = existing.get(field.key);
    if (existingField) {
      console.log(`  ✓  ${field.key} — already exists (id: ${existingField.id})`);
      skipped++;
    } else {
      const result = await createField(field);
      if (result === 'exists') {
        console.log(`  ✓  ${field.key} — already exists (confirmed by API)`);
        skipped++;
      } else {
        console.log(`  +  ${field.key} — created as "${field.name}"`);
        created++;
      }
    }
  }

  console.log('\n' + '─'.repeat(80));
  console.log(`\nDone. Created: ${created}, Skipped: ${skipped}, Total: ${FIELDS.length}`);

  if (created > 0) {
    console.log('\nRun the audit script to verify: npx tsx scripts/audit-ghl-fields.ts');
  }
}

main().catch((err) => {
  console.error('\nFatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
