import { describe, it, expect } from 'vitest';
import {
  sanitizeErrorString,
  formatWorkflowErrors,
  qualifiedLabel,
  finalDecisionLabel,
  pdfStatusLabel,
  crmSyncLabel,
  metaStatusLabel,
  workflowStatusLabel,
  manualReviewStatusLabel,
  formatDollar,
  formatDate,
} from '../admin/submission-formatters';

// ── sanitizeErrorString ────────────────────────────────────────────────────────

describe('sanitizeErrorString', () => {
  it('redacts Bearer tokens', () => {
    const result = sanitizeErrorString('Error: Bearer abc123def456ghi789jkl012mno345pqr678');
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('abc123def456ghi789jkl012mno345pqr678');
  });

  it('redacts sk- secret keys', () => {
    const result = sanitizeErrorString('key: sk-abcdefghijklmnopqrstuvwxyz012345');
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('sk-abcdefghijklmnopqrstuvwxyz012345');
  });

  it('redacts long hex strings (>=40 chars)', () => {
    const result = sanitizeErrorString('hash: abcdef1234567890abcdef1234567890abcdef12');
    expect(result).toContain('[REDACTED]');
    expect(result).not.toContain('abcdef1234567890abcdef1234567890abcdef12');
  });

  it('leaves simple connection errors unchanged', () => {
    const input = 'simple connection error';
    expect(sanitizeErrorString(input)).toBe(input);
  });

  it('leaves short strings unchanged', () => {
    const input = 'ECONNREFUSED 127.0.0.1:5432';
    expect(sanitizeErrorString(input)).toBe(input);
  });

  it('redacts multiple secrets in one string', () => {
    const result = sanitizeErrorString(
      'Bearer abc123def456ghi789jkl012mno345pqr678 and sk-abcdefghijklmnopqrstuvwxyz012345',
    );
    expect(result.match(/\[REDACTED\]/g)?.length).toBeGreaterThanOrEqual(2);
  });
});

// ── formatWorkflowErrors ──────────────────────────────────────────────────────

describe('formatWorkflowErrors', () => {
  it('parses a valid array of errors', () => {
    const input = [
      { stage: 'ai_research', error: 'timeout', timestamp: '2025-01-01T00:00:00.000Z' },
    ];
    const result = formatWorkflowErrors(input);
    expect(result).toHaveLength(1);
    expect(result[0].stage).toBe('ai_research');
    expect(result[0].error).toBe('timeout');
    expect(result[0].timestamp).toBe('2025-01-01T00:00:00.000Z');
  });

  it('returns empty array for empty input', () => {
    expect(formatWorkflowErrors([])).toEqual([]);
  });

  it('returns empty array for null', () => {
    expect(formatWorkflowErrors(null)).toEqual([]);
  });

  it('returns empty array for non-array (object)', () => {
    expect(formatWorkflowErrors({ stage: 'x', error: 'y' })).toEqual([]);
  });

  it('sanitizes error strings in the output', () => {
    const input = [
      {
        stage: 'pdf_generation',
        error: 'Bearer abc123def456ghi789jkl012mno345pqr678 failed',
        timestamp: '2025-01-01T00:00:00.000Z',
      },
    ];
    const result = formatWorkflowErrors(input);
    expect(result[0].error).toContain('[REDACTED]');
    expect(result[0].error).not.toContain('abc123def456ghi789jkl012mno345pqr678');
  });
});

// ── Label helpers ─────────────────────────────────────────────────────────────

describe('qualifiedLabel', () => {
  it('returns Qualified for true', () => expect(qualifiedLabel(true)).toBe('Qualified'));
  it('returns DQ for false', () => expect(qualifiedLabel(false)).toBe('DQ'));
  it('returns em-dash for null', () => expect(qualifiedLabel(null)).toBe('—'));
});

describe('finalDecisionLabel', () => {
  it('maps verified_restaurant', () => expect(finalDecisionLabel('verified_restaurant')).toBe('Verified Restaurant'));
  it('maps plausible_unverified', () => expect(finalDecisionLabel('plausible_unverified')).toBe('Plausible (Unverified)'));
  it('maps clear_non_fit', () => expect(finalDecisionLabel('clear_non_fit')).toBe('Clear Non-Fit'));
  it('maps national_chain', () => expect(finalDecisionLabel('national_chain')).toBe('National Chain'));
  it('maps invalid_website', () => expect(finalDecisionLabel('invalid_website')).toBe('Invalid Website'));
  it('returns em-dash for null', () => expect(finalDecisionLabel(null)).toBe('—'));
  it('returns unknown values as-is', () => expect(finalDecisionLabel('unknown_value')).toBe('unknown_value'));
});

describe('pdfStatusLabel', () => {
  it('maps pending', () => expect(pdfStatusLabel('pending')).toBe('Pending'));
  it('maps generating', () => expect(pdfStatusLabel('generating')).toBe('Generating'));
  it('maps complete', () => expect(pdfStatusLabel('complete')).toBe('Complete'));
  it('maps error', () => expect(pdfStatusLabel('error')).toBe('Error'));
  it('maps skipped', () => expect(pdfStatusLabel('skipped')).toBe('Skipped'));
  it('returns em-dash for null', () => expect(pdfStatusLabel(null)).toBe('—'));
});

describe('crmSyncLabel', () => {
  it('maps pending', () => expect(crmSyncLabel('pending')).toBe('Pending'));
  it('maps synced', () => expect(crmSyncLabel('synced')).toBe('Synced'));
  it('maps error', () => expect(crmSyncLabel('error')).toBe('Error'));
  it('returns em-dash for null', () => expect(crmSyncLabel(null)).toBe('—'));
});

describe('metaStatusLabel', () => {
  it('maps fired', () => expect(metaStatusLabel('fired')).toBe('Fired'));
  it('maps error', () => expect(metaStatusLabel('error')).toBe('Error'));
  it('maps skipped', () => expect(metaStatusLabel('skipped')).toBe('Skipped'));
  it('maps pending', () => expect(metaStatusLabel('pending')).toBe('Pending'));
  it('returns em-dash for null', () => expect(metaStatusLabel(null)).toBe('—'));
});

describe('workflowStatusLabel', () => {
  it('maps pending', () => expect(workflowStatusLabel('pending')).toBe('Pending'));
  it('maps in_progress', () => expect(workflowStatusLabel('in_progress')).toBe('In Progress'));
  it('maps complete', () => expect(workflowStatusLabel('complete')).toBe('Complete'));
  it('maps failed', () => expect(workflowStatusLabel('failed')).toBe('Failed'));
  it('maps partial', () => expect(workflowStatusLabel('partial')).toBe('Partial'));
  it('returns em-dash for null', () => expect(workflowStatusLabel(null)).toBe('—'));
});

describe('manualReviewStatusLabel', () => {
  it('maps not_required', () => expect(manualReviewStatusLabel('not_required')).toBe('Not Required'));
  it('maps pending', () => expect(manualReviewStatusLabel('pending')).toBe('Pending'));
  it('maps approved', () => expect(manualReviewStatusLabel('approved')).toBe('Approved'));
  it('maps rejected', () => expect(manualReviewStatusLabel('rejected')).toBe('Rejected'));
  it('returns em-dash for null', () => expect(manualReviewStatusLabel(null)).toBe('—'));
});

// ── formatDollar ──────────────────────────────────────────────────────────────

describe('formatDollar', () => {
  it('formats a positive number', () => {
    expect(formatDollar(1500000)).toBe('$1,500,000');
  });
  it('formats zero', () => {
    expect(formatDollar(0)).toBe('$0');
  });
  it('returns em-dash for null', () => {
    expect(formatDollar(null)).toBe('—');
  });
});

// ── formatDate ────────────────────────────────────────────────────────────────

describe('formatDate', () => {
  it('formats a valid date string', () => {
    const result = formatDate('2025-06-15T12:00:00.000Z');
    // Should contain year and month abbreviation
    expect(result).toMatch(/2025/);
    expect(result).toMatch(/Jun/);
  });

  it('formats a Date object', () => {
    // Use noon UTC so that America/Chicago (UTC-5/6) still lands in the same year
    const d = new Date('2025-06-15T18:00:00.000Z');
    const result = formatDate(d);
    expect(result).toMatch(/2025/);
  });

  it('returns em-dash for null', () => {
    expect(formatDate(null)).toBe('—');
  });
});
