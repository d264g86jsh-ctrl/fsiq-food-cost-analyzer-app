// Pure formatting helpers — no Prisma imports, fully testable.

export interface FormattedWorkflowError {
  stage: string;
  error: string;
  timestamp: string;
}

/**
 * Redacts common secret patterns from error strings before displaying in the admin UI.
 */
export function sanitizeErrorString(raw: string): string {
  return raw
    // Bearer tokens
    .replace(/Bearer\s+\S{8,}/g, 'Bearer [REDACTED]')
    // OpenAI / Anthropic-style secret keys
    .replace(/sk[-_]\w{20,}/g, '[REDACTED]')
    // JWT-style tokens (eyJ...)
    .replace(/eyJ[\w-]{20,}\./g, '[REDACTED].')
    // Long hex strings (>=40 chars)
    .replace(/\b[0-9a-fA-F]{40,}\b/g, '[REDACTED]')
    // Base64-like strings (>=40 chars, alphanumeric + /+=)
    .replace(/[A-Za-z0-9+/=]{40,}/g, '[REDACTED]');
}

/**
 * Parses a JSON array of workflow error objects and sanitizes each error string.
 */
export function formatWorkflowErrors(raw: unknown): FormattedWorkflowError[] {
  if (!raw || !Array.isArray(raw)) return [];
  return raw
    .filter(
      (item): item is { stage: unknown; error: unknown; timestamp: unknown } =>
        typeof item === 'object' && item !== null,
    )
    .map((item) => ({
      stage:     typeof item.stage === 'string' ? item.stage : String(item.stage ?? ''),
      error:     sanitizeErrorString(typeof item.error === 'string' ? item.error : String(item.error ?? '')),
      timestamp: typeof item.timestamp === 'string' ? item.timestamp : String(item.timestamp ?? ''),
    }));
}

// ── Label helpers ─────────────────────────────────────────────────────────────

export function qualifiedLabel(qualified: boolean | null): string {
  if (qualified === true) return 'Qualified';
  if (qualified === false) return 'DQ';
  return '—';
}

export function finalDecisionLabel(decision: string | null): string {
  switch (decision) {
    case 'verified_restaurant':  return 'Verified Restaurant';
    case 'plausible_unverified': return 'Plausible (Unverified)';
    case 'clear_non_fit':        return 'Clear Non-Fit';
    case 'national_chain':       return 'National Chain';
    case 'invalid_website':      return 'Invalid Website';
    default:                     return decision ?? '—';
  }
}

export function pdfStatusLabel(status: string | null): string {
  switch (status) {
    case 'pending':    return 'Pending';
    case 'generating': return 'Generating';
    case 'complete':   return 'Complete';
    case 'error':      return 'Error';
    case 'skipped':    return 'Skipped';
    default:           return status ?? '—';
  }
}

export function crmSyncLabel(status: string | null): string {
  switch (status) {
    case 'pending': return 'Pending';
    case 'synced':  return 'Synced';
    case 'error':   return 'Error';
    default:        return status ?? '—';
  }
}

export function metaStatusLabel(status: string | null): string {
  switch (status) {
    case 'fired':   return 'Fired';
    case 'error':   return 'Error';
    case 'skipped': return 'Skipped';
    case 'pending': return 'Pending';
    default:        return status ?? '—';
  }
}

export function workflowStatusLabel(status: string | null): string {
  switch (status) {
    case 'pending':     return 'Pending';
    case 'in_progress': return 'In Progress';
    case 'complete':    return 'Complete';
    case 'failed':      return 'Failed';
    case 'partial':     return 'Partial';
    default:            return status ?? '—';
  }
}

export function manualReviewStatusLabel(status: string | null): string {
  switch (status) {
    case 'not_required': return 'Not Required';
    case 'pending':      return 'Pending';
    case 'approved':     return 'Approved';
    case 'rejected':     return 'Rejected';
    default:             return status ?? '—';
  }
}

// ── Date / currency formatters ─────────────────────────────────────────────────

export function formatDate(d: Date | string | null): string {
  if (!d) return '—';
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleString('en-US', {
    timeZone:     'America/Chicago',
    year:         'numeric',
    month:        'short',
    day:          'numeric',
    hour:         '2-digit',
    minute:       '2-digit',
  });
}

export function formatDollar(n: number | null): string {
  if (n === null || n === undefined) return '—';
  return '$' + n.toLocaleString('en-US');
}
