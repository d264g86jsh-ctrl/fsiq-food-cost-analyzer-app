#!/usr/bin/env npx tsx
// ghl-create-attribution-fields.ts
//
// One-off script: creates (or verifies) the two GHL Contact custom fields
// needed for attribution: fsiq_lead_source and fsiq_utm_source.
//
// Usage:
//   npx tsx scripts/ghl-create-attribution-fields.ts
//
// Required env vars:
//   GHL_ACCESS_TOKEN (or GHL_API_KEY)
//   GHL_LOCATION_ID
//
// If either field already exists, it is NOT recreated — the script reports
// the existing field's assigned key (which GHL may have prefixed, e.g.
// "contact.fsiq_lead_source"). The sync in ghl.ts uses bare keys, so a
// prefix mismatch is flagged explicitly.

import path from 'node:path';
import fs from 'node:fs';

function loadEnv(p: string) {
  if (!fs.existsSync(p)) return;
  // Two-pass: collect all vars from file (last-write-wins for duplicate keys),
  // then apply only where process.env has no real value (shell vars still win).
  const fileVars: Record<string, string> = {};
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (k) fileVars[k] = v;
  }
  for (const [k, v] of Object.entries(fileVars)) {
    if (!process.env[k]) process.env[k] = v;
  }
}
loadEnv(path.join(process.cwd(), '.env.local'));
loadEnv(path.join(process.cwd(), '.env'));

const TOKEN       = process.env.GHL_ACCESS_TOKEN ?? process.env.GHL_API_KEY ?? '';
const LOCATION_ID = process.env.GHL_LOCATION_ID ?? '';
const API_BASE    = process.env.GHL_API_BASE_URL ?? 'https://services.leadconnectorhq.com';

const REQUIRED_FIELDS = [
  { name: 'fsiq_lead_source',      displayName: 'FSIQ Lead Source'      },
  { name: 'fsiq_utm_source',       displayName: 'FSIQ UTM Source'       },
  { name: 'fsiq_utm_medium',       displayName: 'FSIQ UTM Medium'       },
  { name: 'fsiq_utm_campaign',     displayName: 'FSIQ UTM Campaign'     },
  { name: 'fsiq_utm_content',      displayName: 'FSIQ UTM Content'      },
  { name: 'fsiq_utm_term',         displayName: 'FSIQ UTM Term'         },
  { name: 'fsiq_utm_id',           displayName: 'FSIQ UTM ID'           },
  { name: 'fsiq_fbadid',           displayName: 'FSIQ FB Ad ID'         },
  { name: 'fsiq_fbclid',           displayName: 'FSIQ FB Click ID'      },
  { name: 'fsiq_referrer',         displayName: 'FSIQ Referrer'         },
  { name: 'fsiq_landing_page_url', displayName: 'FSIQ Landing Page URL' },
] as const;

// Keys the sync layer uses — anything else is a mismatch that must be flagged
const EXPECTED_SYNC_KEYS: Set<string> = new Set(REQUIRED_FIELDS.map((f) => f.name));

if (!TOKEN || !LOCATION_ID) {
  console.error('❌ GHL credentials not found in environment.');
  console.error('   Set GHL_ACCESS_TOKEN and GHL_LOCATION_ID in .env.local');
  console.error(`   TOKEN present:       ${Boolean(TOKEN)}`);
  console.error(`   LOCATION_ID present: ${Boolean(LOCATION_ID)}`);
  process.exit(1);
}

const HEADERS = {
  Authorization:  `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
  Version:        '2021-07-28',
};

interface GhlField {
  id: string;
  name: string;
  fieldKey: string;
  dataType: string;
  model: string;
}

async function fetchExistingFields(): Promise<GhlField[]> {
  const url = `${API_BASE}/locations/${LOCATION_ID}/customFields`;
  console.log(`\nGET ${url}`);
  const res = await fetch(url, { headers: HEADERS });
  const body = await res.text();
  console.log(`  → ${res.status} ${res.statusText}`);

  if (!res.ok) {
    console.error('  Response body:', body.slice(0, 500));
    throw new Error(`Fetch custom fields failed: ${res.status}`);
  }

  const parsed = JSON.parse(body) as { customFields?: GhlField[] };
  return parsed.customFields ?? [];
}

async function createField(name: string, displayName: string): Promise<GhlField> {
  const url = `${API_BASE}/locations/${LOCATION_ID}/customFields`;
  const payload = { name: displayName, dataType: 'TEXT', model: 'contact' };

  console.log(`\nPOST ${url}`);
  console.log('  Body:', JSON.stringify(payload));

  const res = await fetch(url, {
    method:  'POST',
    headers: HEADERS,
    body:    JSON.stringify(payload),
  });
  const body = await res.text();
  console.log(`  → ${res.status} ${res.statusText}`);
  console.log('  Response body:', body.slice(0, 800));

  if (!res.ok) {
    throw new Error(`Create field '${name}' failed: ${res.status} — ${body.slice(0, 300)}`);
  }

  const parsed = JSON.parse(body) as { customField?: GhlField };
  if (!parsed.customField) throw new Error('GHL returned no customField in response');
  return parsed.customField;
}

async function main() {
  console.log('═'.repeat(60));
  console.log('GHL Attribution Fields Setup');
  console.log('═'.repeat(60));
  console.log(`Target: ${API_BASE}`);
  console.log(`Location: ${LOCATION_ID}\n`);

  // Step 1 — fetch existing fields
  let existing: GhlField[];
  try {
    existing = await fetchExistingFields();
  } catch (err) {
    console.error('\n❌ Could not fetch existing fields:', (err as Error).message);
    process.exit(1);
  }

  console.log(`\nFound ${existing.length} existing custom fields.`);

  const existingByName = new Map(existing.map((f) => [f.name.toLowerCase(), f]));
  const existingByKey  = new Map(existing.map((f) => [f.fieldKey?.toLowerCase(), f]));

  // Step 2 — for each required field: check, create, or flag mismatch
  const results: Array<{
    intended: string;
    status: 'already_exists' | 'created' | 'key_mismatch' | 'failed';
    assignedKey: string | null;
    id: string | null;
    mismatch: string | null;
  }> = [];

  for (const { name, displayName } of REQUIRED_FIELDS) {
    // Check by display name or field key (GHL may or may not prefix with 'contact.')
    const bare        = name.toLowerCase();
    const prefixed    = `contact.${bare}`;
    const byName      = existingByName.get(displayName.toLowerCase());
    const byBareKey   = existingByKey.get(bare);
    const byPrefixKey = existingByKey.get(prefixed);
    const found       = byName ?? byBareKey ?? byPrefixKey ?? null;

    if (found) {
      const assignedKey = found.fieldKey ?? '';
      const mismatch    = !EXPECTED_SYNC_KEYS.has(assignedKey)
        ? `⚠️  sync uses key '${name}' but GHL assigned '${assignedKey}' — buildCustomFields must be updated`
        : null;

      results.push({ intended: name, status: 'already_exists', assignedKey, id: found.id, mismatch });
      console.log(`\n✅ ${displayName} already exists`);
      console.log(`   id: ${found.id}  fieldKey: ${assignedKey}  dataType: ${found.dataType}`);
      if (mismatch) console.warn(`   ${mismatch}`);
    } else {
      // Not found — create it
      try {
        const created = await createField(name, displayName);
        const assignedKey = created.fieldKey ?? '';
        const mismatch    = !EXPECTED_SYNC_KEYS.has(assignedKey)
          ? `⚠️  sync uses key '${name}' but GHL assigned '${assignedKey}' — buildCustomFields must be updated`
          : null;

        results.push({ intended: name, status: 'created', assignedKey, id: created.id, mismatch });
        console.log(`\n✅ Created: ${displayName}`);
        console.log(`   id: ${created.id}  fieldKey: ${assignedKey}  dataType: ${created.dataType}`);
        if (mismatch) console.warn(`   ${mismatch}`);
      } catch (err) {
        results.push({ intended: name, status: 'failed', assignedKey: null, id: null, mismatch: (err as Error).message });
        console.error(`\n❌ Failed to create ${displayName}:`, (err as Error).message);
      }
    }
  }

  // Summary
  console.log('\n' + '═'.repeat(60));
  console.log('SUMMARY');
  console.log('═'.repeat(60));
  for (const r of results) {
    const icon = r.status === 'failed' ? '❌' : r.mismatch ? '⚠️ ' : '✅';
    console.log(`${icon} ${r.intended}`);
    console.log(`   status:      ${r.status}`);
    console.log(`   assignedKey: ${r.assignedKey ?? 'N/A'}`);
    console.log(`   id:          ${r.id ?? 'N/A'}`);
    if (r.mismatch) console.log(`   MISMATCH:    ${r.mismatch}`);
  }

  const hasFailures  = results.some((r) => r.status === 'failed');
  const hasMismatches = results.some((r) => r.mismatch);

  if (hasFailures) {
    console.log('\n❌ One or more fields could not be created. Create them manually in GHL.');
    process.exit(1);
  } else if (hasMismatches) {
    console.log('\n⚠️  Key mismatches detected — update buildCustomFields in src/lib/crm/ghl.ts before deploying.');
    process.exit(2);
  } else {
    console.log('\n✅ All attribution custom fields confirmed. Sync will work correctly.');
  }
}

main().catch((err) => { console.error('Fatal:', (err as Error).message); process.exit(1); });
