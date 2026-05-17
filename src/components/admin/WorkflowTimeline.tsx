import { formatWorkflowErrors } from '@/lib/admin/submission-formatters';
import { WorkflowStatusBadge } from './SubmissionStatusBadge';
import type { Prisma } from '@prisma/client';

interface WorkflowTimelineProps {
  workflowStage:  string | null;
  workflowStatus: string | null;
  workflowErrors: Prisma.JsonValue;
}

export function WorkflowTimeline({
  workflowStage,
  workflowStatus,
  workflowErrors,
}: WorkflowTimelineProps) {
  const errors = formatWorkflowErrors(workflowErrors);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-[#475569]">
          Stage: <span className="font-medium text-[#143225]">{workflowStage ?? '—'}</span>
        </span>
        <WorkflowStatusBadge status={workflowStatus} />
      </div>

      {errors.length > 0 ? (
        <div className="space-y-2">
          <p className="text-xs font-medium text-[#64748b] uppercase tracking-wide">
            Workflow Errors ({errors.length})
          </p>
          {errors.map((err, i) => (
            <div
              key={i}
              className="rounded-lg border border-red-200 bg-red-50 p-3 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-red-800">{err.stage}</span>
                <span className="text-xs text-red-600">{err.timestamp}</span>
              </div>
              <p className="text-xs text-red-700 font-mono break-all">{err.error}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-[#94a3b8]">No workflow errors.</p>
      )}
    </div>
  );
}
