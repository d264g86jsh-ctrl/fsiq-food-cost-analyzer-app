// Server-only — assembles CAPI event objects from DB submission + tracking context.
// Never include top_skus or pdfDownloadUrl in CAPI payloads.

import type { Submission } from '@prisma/client';
import { buildUserData } from './meta-user-data';
import { generateEventId } from './event-id';
import type { MetaCapiEvent, TrackingContext } from './meta-types';

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

  return {
    event_name:    'Lead',
    event_time:    Math.floor(Date.now() / 1000),
    event_id:      tracking.eventId ?? generateEventId(),
    action_source: 'website',
    user_data:     userData,
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
  submission: Pick<Submission, 'email' | 'phone' | 'dollarEstimate'>,
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

  return {
    event_name:    'QualifiedLead',
    event_time:    Math.floor(Date.now() / 1000),
    event_id:      `ql-${tracking.eventId ?? generateEventId()}`,
    action_source: 'website',
    user_data:     userData,
    custom_data: {
      content_name: 'food_cost_analyzer',
      currency:     'USD',
      ...(submission.dollarEstimate !== null && submission.dollarEstimate !== undefined
        ? { value: submission.dollarEstimate }
        : {}),
    },
  };
}
