// Generates a UUID event_id for Meta Pixel + CAPI deduplication.
// Isomorphic — works in both browser and Node.js.
// The same event_id must be passed to both the browser fbq call and the server CAPI call.

export function generateEventId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback: should not be reached in modern environments
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
