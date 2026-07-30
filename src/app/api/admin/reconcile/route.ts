// Admin reconciliation endpoint — detects submissions stuck in bad states.
// Protected by ADMIN_ACCESS_TOKEN via Authorization: Bearer header.
//
// Checks:
//   1. Stuck in_progress > 10 minutes
//   2. pdfStatus=complete but pdfDownloadUrl is null
//   3. crmSyncStatus=error older than 5 minutes
//   4. workflowStatus=partial older than 5 minutes (actionable partial failures)
//
// Does NOT auto-repair — returns a report for ops to take action on.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { validateAdminToken } from '@/lib/admin/admin-auth';

export async function GET(req: Request): Promise<NextResponse> {
  const token = req.headers.get('authorization')?.replace('Bearer ', '') ?? '';
  if (!validateAdminToken(token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = new Date();
  const tenMinutesAgo = new Date(now.getTime() - 10 * 60 * 1000);
  const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000);

  const [stuckInProgress, pdfUrlMissing, crmErrors, partialFailures] = await Promise.all([
    db.submission.findMany({
      where: {
        workflowStatus: 'in_progress',
        createdAt: { lte: tenMinutesAgo },
      },
      select: { id: true, email: true, restaurantName: true, workflowStage: true, workflowFailReason: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),

    db.submission.findMany({
      where: {
        pdfStatus: 'complete',
        pdfDownloadUrl: null,
      },
      select: { id: true, email: true, restaurantName: true, pdfStatus: true, pdfError: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),

    db.submission.findMany({
      where: {
        crmSyncStatus: 'error',
        createdAt: { lte: fiveMinutesAgo },
      },
      select: { id: true, email: true, restaurantName: true, crmSyncError: true, workflowStage: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    }),

    db.submission.findMany({
      where: {
        workflowStatus: 'partial',
        createdAt: { lte: fiveMinutesAgo },
      },
      select: { id: true, email: true, restaurantName: true, workflowStage: true, workflowFailReason: true, workflowErrors: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
      take: 50,
    }),
  ]);

  return NextResponse.json({
    generatedAt: now.toISOString(),
    summary: {
      stuckInProgress: stuckInProgress.length,
      pdfUrlMissing: pdfUrlMissing.length,
      crmErrors: crmErrors.length,
      partialFailures: partialFailures.length,
    },
    stuckInProgress,
    pdfUrlMissing,
    crmErrors,
    partialFailures,
  });
}
