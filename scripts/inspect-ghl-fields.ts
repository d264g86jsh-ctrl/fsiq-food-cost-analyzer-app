#!/usr/bin/env npx tsx
import { readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  try {
    const content = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8');
    for (const line of content.split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq === -1) continue;
      const k = t.slice(0, eq).trim();
      let v = t.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}
loadEnv();

const TOKEN = process.env.GHL_ACCESS_TOKEN ?? process.env.GHL_API_KEY;
const LOCATION_ID = process.env.GHL_LOCATION_ID;
const API_BASE = process.env.GHL_API_BASE_URL ?? 'https://services.leadconnectorhq.com';

async function main() {
  const res = await fetch(`${API_BASE}/locations/${LOCATION_ID}/customFields`, {
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json', Version: '2021-07-28' },
  });
  const data = (await res.json()) as { customFields?: Array<{ id: string; name: string; fieldKey: string; dataType: string }> };
  const fields = data.customFields ?? [];

  const fsiq = fields.filter((f) => f.name.toLowerCase().includes('fsiq'));
  console.log(`Total fields: ${fields.length}`);
  console.log(`FSIQ fields (by name match): ${fsiq.length}\n`);

  if (fsiq.length > 0) {
    console.log('FSIQ fields:');
    for (const f of fsiq) {
      console.log(`  name: "${f.name}"  |  fieldKey: "${f.fieldKey}"  |  type: ${f.dataType}  |  id: ${f.id}`);
    }

    // Check for duplicates by name
    const nameCounts = new Map<string, number>();
    for (const f of fsiq) {
      nameCounts.set(f.name, (nameCounts.get(f.name) ?? 0) + 1);
    }
    const dupes = [...nameCounts.entries()].filter(([, count]) => count > 1);
    if (dupes.length > 0) {
      console.log('\n⚠ DUPLICATE field names found:');
      for (const [name, count] of dupes) {
        console.log(`  "${name}" appears ${count} times`);
      }
    }
  } else {
    console.log('No FSIQ fields found. Showing all field keys:');
    for (const f of fields) {
      console.log(`  name: "${f.name}"  |  fieldKey: "${f.fieldKey}"`);
    }
  }
}

main().catch((err) => {
  console.error('Error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
