import { db } from '@/lib/db';
import { buildGhlPayload } from '@/lib/crm/build-ghl-payload';
import { syncToGhl } from '@/lib/crm/ghl';
import { LEAD_STATUS } from '@/lib/crm/lead-status';
import { buildLeadEvent, buildQualifiedLeadEvent } from '@/lib/meta/meta-events';
import { sendToMetaCapi } from '@/lib/meta/meta-capi';
import { withRetry } from '@/lib/workflow/retry';
import type { CrmSyncStatus, Prisma, WorkflowStatus } from '@prisma/client';
import type { SubmitAnalysisResult, SyncAndReturnInput } from '@/lib/workflow/types';

export async function syncAndReturn(input: SyncAndReturnInput): Promise<SubmitAnalysisResult> {
  const fresh = await db.submission.findUnique({ where: { id: input.submissionId } }).catch(() => null);

  let crmSyncStatus: 'synced' | 'error' = 'error';
  let ghlContactId: string | null = null;
  let crmSyncError: string | null = 'Record not found for GHL sync';

  if (fresh) {
    const ghlPayload = buildGhlPayload(fresh, input.status.leadStatus, input.status.communicationRoute, input.status.tags);
    const crmResult = await withRetry(
      () => syncToGhl(ghlPayload),
      { maxAttempts: 3, backoffMs: 1000 },
    );
    crmSyncStatus = crmResult.crmSyncStatus;
    ghlContactId = crmResult.ghlContactId;
    crmSyncError = crmResult.crmSyncError;
  }

  let metaResult: { metaStatus: 'fired' | 'error' | 'skipped'; metaEventIds: string[]; metaError: string | null } = {
    metaStatus: 'skipped', metaEventIds: [], metaError: 'Record not found for CAPI',
  };

  if (fresh) {
    const capiEvents = [buildLeadEvent(fresh, input.trackingContext)];
    const isQualifiedPdfReady =
      input.status.leadStatus === LEAD_STATUS.QUALIFIED_FULL_PDF_READY ||
      input.status.leadStatus === LEAD_STATUS.QUALIFIED_CONSERVATIVE_PDF_READY;
    if (isQualifiedPdfReady) capiEvents.push(buildQualifiedLeadEvent(fresh, input.trackingContext));
    metaResult = await withRetry(
      () => sendToMetaCapi(capiEvents),
      { maxAttempts: 3, backoffMs: 500 },
    ).catch((err) => ({
      metaStatus: 'error' as const,
      metaEventIds: [],
      metaError: err instanceof Error ? err.message : String(err),
    }));
  }

  await db.submission.update({
    where: { id: input.submissionId },
    data: {
      crmSyncStatus: crmSyncStatus as CrmSyncStatus,
      ghlContactId,
      crmSyncError,
      crmTags: input.status.tags as unknown as Prisma.InputJsonValue,
      metaStatus: metaResult.metaStatus,
      metaEventIds: metaResult.metaEventIds as unknown as Prisma.InputJsonValue,
      metaError: metaResult.metaError,
      workflowStage: 'complete',
      workflowStatus: (input.workflowErrors.length > 0 || crmSyncStatus === 'error')
        ? 'partial' as WorkflowStatus
        : 'complete' as WorkflowStatus,
      workflowErrors: input.workflowErrors.length > 0
        ? (input.workflowErrors as unknown as Prisma.InputJsonValue)
        : undefined,
    },
  }).catch(() => {});

  return {
    success: true,
    submissionId: input.submissionId,
    error: null,
    qualified: input.responseQualified,
    dqReason: input.responseDqReason,
    leadStatus: input.status.leadStatus,
    dollarEstimateDisplay: input.responseDollarEstimate,
    pdfDownloadUrl: null,
  };
}

