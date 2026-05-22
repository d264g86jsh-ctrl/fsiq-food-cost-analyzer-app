import { db } from '@/lib/db';
import type { Prisma, WorkflowStatus, PdfStatus, CrmSyncStatus } from '@prisma/client';

export type SubmissionFilter =
  | 'all'
  | 'manual_review'
  | 'workflow_failed'
  | 'pdf_failed'
  | 'crm_failed'
  | 'meta_failed'
  | 'qualified'
  | 'dq';

export function buildWhereClause(filter: SubmissionFilter): Prisma.SubmissionWhereInput {
  switch (filter) {
    case 'manual_review':   return { manualReviewRequired: true };
    case 'workflow_failed': return { workflowStatus: 'failed' as WorkflowStatus };
    case 'pdf_failed':      return { pdfStatus: 'error' as PdfStatus };
    case 'crm_failed':      return { crmSyncStatus: 'error' as CrmSyncStatus };
    case 'meta_failed':     return { metaStatus: 'error' };
    case 'qualified':       return { qualified: true };
    case 'dq':              return { qualified: false };
    case 'all':
    default:                return {};
  }
}

export const LIST_SELECT = {
  id:                   true,
  createdAt:            true,
  restaurantName:       true,
  fullName:             true,
  email:                true,
  website:              true,
  qualified:            true,
  finalDecision:        true,
  countryEligibility:   true,
  dqReason:             true,
  pdfStatus:            true,
  crmSyncStatus:        true,
  metaStatus:           true,
  workflowStage:        true,
  workflowStatus:       true,
  manualReviewRequired: true,
  manualReviewStatus:   true,
} as const;

export type SubmissionListItem = Prisma.SubmissionGetPayload<{ select: typeof LIST_SELECT }>;

export const PAGE_SIZE = 25;

export async function getSubmissions(
  filter: SubmissionFilter,
  page: number,
): Promise<{ items: SubmissionListItem[]; total: number; page: number; pageSize: number }> {
  const where = buildWhereClause(filter);
  const skip  = (page - 1) * PAGE_SIZE;

  const [items, total] = await Promise.all([
    db.submission.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      skip,
      take: PAGE_SIZE,
    }),
    db.submission.count({ where }),
  ]);

  return { items, total, page, pageSize: PAGE_SIZE };
}

export async function getSubmission(id: string) {
  return db.submission.findUnique({ where: { id } });
}

export async function getSubmissionCounts(): Promise<{
  total:           number;
  qualified:       number;
  dq:              number;
  manualReview:    number;
  workflowFailed:  number;
  pdfFailed:       number;
  crmFailed:       number;
  metaFailed:      number;
}> {
  const [total, qualified, dq, manualReview, workflowFailed, pdfFailed, crmFailed, metaFailed] =
    await Promise.all([
      db.submission.count(),
      db.submission.count({ where: { qualified: true } }),
      db.submission.count({ where: { qualified: false } }),
      db.submission.count({ where: { manualReviewRequired: true } }),
      db.submission.count({ where: { workflowStatus: 'failed' as WorkflowStatus } }),
      db.submission.count({ where: { pdfStatus: 'error' as PdfStatus } }),
      db.submission.count({ where: { crmSyncStatus: 'error' as CrmSyncStatus } }),
      db.submission.count({ where: { metaStatus: 'error' } }),
    ]);

  return { total, qualified, dq, manualReview, workflowFailed, pdfFailed, crmFailed, metaFailed };
}
