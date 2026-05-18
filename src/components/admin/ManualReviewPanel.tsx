'use client';

import { useState, useTransition } from 'react';
import type { ManualReviewStatus } from '@prisma/client';
import { updateManualReview } from '@/actions/admin';
import { formatDate } from '@/lib/admin/submission-formatters';

interface ManualReviewPanelProps {
  submissionId:  string;
  currentStatus: ManualReviewStatus;
  currentNotes:  string | null;
  reviewedAt:    Date | null;
}

const STATUS_OPTIONS: { value: ManualReviewStatus; label: string }[] = [
  { value: 'pending',      label: 'Pending' },
  { value: 'approved',     label: 'Approved' },
  { value: 'rejected',     label: 'Rejected' },
  { value: 'not_required', label: 'Not Required' },
];

const RefreshIcon = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path d="M13.5 7A5.5 5.5 0 1 1 8 1.5c1.7 0 3.2.77 4.2 1.97M13 1v3h-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

export function ManualReviewPanel({
  submissionId,
  currentStatus,
  currentNotes,
  reviewedAt,
}: ManualReviewPanelProps) {
  const [status, setStatus] = useState<ManualReviewStatus>(currentStatus);
  const [notes, setNotes]   = useState(currentNotes ?? '');
  const [result, setResult] = useState<{ success: boolean; error?: string } | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    setResult(null);
    startTransition(async () => {
      const res = await updateManualReview(submissionId, status, notes);
      setResult(res);
    });
  }

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="space-y-4">
        <div>
          <label className="block text-[12px] font-medium text-[#64748b] mb-1.5">Review status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ManualReviewStatus)}
            className="field-select"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-[12px] font-medium text-[#64748b] mb-1.5">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Internal review notes…"
            className="field-textarea"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="btn-primary"
          >
            {isPending ? 'Saving…' : 'Save review'}
          </button>

          {result?.success && (
            <span className="text-[13px] text-[#52C275] font-medium">Saved.</span>
          )}
          {result?.error && (
            <span className="text-[13px] text-[#dc2626]">{result.error}</span>
          )}
        </div>

        {reviewedAt && (
          <p className="text-[11px] text-[#94a3b8]">Last reviewed: {formatDate(reviewedAt)}</p>
        )}
      </div>

      <div className="border-t border-[#f1f3ee] pt-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#64748b] mb-3">
          Phase 11 actions
        </p>
        <div className="flex flex-wrap gap-2">
          <button disabled className="btn-ghost opacity-40 cursor-not-allowed">
            <RefreshIcon /> Retry PDF
          </button>
          <button disabled className="btn-ghost opacity-40 cursor-not-allowed">
            <RefreshIcon /> Re-sync GHL
          </button>
          <button disabled className="btn-ghost opacity-40 cursor-not-allowed">
            <RefreshIcon /> Retry Meta CAPI
          </button>
        </div>
      </div>
    </div>
  );
}
