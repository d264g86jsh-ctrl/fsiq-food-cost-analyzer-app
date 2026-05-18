// Phase 4 update: added non_us state, updated decisionToUIState to accept internalFlags,
// fixed isSubmitBlocked to remove national_chain (eligibility decision, not a block).

'use client';

import type { FinalDecision } from '@/lib/website/types';

export type ValidationUIState =
  | 'idle'
  | 'checking'
  | 'verified'
  | 'unable_to_verify_but_can_continue'
  | 'likely_not_fit'
  | 'national_chain'
  | 'invalid_website'
  | 'non_us'
  | 'error';

export interface WebsiteValidationStatusProps {
  state: ValidationUIState;
  allowSubmit: boolean;
}

// Maps finalDecision + internalFlags to the ValidationUIState shown in the UI.
// non_us is identified by internalFlags.includes('non_us_ineligible') when
// finalDecision is clear_non_fit (per website-validation-spec.md).
export function decisionToUIState(
  decision: FinalDecision | null,
  internalFlags?: string[],
  hasError?: boolean,
): ValidationUIState {
  if (hasError) return 'error';
  if (!decision) return 'idle';

  switch (decision) {
    case 'verified_restaurant':
      return 'verified';
    case 'plausible_unverified':
      return 'unable_to_verify_but_can_continue';
    case 'clear_non_fit':
      return internalFlags?.includes('non_us_ineligible') ? 'non_us' : 'likely_not_fit';
    case 'national_chain':
      return 'national_chain';
    case 'invalid_website':
      return 'invalid_website';
    default:
      return 'idle';
  }
}

// Returns true only for invalid_website — the one state where the URL itself is the problem.
// national_chain, clear_non_fit, non_us, plausible_unverified are eligibility/routing decisions
// that must never block a completed lead from being captured (Phase 4 spec).
export function isSubmitBlocked(state: ValidationUIState): boolean {
  return state === 'invalid_website';
}

const STATE_CONFIG: Record<
  ValidationUIState,
  { message: string | null; colorClass: string }
> = {
  idle: { message: null, colorClass: '' },
  checking: {
    message: 'Checking your website…',
    colorClass: 'text-[#64748b]',
  },
  verified: {
    message: '✓ Restaurant website confirmed',
    colorClass: 'text-[#52C275]',
  },
  unable_to_verify_but_can_continue: {
    message:
      "We weren’t able to fully verify this website, but you can still continue. Our team may follow up.",
    colorClass: 'text-[#64748b]',
  },
  likely_not_fit: {
    message:
      "This website doesn’t appear to match a restaurant or foodservice operation. If this is incorrect, you can still submit and our team will review it.",
    colorClass: 'text-[#64748b]',
  },
  national_chain: {
    message:
      "Our program is designed for independent operators and doesn’t cover national chains. If you operate an independent concept, please use that website instead.",
    colorClass: 'text-[#64748b]',
  },
  invalid_website: {
    message: "We couldn’t reach that website. Please check the URL and try again.",
    colorClass: 'text-red-600',
  },
  non_us: {
    message:
      'Our Food Cost Analyzer is currently available for U.S. restaurants only. Our team may be in touch if this changes.',
    colorClass: 'text-[#64748b]',
  },
  error: {
    message:
      'Something went wrong on our end. You can continue and we’ll verify manually.',
    colorClass: 'text-[#64748b]',
  },
};

export function WebsiteValidationStatus({ state, allowSubmit }: WebsiteValidationStatusProps) {
  const config = STATE_CONFIG[state];

  if (state === 'idle' || !config.message) return null;

  const icon =
    state === 'checking' ? (
      <span className="w-3.5 h-3.5 rounded-full border-2 border-[#64748b]/40 fsiq-spinner shrink-0 mt-[3px]" aria-label="Checking" />
    ) : state === 'verified' ? (
      <span className="w-4 h-4 grid place-items-center rounded-full bg-[#52C275] text-white shrink-0 mt-[2px]" aria-hidden="true">
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M2.5 6.2l2.4 2.3L9.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    ) : state === 'invalid_website' ? (
      <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0 mt-[5px]" aria-hidden="true" />
    ) : (
      <span className="w-1.5 h-1.5 rounded-full bg-[#94a3b8] shrink-0 mt-[5px]" aria-hidden="true" />
    );

  return (
    <div
      role="status"
      aria-live="polite"
      data-validation-state={state}
      data-allow-submit={allowSubmit}
      className={`mt-2 flex items-start gap-2 text-[12px] leading-snug ${config.colorClass}`}
    >
      {icon}
      <span>{config.message}</span>
    </div>
  );
}
