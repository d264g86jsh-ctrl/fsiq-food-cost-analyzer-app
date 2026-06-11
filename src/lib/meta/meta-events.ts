// Server-only — assembles CAPI event objects from DB submission + tracking context.
// Never include top_skus or pdfDownloadUrl in CAPI payloads.

import type { Submission } from '@prisma/client';
import { buildUserData } from './meta-user-data';
import { generateEventId } from './event-id';
import type { MetaCapiEvent, TrackingContext } from './meta-types';

// Canonical site origin for event_source_url — same env var as buildReportUrl().
// Never omit event_source_url: Meta marks events without it as "lower quality"
// and may exclude them from attribution / delivery optimisation.
const APP_ORIGIN = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.foodserviceiq.com').replace(/\/+$/, '');

// Builds the 'Lead' CAPI event.
// Fires for all final routes (qualified and DQ) when shouldSyncGhl is true.
// The event_id should match the browser Lead event for Meta deduplication.
export function buildLeadEvent(
  submission: Pick<Submission, 'email' | 'phone' | 'qualified'> & { dqReason: string | null },
  tracking: TrackingContext,
): MetaCapiEvent {
  const userData = buildUserData({
    email:           submission.email,
    phone:           submission.phone,
    fbp:             tracking.fbp,
    fbc:             tracking.fbc,
    clientIpAddress: tracking.clientIpAddress,
    clientUserAgent: tracking.clientUserAgent,
  });

  // event_source_url: use the actual landing URL when available (carries UTM/fbclid
  // context); fall back to the form root when there was no tracked landing URL.
  const leadSourceUrl = tracking.landingPageUrl ?? `${APP_ORIGIN}/`;

  return {
    event_name:       'Lead',
    event_time:       Math.floor(Date.now() / 1000),
    event_id:         tracking.eventId ?? generateEventId(),
    action_source:    'website',
    event_source_url: leadSourceUrl,
    user_data:        userData,
    custom_data: {
      content_name: 'food_cost_analyzer',
      lead_type:    submission.qualified
        ? 'qualified'
        : (submission.dqReason ?? 'disqualified'),
    },
  };
}

// Builds the 'QualifiedLead' CAPI event.
// Server-only, fires only for qualified_full_pdf_ready and qualified_conservative_pdf_ready.
// Uses a prefixed event_id so it never accidentally deduplicates against the Lead event.
export function buildQualifiedLeadEvent(
  submission: Pick<Submission, 'id' | 'email' | 'phone' | 'dollarEstimate'>,
  tracking: TrackingContext,
): MetaCapiEvent {
  const userData = buildUserData({
    email:           submission.email,
    phone:           submission.phone,
    fbp:             tracking.fbp,
    fbc:             tracking.fbc,
    clientIpAddress: tracking.clientIpAddress,
    clientUserAgent: tracking.clientUserAgent,
  });

  // event_source_url: point to the report page the lead will receive.
  // Falls back to site root if the submission id is somehow absent.
  const qualifiedSourceUrl = submission.id
    ? `${APP_ORIGIN}/report/${submission.id}`
    : `${APP_ORIGIN}/`;

  return {
    event_name:       'QualifiedLead',
    event_time:       Math.floor(Date.now() / 1000),
    event_id:         `ql-${tracking.eventId ?? generateEventId()}`,
    action_source:    'website',
    event_source_url: qualifiedSourceUrl,
    user_data:        userData,
    custom_data: {
      content_name: 'food_cost_analyzer',
      currency:     'USD',
      ...(submission.dollarEstimate !== null && submission.dollarEstimate !== undefined
        ? { value: submission.dollarEstimate }
        : {}),
    },
  };
}
