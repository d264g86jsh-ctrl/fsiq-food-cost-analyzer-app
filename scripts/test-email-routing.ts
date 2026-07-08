#!/usr/bin/env npx tsx
// scripts/test-email-routing.ts
//
// Live email-routing test. Creates ONE GHL contact per routing outcome and applies the
// EXACT tag set the app emits (derived verbatim from src/lib/crm/assign-lead-status.ts +
// src/lib/crm/ghl-tags.ts), replicating syncToGhl()'s two API calls (src/lib/crm/ghl.ts):
//   1) POST /contacts  (create contact + custom fields)
//   2) POST /contacts/:id/tags  (apply tags — THIS fires the "Webhook (Analyzer) V3" branch
//      and the migrated Zapier webhook -> Microsoft Outlook send)
//
// Why not call submitAnalysis()? It is a Next.js 'use server' action (uses next/headers +
// waitUntil) and cannot run headless. This script reproduces only its GHL-sync step. It does
// NOT run website validation / AI / PDF generation; tag sets are forced to the exact strings
// each outcome produces. For qualified cases, fsiq_pdf_url is SYNTHETIC (no DB-backed
// /report/{id} render) — this test targets the routing chain, not PDF rendering.
//
// Recipient: all cases deliver to rodrigo@foodserviceiq.com via plus-addressing
// (rodrigo+<case>@foodserviceiq.com) so each is a DISTINCT GHL contact (GHL dedupes by email;
// a shared address would collapse all 9 onto one contact) and the existing rodrigo@ contact is
// untouched. Inbox delivery depends on Microsoft 365 plus-addressing (subaddressing) being on.

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
const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.foodserviceiq.com';

const headers = {
  Authorization: `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
  Version: '2021-07-28',
};

// Verbatim from src/lib/crm/ghl-tags.ts
const TAG = {
  ANALYZER: 'FSIQ Analyzer Submitted',
  QUALIFIED: 'FSIQ Qualified',
  FULL: 'FSIQ Full PDF Ready',
  CONSERVATIVE: 'FSIQ Conservative PDF Ready',
  DQ_INVALID: 'FSIQ DQ Invalid Website',
  DQ_BELOW: 'FSIQ DQ Below Threshold',
  DQ_CHAIN: 'FSIQ DQ National Chain',
  DQ_CLEAR: 'FSIQ DQ Clear Non Fit',
  NON_US: 'FSIQ Non US',
  MANUAL_REVIEW: 'FSIQ Manual Review',
  WORKFLOW_FAILED: 'FSIQ Workflow Failed',
} as const;

interface RoutingCase {
  webhookTag: string;       // the value our webhook sends / branch name
  slug: string;             // plus-address + identifier
  restaurantName: string;
  tags: string[];           // exact app-emitted tag set (assign-lead-status.ts)
  qualified: boolean;
  finalPct?: string;
  savings?: string;
  note?: string;
}

const CASES: RoutingCase[] = [
  { webhookTag: 'fsiq_full_pdf_ready', slug: 'full_pdf_ready', restaurantName: 'TEST full_pdf_ready',
    tags: [TAG.ANALYZER, TAG.QUALIFIED, TAG.FULL], qualified: true, finalPct: '5.8%', savings: '$147,000' },
  { webhookTag: 'fsiq_conservative_pdf', slug: 'conservative_pdf', restaurantName: 'TEST conservative_pdf',
    tags: [TAG.ANALYZER, TAG.QUALIFIED, TAG.CONSERVATIVE], qualified: true, finalPct: '4.5%', savings: '$88,000' },
  { webhookTag: 'fsiq_dq_below_threshold', slug: 'below_threshold', restaurantName: 'TEST below_threshold',
    tags: [TAG.ANALYZER, TAG.DQ_BELOW], qualified: false },
  { webhookTag: 'fsiq_clear_non_fit', slug: 'clear_non_fit', restaurantName: 'TEST clear_non_fit',
    tags: [TAG.ANALYZER, TAG.DQ_CLEAR], qualified: false },
  { webhookTag: 'fsiq_non_us', slug: 'non_us', restaurantName: 'TEST non_us',
    tags: [TAG.ANALYZER, TAG.NON_US], qualified: false },
  { webhookTag: 'fsiq_dq_national_chain', slug: 'national_chain', restaurantName: 'TEST national_chain',
    tags: [TAG.ANALYZER, TAG.DQ_CHAIN], qualified: false },
  { webhookTag: 'fsiq_dq_invalid_website', slug: 'invalid_website', restaurantName: 'TEST invalid_website',
    tags: [TAG.ANALYZER, TAG.DQ_INVALID], qualified: false },
  { webhookTag: 'fsiq_workflow_failed', slug: 'workflow_failed', restaurantName: 'TEST workflow_failed',
    tags: [TAG.ANALYZER, TAG.WORKFLOW_FAILED], qualified: false,
    note: 'assign-lead-status emits [FSIQ Workflow Failed] WITHOUT FSIQ Analyzer Submitted; the enrollment tag is added here so the contact enrolls and reaches branch 8. The real app never emits this combo (and a failed pipeline never syncs to GHL), so branch 8 is effectively unreachable in production.' },
  { webhookTag: 'none', slug: 'none', restaurantName: 'TEST none',
    tags: [TAG.ANALYZER, TAG.MANUAL_REVIEW], qualified: false,
    note: 'No routing tag present -> GHL else/None branch. Mirrors a real manual-review lead ([FSIQ Analyzer Submitted, FSIQ Manual Review]).' },
];

const RECIPIENT = (slug: string) => `rodrigo+${slug}@foodserviceiq.com`;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Result {
  webhookTag: string;
  restaurantName: string;
  email: string;
  tags: string[];
  contactId: string | null;
  created: boolean;        // true = newly created, false = duplicate reused
  tagsApplied: boolean;
  pdfUrl: string | null;
  error: string | null;
  note?: string;
}

function customFields(c: RoutingCase, pdfUrl: string | null) {
  const fields: Array<{ key: string; field_value: string }> = [
    { key: 'fsiq_restaurant_name', field_value: c.restaurantName },
    { key: 'fsiq_email', field_value: RECIPIENT(c.slug) },
    { key: 'fsiq_full_name', field_value: `Rodrigo ${c.slug}` },
    { key: 'fsiq_qualified', field_value: String(c.qualified) },
  ];
  if (c.qualified) {
    if (c.savings) fields.push({ key: 'fsiq_estimated_savings', field_value: c.savings });
    if (c.finalPct) fields.push({ key: 'fsiq_final_pct', field_value: c.finalPct });
    if (pdfUrl) fields.push({ key: 'fsiq_pdf_url', field_value: pdfUrl });
  }
  return fields;
}

async function runCase(c: RoutingCase, ts: number): Promise<Result> {
  const email = RECIPIENT(c.slug);
  const pdfUrl = c.qualified ? `${APP_URL}/report/test-${c.slug}-${ts}` : null;
  const res: Result = {
    webhookTag: c.webhookTag, restaurantName: c.restaurantName, email,
    tags: c.tags, contactId: null, created: false, tagsApplied: false,
    pdfUrl, error: null, note: c.note,
  };

  try {
    // Step 1: create contact + custom fields (mirrors ghl.ts syncToGhl step 1)
    const createRes = await fetch(`${API_BASE}/contacts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        locationId: LOCATION_ID,
        firstName: 'Rodrigo',
        lastName: c.slug,
        email,
        customFields: customFields(c, pdfUrl),
      }),
    });

    if (createRes.ok) {
      const data = (await createRes.json()) as { contact?: { id: string } };
      if (!data.contact?.id) throw new Error('create returned no contact id');
      res.contactId = data.contact.id;
      res.created = true;
    } else {
      const detail = await createRes.text().catch(() => '');
      let dedupId: string | null = null;
      try { dedupId = (JSON.parse(detail) as { meta?: { contactId?: string } })?.meta?.contactId ?? null; } catch {}
      if (dedupId) {
        res.contactId = dedupId;
        res.created = false;
      } else {
        throw new Error(`create failed: ${createRes.status} ${createRes.statusText} ${detail.slice(0, 200)}`);
      }
    }

    // Step 2: apply tags (mirrors ghl.ts syncToGhl step 2 — fires the GHL branch + webhook)
    const tagsRes = await fetch(`${API_BASE}/contacts/${res.contactId}/tags`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tags: c.tags }),
    });
    if (!tagsRes.ok) {
      const td = await tagsRes.text().catch(() => '');
      throw new Error(`tag apply failed: ${tagsRes.status} ${tagsRes.statusText} ${td.slice(0, 200)}`);
    }
    res.tagsApplied = true;
  } catch (err) {
    res.error = err instanceof Error ? err.message : String(err);
  }
  return res;
}

async function main() {
  if (!TOKEN || !LOCATION_ID) {
    console.error('Missing GHL_ACCESS_TOKEN/GHL_API_KEY or GHL_LOCATION_ID in .env.local');
    process.exit(1);
  }
  console.log(`GHL location: ${LOCATION_ID}  |  base: ${API_BASE}`);
  console.log(`Recipient (plus-addressed): rodrigo+<case>@foodserviceiq.com\n`);

  const ts = Date.now();
  const results: Result[] = [];
  for (const c of CASES) {
    process.stdout.write(`-> ${c.webhookTag.padEnd(24)} `);
    const r = await runCase(c, ts);
    results.push(r);
    console.log(JSON.stringify({
      contactId: r.contactId, created: r.created, tagsApplied: r.tagsApplied,
      tags: r.tags, pdfUrl: r.pdfUrl, error: r.error,
    }));
    await sleep(3000); // let GHL/webhook/Zapier process each
  }

  console.log('\n==== SUMMARY ====');
  for (const r of results) {
    const ok = r.contactId && r.tagsApplied && !r.error;
    console.log(`${ok ? 'OK ' : 'ERR'} | ${r.webhookTag.padEnd(24)} | contact=${r.contactId ?? '-'} | tags=[${r.tags.join(', ')}]${r.error ? ` | ERROR: ${r.error}` : ''}`);
  }
  // machine-readable for the results doc
  console.log('\n==== JSON ====');
  console.log(JSON.stringify(results, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
