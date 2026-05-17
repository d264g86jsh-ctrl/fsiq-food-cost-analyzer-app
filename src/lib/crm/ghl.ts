// GHL CRM sync — upsert contact by email, apply custom fields and tags.
// Source of truth: docs/ghl-email-handoff.md §GHL API Notes.
//
// Auth: GHL_ACCESS_TOKEN preferred; falls back to GHL_API_KEY.
// Base URL: GHL_API_BASE_URL (default: https://services.leadconnectorhq.com).
// Missing credentials → error result, no throw.

import type { GhlHandoffPayload } from './ghl-types';

export interface GhlSyncResult {
  crmSyncStatus: 'synced' | 'error';
  ghlContactId: string | null;
  crmSyncError: string | null;
  crmTags: string[];
}

const DEFAULT_API_BASE = 'https://services.leadconnectorhq.com';

function getConfig() {
  const token = process.env.GHL_ACCESS_TOKEN ?? process.env.GHL_API_KEY ?? null;
  const locationId = process.env.GHL_LOCATION_ID ?? null;
  const apiBase = process.env.GHL_API_BASE_URL ?? DEFAULT_API_BASE;
  return { token, locationId, apiBase };
}

// Shared contact body — no locationId (PUT only).
type ContactBody = {
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  tags: string[];
  customFields: Array<{ key: string; field_value: string }>;
};

// Parse the matchingField from a GHL 400 duplicate response body.
function parseDuplicateResponse(detail: string): { dedupId: string | null; matchingField: string | null } {
  try {
    const parsed = JSON.parse(detail) as { meta?: { contactId?: string; matchingField?: string } };
    return {
      dedupId:       parsed?.meta?.contactId   ?? null,
      matchingField: parsed?.meta?.matchingField ?? null,
    };
  } catch {
    return { dedupId: null, matchingField: null };
  }
}

// Strip a conflicting field from a contact body so a blocked PUT can be retried.
// GHL deduplicates on: email, phone (and potentially firstName+lastName combos).
// Stripping the conflicting field lets the PUT proceed without violating the constraint.
function stripField(body: ContactBody, field: string | null): ContactBody {
  if (!field) return body;
  const stripped = { ...body };
  if (field === 'email')  delete stripped.email;
  if (field === 'phone')  delete stripped.phone;
  return stripped;
}

export async function syncToGhl(payload: GhlHandoffPayload): Promise<GhlSyncResult> {
  const { token, locationId, apiBase } = getConfig();

  if (!token || !locationId) {
    return {
      crmSyncStatus: 'error',
      ghlContactId: null,
      crmSyncError: 'GHL credentials not configured (GHL_ACCESS_TOKEN/GHL_API_KEY and GHL_LOCATION_ID required)',
      crmTags: [],
    };
  }

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Version': '2021-07-28',
  };

  try {
    // Step 1: search for existing contact by email
    const searchUrl = `${apiBase}/contacts/search/duplicate?${new URLSearchParams({
      email: payload.fsiq_email,
      locationId,
    }).toString()}`;

    const searchRes = await fetch(searchUrl, { method: 'GET', headers, signal: AbortSignal.timeout(10_000) });
    if (!searchRes.ok) {
      const detail = await searchRes.text().catch(() => '');
      throw new Error(`GHL search failed: ${searchRes.status} ${searchRes.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ''}`);
    }
    const searchData = await searchRes.json() as { contact?: { id: string } | null };
    const existingId = searchData.contact?.id ?? null;

    // Step 2: assemble contact fields
    const nameParts = payload.fsiq_full_name.trim().split(/\s+/);
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.slice(1).join(' ') || '';

    const customFields = buildCustomFields(payload);

    // locationId is required for POST (create) but not accepted on PUT (update).
    const sharedFields: ContactBody = {
      firstName,
      lastName,
      email: payload.fsiq_email,
      ...(payload.fsiq_phone ? { phone: payload.fsiq_phone } : {}),
      tags: payload.tags as string[],
      customFields,
    };

    // Step 3: create or update
    let contactId: string;
    if (existingId) {
      const result = await upsertContact(apiBase, existingId, sharedFields, headers);
      contactId = result.contactId;
      if (result.warning) {
        return {
          crmSyncStatus: 'synced',
          ghlContactId: contactId,
          crmSyncError: result.warning,
          crmTags: payload.tags as string[],
        };
      }
    } else {
      const createRes = await fetch(`${apiBase}/contacts`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ locationId, ...sharedFields }),
        signal: AbortSignal.timeout(10_000),
      });

      if (!createRes.ok) {
        const detail = await createRes.text().catch(() => '');
        const { dedupId, matchingField } = parseDuplicateResponse(detail);

        if (dedupId) {
          // GHL blocked create due to duplicate — update the canonical contact instead.
          const result = await upsertContact(apiBase, dedupId, sharedFields, headers, matchingField);
          contactId = result.contactId;
          if (result.warning) {
            return {
              crmSyncStatus: 'synced',
              ghlContactId: contactId,
              crmSyncError: result.warning,
              crmTags: payload.tags as string[],
            };
          }
        } else {
          throw new Error(`GHL create failed: ${createRes.status} ${createRes.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ''}`);
        }
      } else {
        const createData = await createRes.json() as { contact?: { id: string } };
        if (!createData.contact?.id) {
          throw new Error('GHL create returned no contact ID');
        }
        contactId = createData.contact.id;
      }
    }

    return {
      crmSyncStatus: 'synced',
      ghlContactId: contactId,
      crmSyncError: null,
      crmTags: payload.tags as string[],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      crmSyncStatus: 'error',
      ghlContactId: null,
      crmSyncError: message,
      crmTags: [],
    };
  }
}

// ── upsertContact ─────────────────────────────────────────────────────────────
// PUT a contact. On 400 duplicate:
//   1. Try updating the conflicting contact (dedupId from meta).
//   2. If that also 400s (circular conflict), strip the conflicting field and
//      retry the original contact once more.
//   3. If the stripped retry still fails, accept it as a partial sync — the
//      contact exists in GHL, tags are applied, workflow fires.
// Returns contactId and an optional warning string (never throws for duplicates).

async function upsertContact(
  apiBase: string,
  contactId: string,
  body: ContactBody,
  headers: Record<string, string>,
  // When called from the create dedup path, we already know one conflicting field.
  knownConflictField: string | null = null,
): Promise<{ contactId: string; warning: string | null }> {
  const res = await fetch(`${apiBase}/contacts/${contactId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (res.ok) {
    const data = await res.json() as { contact?: { id: string } };
    return { contactId: data.contact?.id ?? contactId, warning: null };
  }

  const detail = await res.text().catch(() => '');
  const { dedupId, matchingField } = parseDuplicateResponse(detail);

  if (!dedupId) {
    // Non-duplicate 400 — throw so the outer catch records it as a real error.
    throw new Error(`GHL update failed: ${res.status} ${res.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ''}`);
  }

  // First dedup: try updating the conflicting contact (dedupId).
  // Pass the conflicting field so we know what to strip if this also fails.
  const conflictField = matchingField ?? knownConflictField;

  const dedupRes = await fetch(`${apiBase}/contacts/${dedupId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });

  if (dedupRes.ok) {
    const dedupData = await dedupRes.json() as { contact?: { id: string } };
    return { contactId: dedupData.contact?.id ?? dedupId, warning: null };
  }

  // Second dedup 400: circular conflict — Contact A↔B both block each other.
  // Strip the conflicting field and retry the original contact once more.
  const strippedBody = stripField(body, conflictField);
  const retryRes = await fetch(`${apiBase}/contacts/${contactId}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(strippedBody),
    signal: AbortSignal.timeout(10_000),
  });

  if (retryRes.ok) {
    const retryData = await retryRes.json() as { contact?: { id: string } };
    const resolvedId = retryData.contact?.id ?? contactId;
    return {
      contactId: resolvedId,
      warning: `GHL circular dedup: ${conflictField ?? 'unknown field'} stripped from update — contact synced without that field`,
    };
  }

  // Stripped retry also failed — accept partial sync. Contact is in GHL,
  // tags are applied (included in body), workflow will fire.
  const retryDetail = await retryRes.text().catch(() => '');
  return {
    contactId,
    warning: `GHL dedup conflict unresolved after stripping ${conflictField ?? 'unknown field'} — partial sync (tags applied): ${retryDetail.slice(0, 200)}`,
  };
}

function buildCustomFields(payload: GhlHandoffPayload): Array<{ key: string; field_value: string }> {
  const fields: Array<{ key: string; field_value: string }> = [
    { key: 'fsiq_submission_id',          field_value: payload.fsiq_submission_id },
    { key: 'fsiq_restaurant_name',        field_value: payload.fsiq_restaurant_name },
    { key: 'fsiq_website',                field_value: payload.fsiq_website },
    { key: 'fsiq_state',                 field_value: payload.fsiq_state },
    { key: 'fsiq_concept_type',           field_value: payload.fsiq_concept_type },
    { key: 'fsiq_locations',              field_value: payload.fsiq_locations },
    { key: 'fsiq_annual_food_spend',      field_value: payload.fsiq_annual_food_spend },
    { key: 'fsiq_distributor_type',       field_value: payload.fsiq_distributor_type },
    { key: 'fsiq_procurement_strategy',   field_value: payload.fsiq_procurement_strategy },
    { key: 'fsiq_top_skus',               field_value: payload.fsiq_top_skus },
    { key: 'fsiq_lead_status',            field_value: payload.fsiq_lead_status },
    { key: 'fsiq_communication_route',    field_value: payload.fsiq_communication_route },
    { key: 'fsiq_qualified',              field_value: String(payload.fsiq_qualified) },
    { key: 'fsiq_final_decision',         field_value: payload.fsiq_final_decision },
    { key: 'fsiq_country_eligibility',    field_value: payload.fsiq_country_eligibility },
    { key: 'fsiq_estimated_savings',      field_value: payload.fsiq_estimated_savings },
    { key: 'fsiq_final_pct',              field_value: payload.fsiq_final_pct },
    { key: 'fsiq_spend_bucket',           field_value: payload.fsiq_spend_bucket },
    { key: 'fsiq_pdf_status',             field_value: payload.fsiq_pdf_status },
    { key: 'fsiq_manual_review_required', field_value: String(payload.fsiq_manual_review_required) },
    { key: 'fsiq_workflow_status',        field_value: payload.fsiq_workflow_status },
    { key: 'fsiq_workflow_stage',         field_value: payload.fsiq_workflow_stage },
  ];

  if (payload.fsiq_dq_reason) {
    fields.push({ key: 'fsiq_dq_reason', field_value: payload.fsiq_dq_reason });
  }
  if (payload.fsiq_pdf_mode) {
    fields.push({ key: 'fsiq_pdf_mode', field_value: payload.fsiq_pdf_mode });
  }
  if (payload.fsiq_pdf_url) {
    fields.push({ key: 'fsiq_pdf_url', field_value: payload.fsiq_pdf_url });
  }
  if (payload.fsiq_pdf_ready_at) {
    fields.push({ key: 'fsiq_pdf_ready_at', field_value: payload.fsiq_pdf_ready_at });
  }

  return fields;
}
