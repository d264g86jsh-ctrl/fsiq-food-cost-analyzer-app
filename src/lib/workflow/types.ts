import type { AssignLeadStatusResult } from '@/lib/crm/assign-lead-status';
import type { TrackingContext } from '@/lib/meta/meta-types';

export interface SubmitAnalysisResult {
  success: boolean;
  submissionId: string | null;
  error: string | null;
  qualified: boolean | null;
  dqReason: string | null;
  leadStatus: string | null;
  dollarEstimateDisplay: string | null;
  pdfDownloadUrl: string | null;
}

export type WorkflowError = { stage: string; error: string; timestamp: string };

export interface SyncAndReturnInput {
  submissionId: string;
  status: AssignLeadStatusResult;
  workflowErrors: WorkflowError[];
  responseQualified: boolean;
  responseDqReason: string | null;
  responseDollarEstimate: string | null;
  trackingContext: TrackingContext;
}

