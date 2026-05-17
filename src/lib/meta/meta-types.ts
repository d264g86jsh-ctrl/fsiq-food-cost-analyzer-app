// TypeScript types for Meta Pixel browser events and Conversions API (CAPI) payloads.
// Source of truth: Meta Marketing API documentation.
// Server CAPI fields: META_PIXEL_ID + META_CONVERSIONS_API_TOKEN (server-only env vars).
// Browser Pixel: NEXT_PUBLIC_META_PIXEL_ID (public env var).

export interface MetaUserData {
  em?: string;               // SHA-256 of lowercase+trimmed email
  ph?: string;               // SHA-256 of digits-only phone
  zp?: string;               // SHA-256 of trimmed ZIP
  fbp?: string;              // _fbp cookie value
  fbc?: string;              // _fbc cookie value (or derived from fbclid)
  client_ip_address?: string;
  client_user_agent?: string;
}

export interface MetaCustomData {
  content_name?: string;
  value?: number;
  currency?: string;
  lead_type?: string;
}

export interface MetaCapiEvent {
  event_name: string;
  event_time: number;        // Unix timestamp (seconds)
  event_id: string;          // Shared with browser event for deduplication
  action_source: 'website';
  event_source_url?: string;
  user_data: MetaUserData;
  custom_data?: MetaCustomData;
}

export interface MetaCapiResult {
  metaStatus: 'fired' | 'error' | 'skipped';
  metaEventIds: string[];
  metaError: string | null;
}

export interface TrackingContext {
  fbp: string | null;
  fbc: string | null;
  eventId: string | null;
  clientUserAgent: string | null;
  clientIpAddress: string | null;
}
