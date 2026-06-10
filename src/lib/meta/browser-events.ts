// Client-only Meta Pixel event helpers.
// Do not import from server code.
//
// Event naming: browser fires 'Lead' to match the server CAPI 'Lead' event.
// Both share the same event_id so Meta can deduplicate them.
// 'AnalyzerStarted' is an internal-name helper but fires as 'AnalyzerStarted' to Pixel
// (no server-side counterpart, so no dedup needed).

declare global {
  interface Window {
    fbq?: (
      command: string,
      eventName: string,
      params?: Record<string, unknown>,
      options?: { eventID?: string },
    ) => void;
  }
}

function safeFirePixel(
  command: 'track' | 'trackCustom',
  eventName: string,
  params: Record<string, unknown> = {},
  eventId?: string,
): void {
  try {
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      const options = eventId ? { eventID: eventId } : undefined;
      window.fbq(command, eventName, params, options);
    }
  } catch { /* best effort */ }
}

// Fires once when the user first interacts with the analyzer form.
// No PII. No event_id (no server-side counterpart).
export function fireAnalyzerStarted(): void {
  safeFirePixel('track', 'AnalyzerStarted', { content_name: 'food_cost_analyzer' });
}

// Fires at form submit. Uses 'Lead' as the event name to match the server CAPI Lead event.
// The caller must pass the same event_id used in the CAPI call for deduplication.
// PII (em, ph, fn) is passed here — fbq.js hashes it client-side before sending.
export function fireBrowserLead(eventId: string, pii: { email?: string; phone?: string; firstName?: string }): void {
  safeFirePixel('track', 'Lead', {
    content_name: 'food_cost_analyzer',
    ...(pii.email     ? { em: pii.email.trim().toLowerCase() } : {}),
    ...(pii.phone     ? { ph: pii.phone.replace(/\D/g, '') } : {}),
    ...(pii.firstName ? { fn: pii.firstName.trim().toLowerCase() } : {}),
  }, eventId);
}

// Fires after a successful qualified submission. Dual-fires with the server CAPI
// QualifiedLead event — both carry the same 'ql-{eventId}' so Meta deduplicates
// them to one. The browser fires immediately on result; the server fires after PDF
// generation completes (typically 45–90s later, within Meta's 48h dedup window).
// Pass value in whole dollars and currency so Meta can use QualifiedLead for value
// optimization even if it deduplicates to the browser event.
export function fireQualifiedLead(params: {
  spendInput?: string;
  estimatedSavings?: string;
  value?: number;    // numeric dollar estimate — matches server custom_data.value
  eventId?: string;  // 'ql-' + submission eventId, shared with server CAPI for dedup
}): void {
  safeFirePixel('trackCustom', 'QualifiedLead', {
    content_name:      'food_cost_analyzer',
    spend_input:       params.spendInput ?? '',
    estimated_savings: params.estimatedSavings ?? '',
    ...(params.value !== undefined ? { value: params.value, currency: 'USD' } : {}),
  }, params.eventId);
}
