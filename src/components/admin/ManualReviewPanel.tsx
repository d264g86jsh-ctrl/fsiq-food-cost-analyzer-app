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
    <div className="space-y-4">
      <div className="space-y-3">
        <div>
          <label className="block text-xs font-medium text-[#475569] mb-1">Review status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ManualReviewStatus)}
            className="w-full sm:w-64 px-3 py-2 text-sm border border-[#e2e8f0] rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#52C275]/30 focus:border-[#52C275]"
          >
            {STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-medium text-[#475569] mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            placeholder="Internal review notes…"
            className="w-full px-3 py-2 text-sm border border-[#e2e8f0] rounded-lg bg-white resize-none focus:outline-none focus:ring-2 focus:ring-[#52C275]/30 focus:border-[#52C275]"
          />
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={isPending}
            className="px-4 py-2 bg-[#143225] text-white text-sm font-semibold rounded-lg hover:bg-[#1a4632] disabled:opacity-60 transition-colors"
          >
            {isPending ? 'Saving…' : 'Save review'}
          </button>

          {result?.success && (
            <span className="text-sm text-green-700">Saved successfully.</span>
          )}
          {result?.error && (
            <span className="text-sm text-red-600">{result.error}</span>
          )}
        </div>

        {reviewedAt && (
          <p className="text-xs text-[#94a3b8]">Last reviewed: {formatDate(reviewedAt)}</p>
        )}
      </div>

      <div className="border-t border-[#e2e8f0] pt-4">
        <p className="text-xs font-medium text-[#64748b] mb-2">Phase 11 actions</p>
        <div className="flex flex-wrap gap-2">
          <button
            disabled
            className="px-3 py-1.5 text-xs border border-[#e2e8f0] rounded-lg text-[#94a3b8] cursor-not-allowed"
          >
            Retry PDF
          </button>
          <button
            disabled
            className="px-3 py-1.5 text-xs border border-[#e2e8f0] rounded-lg text-[#94a3b8] cursor-not-allowed"
          >
            Re-sync GHL
          </button>
          <button
            disabled
            className="px-3 py-1.5 text-xs border border-[#e2e8f0] rounded-lg text-[#94a3b8] cursor-not-allowed"
          >
            Retry Meta CAPI
          </button>
        </div>
      </div>
    </div>
  );
}
