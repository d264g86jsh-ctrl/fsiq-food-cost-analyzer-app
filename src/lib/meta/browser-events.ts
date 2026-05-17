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
  eventName: string,
  params: Record<string, unknown> = {},
  eventId?: string,
): void {
  try {
    if (typeof window !== 'undefined' && typeof window.fbq === 'function') {
      const options = eventId ? { eventID: eventId } : undefined;
      window.fbq('track', eventName, params, options);
    }
  } catch { /* best effort */ }
}

// Fires once when the user first interacts with the analyzer form.
// No PII. No event_id (no server-side counterpart).
export function fireAnalyzerStarted(): void {
  safeFirePixel('AnalyzerStarted', { content_name: 'food_cost_analyzer' });
}

// Fires at form submit. Uses 'Lead' as the event name to match the server CAPI Lead event.
// The caller must pass the same event_id used in the CAPI call for deduplication.
export function fireBrowserLead(eventId: string): void {
  safeFirePixel('Lead', { content_name: 'food_cost_analyzer' }, eventId);
}
