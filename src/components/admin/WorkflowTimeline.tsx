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
        <span className="text-[13px] text-[#64748b]">
          Stage:{' '}
          <span className="font-mono text-[#143225]">{workflowStage ?? '—'}</span>
        </span>
        <WorkflowStatusBadge status={workflowStatus} />
      </div>

      {errors.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#64748b]">
            Workflow Errors ({errors.length})
          </p>
          {errors.map((err, i) => (
            <div
              key={i}
              className="rounded-2xl border border-red-200/70 bg-red-50/60 p-4 space-y-1"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-[12px] font-semibold text-[#991b1b]">{err.stage}</span>
                <span className="text-[11px] text-[#dc2626]">{err.timestamp}</span>
              </div>
              <p className="text-[11.5px] font-mono text-[#b91c1c] break-all">{err.error}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[13px] text-[#52C275]">No workflow errors.</p>
      )}
    </div>
  );
}
