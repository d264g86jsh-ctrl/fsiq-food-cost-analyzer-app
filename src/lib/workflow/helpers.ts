import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';
import type { SubmitAnalysisResult, WorkflowError } from '@/lib/workflow/types';

// ── Structured logger ─────────────────────────────────────────────────────────
// All pipeline log calls include submissionId + stage for correlation.

type LogLevel = 'info' | 'warn' | 'error';

export function pipelineLog(
  level: LogLevel,
  submissionId: string | null,
  stage: string,
  message: string,
  meta?: Record<string, unknown>,
): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    submissionId,
    stage,
    message,
    ...(meta ? { meta } : {}),
  };
  if (level === 'error') {
    console.error(JSON.stringify(entry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}

export async function patchSubmission(
  submissionId: string,
  workflowErrors: WorkflowError[],
  data: Prisma.SubmissionUpdateInput,
): Promise<void> {
  try {
    await db.submission.update({ where: { id: submissionId }, data });
  } catch (err) {
    workflowErrors.push({
      stage: 'db_update',
      error: err instanceof Error ? err.message : String(err),
      timestamp: new Date().toISOString(),
    });
  }
}

export function failResult(submissionId: string | null, error: string): SubmitAnalysisResult {
  return {
    success: false,
    submissionId,
    error,
    qualified: null,
    dqReason: null,
    leadStatus: null,
    dollarEstimateDisplay: null,
    pdfDownloadUrl: null,
  };
}

