import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));

import { buildWhereClause, PAGE_SIZE, type SubmissionFilter } from '../admin/submission-queries';

describe('buildWhereClause', () => {
  it('returns empty object for "all"', () => {
    expect(buildWhereClause('all')).toEqual({});
  });

  it('returns manualReviewRequired: true for "manual_review"', () => {
    expect(buildWhereClause('manual_review')).toEqual({ manualReviewRequired: true });
  });

  it('returns workflowStatus: "failed" for "workflow_failed"', () => {
    expect(buildWhereClause('workflow_failed')).toEqual({ workflowStatus: 'failed' });
  });

  it('returns pdfStatus: "error" for "pdf_failed"', () => {
    expect(buildWhereClause('pdf_failed')).toEqual({ pdfStatus: 'error' });
  });

  it('returns crmSyncStatus: "error" for "crm_failed"', () => {
    expect(buildWhereClause('crm_failed')).toEqual({ crmSyncStatus: 'error' });
  });

  it('returns metaStatus: "error" for "meta_failed"', () => {
    expect(buildWhereClause('meta_failed')).toEqual({ metaStatus: 'error' });
  });

  it('returns qualified: true for "qualified"', () => {
    expect(buildWhereClause('qualified')).toEqual({ qualified: true });
  });

  it('returns qualified: false for "dq"', () => {
    expect(buildWhereClause('dq')).toEqual({ qualified: false });
  });

  it('covers all SubmissionFilter values', () => {
    const filters: SubmissionFilter[] = [
      'all',
      'manual_review',
      'workflow_failed',
      'pdf_failed',
      'crm_failed',
      'meta_failed',
      'qualified',
      'dq',
    ];
    for (const filter of filters) {
      expect(() => buildWhereClause(filter)).not.toThrow();
    }
  });
});

describe('PAGE_SIZE', () => {
  it('is 25', () => {
    expect(PAGE_SIZE).toBe(25);
  });
});
