// GHL CRM sync — always create a new contact, then apply tags via the tags endpoint.
// Source of truth: docs/ghl-email-handoff.md §GHL API Notes.
//
// Strategy: every submission creates a new GHL contact (no dedup search).
// If GHL blocks the create due to a duplicate (400 + meta.contactId), we skip
// updating fields on the existing contact and go straight to applying tags via
// POST /contacts/:id/tags. This guarantees the workflow trigger fires on every
// submission regardless of duplicate contacts.
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
    const nameParts = payload.fsiq_full_name.trim().split(/\s+/);
    const firstName = nameParts[0] ?? '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Step 1: always attempt to create a new contact.
    // Tags are NOT included here — they are applied via the tags endpoint
    // in step 2, which fires the GHL workflow trigger.
    const createRes = await fetch(`${apiBase}/contacts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        locationId,
        firstName,
        lastName,
        email: payload.fsiq_email,
        ...(payload.fsiq_phone ? { phone: payload.fsiq_phone } : {}),
        customFields: buildCustomFields(payload),
      }),
      signal: AbortSignal.timeout(10_000),
    });

    let contactId: string;
    let contactNote: string | null = null;

    if (createRes.ok) {
      const createData = await createRes.json() as { contact?: { id: string } };
      if (!createData.contact?.id) {
        throw new Error('GHL create returned no contact ID');
      }
      contactId = createData.contact.id;
    } else {
      const detail = await createRes.text().catch(() => '');

      // GHL returns meta.contactId when the location blocks duplicate contacts.
      // We do not try to update the existing contact's fields — we only apply
      // tags so the workflow trigger fires.
      let dedupId: string | null = null;
      try {
        const parsed = JSON.parse(detail) as { meta?: { contactId?: string } };
        dedupId = parsed?.meta?.contactId ?? null;
      } catch { /* not JSON */ }

      if (dedupId) {
        contactId = dedupId;
        contactNote = 'GHL duplicate contact — fields not updated, tags applied to existing contact';
      } else {
        throw new Error(`GHL create failed: ${createRes.status} ${createRes.statusText}${detail ? ` — ${detail.slice(0, 300)}` : ''}`);
      }
    }

    // Step 2: apply tags via the dedicated tags endpoint.
    // This fires the GHL workflow trigger regardless of whether the contact
    // was freshly created or already existed.
    const tagsRes = await fetch(`${apiBase}/contacts/${contactId}/tags`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ tags: payload.tags }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!tagsRes.ok) {
      const tagsDetail = await tagsRes.text().catch(() => '');
      throw new Error(`GHL tag apply failed: ${tagsRes.status} ${tagsRes.statusText}${tagsDetail ? ` — ${tagsDetail.slice(0, 300)}` : ''}`);
    }

    return {
      crmSyncStatus: 'synced',
      ghlContactId: contactId,
      crmSyncError: contactNote,
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

function buildCustomFields(payload: GhlHandoffPayload): Array<{ key: string; field_value: string }> {
  const fields: Array<{ key: string; field_value: string }> = [
    { key: 'fsiq_submission_id',          field_value: payload.fsiq_submission_id },
    { key: 'fsiq_restaurant_name',        field_value: payload.fsiq_restaurant_name },
    { key: 'fsiq_website',                field_value: payload.fsiq_website },
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
