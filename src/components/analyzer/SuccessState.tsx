'use client';

// v2 success screen — 3-stage animated progress inside the glass card.
// The hero and below-fold sections remain visible (rendered by AnalyzerPageV2).

import { useState, useEffect } from 'react';

const STAGES = [
  {
    key: 'analyze',
    title: 'Analysis running',
    body: 'Matching your profile against 500+ independent operators.',
  },
  {
    key: 'pdf',
    title: 'Generating your PDF',
    body: 'Building a 6-page invoice-level review with line-item targets.',
  },
  {
    key: 'email',
    title: 'Sending to your inbox',
    body: 'Your report will arrive in a few minutes.',
  },
] as const;

export function SuccessState() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (active >= STAGES.length) return;
    const id = setTimeout(() => setActive((a) => Math.min(a + 1, STAGES.length)), 2200);
    return () => clearTimeout(id);
  }, [active]);

  return (
    <div className="fsiq-step-in text-center">
      {/* Check circle */}
      <div className="mx-auto w-14 h-14 rounded-full grid place-items-center bg-[#f0fdf4] border border-[#52C275]/40">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M5 12.5l4.5 4.5L19 7.5"
            stroke="#143225"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h2 className="mt-5 text-[26px] sm:text-[30px] font-bold tracking-[-0.02em] text-balance text-[#143225]">
        We&apos;ve received your information
      </h2>
      <p className="mt-2 text-[14px] text-[#475569] max-w-md mx-auto leading-relaxed">
        Your savings analysis is in queue. Here&apos;s what happens next.
      </p>

      {/* Indeterminate progress shimmer */}
      <div className="mt-6 relative h-[3px] rounded-full bg-[#143225]/10 overflow-hidden fsiq-bar">
        <div className="absolute inset-0 bg-[#52C275]/15" />
      </div>

      {/* Animated stage list */}
      <ol className="mt-6 space-y-2.5 text-left">
        {STAGES.map((s, i) => {
          const status = i < active ? 'done' : i === active ? 'running' : 'pending';
          return (
            <li
              key={s.key}
              className={[
                'flex items-start gap-3 rounded-2xl px-4 py-3 transition-all duration-500',
                status === 'done'    ? 'bg-[#f0fdf4]' :
                status === 'running' ? 'bg-white shadow-sm border border-[#52C275]/40' :
                                       'bg-[#143225]/[0.03]',
              ].join(' ')}
            >
              {/* Status circle */}
              <div
                className={[
                  'mt-0.5 w-7 h-7 rounded-full grid place-items-center shrink-0 transition-colors',
                  status === 'done'    ? 'bg-[#52C275] text-white' :
                  status === 'running' ? 'bg-[#143225] text-white' :
                                         'bg-[#cbd5e1] text-white',
                ].join(' ')}
              >
                {status === 'done' && (
                  <svg width="13" height="13" viewBox="0 0 12 12" fill="none" aria-hidden="true">
                    <path d="M2.5 6.2l2.4 2.3L9.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                )}
                {status === 'running' && (
                  <span className="w-3 h-3 rounded-full border-2 border-white/40 fsiq-spinner" aria-label="In progress" />
                )}
                {status === 'pending' && (
                  <span className="text-[10px] font-semibold" aria-hidden="true">{i + 1}</span>
                )}
              </div>

              {/* Text */}
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className={`text-[14px] font-semibold ${status === 'pending' ? 'text-[#94a3b8]' : 'text-[#143225]'}`}>
                    {s.title}
                  </p>
                  <span
                    className={[
                      'text-[10px] uppercase tracking-wider font-medium shrink-0',
                      status === 'done'    ? 'text-[#52C275]' :
                      status === 'running' ? 'text-[#64748b] fsiq-pulse' : 'text-[#94a3b8]',
                    ].join(' ')}
                    aria-live="polite"
                  >
                    {status === 'done' ? 'Done' : status === 'running' ? 'In progress' : 'Queued'}
                  </span>
                </div>
                <p className={`mt-0.5 text-[12px] leading-snug ${status === 'pending' ? 'text-[#94a3b8]' : 'text-[#475569]'}`}>
                  {s.body}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      <button
        onClick={() => window.location.reload()}
        className="mt-7 text-[12px] text-[#64748b] hover:text-[#143225] underline underline-offset-4 transition-colors"
      >
        Submit another restaurant
      </button>
    </div>
  );
}
