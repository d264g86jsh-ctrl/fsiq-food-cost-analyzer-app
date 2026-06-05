'use client';

import { useState } from 'react';
import { retryGhlSync } from '@/actions/admin';

export function RetryGhlButton({ submissionId }: { submissionId: string }) {
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function handleRetry() {
    setState('loading');
    setMessage(null);
    try {
      const result = await retryGhlSync(submissionId);
      if (result.success) {
        setState('success');
        setMessage(result.ghlContactId ? `Synced — contact ${result.ghlContactId}` : 'Synced');
      } else {
        setState('error');
        setMessage(result.error ?? 'Retry failed.');
      }
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'Unexpected error.');
    }
  }

  if (state === 'success') {
    return (
      <span className="pill pill-success text-[12px]">
        <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#52C275]" />
        {message}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        onClick={handleRetry}
        disabled={state === 'loading'}
        className="text-[12px] font-medium px-3 py-1 rounded-lg border border-[#dc2626] text-[#dc2626] hover:bg-[#fef2f2] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {state === 'loading' ? 'Retrying…' : 'Retry GHL Sync'}
      </button>
      {state === 'error' && message && (
        <span className="text-[11px] text-[#dc2626] max-w-[220px] text-right leading-tight">{message}</span>
      )}
    </div>
  );
}
