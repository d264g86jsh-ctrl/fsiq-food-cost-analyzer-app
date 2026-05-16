// Phase 2 skeleton — functional state logic only.
// Full visual styling and integration into AnalyzerForm belongs in Phase 4.

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
  | 'error';

export interface WebsiteValidationStatusProps {
  state: ValidationUIState;
  // Whether the submit button should be enabled based on validation state
  allowSubmit: boolean;
}

export function decisionToUIState(decision: FinalDecision | null, hasError?: boolean): ValidationUIState {
  if (hasError) return 'error';
  if (!decision) return 'idle';

  switch (decision) {
    case 'verified_restaurant':
      return 'verified';
    case 'plausible_unverified':
      return 'unable_to_verify_but_can_continue';
    case 'clear_non_fit':
      return 'likely_not_fit';
    case 'national_chain':
      return 'national_chain';
    case 'invalid_website':
      return 'invalid_website';
    default:
      return 'idle';
  }
}

export function isSubmitBlocked(state: ValidationUIState): boolean {
  // Only national_chain and invalid_website block submission.
  // clear_non_fit (likely_not_fit) allows submit with manual review flag.
  return state === 'national_chain' || state === 'invalid_website';
}

const STATE_MESSAGES: Record<ValidationUIState, string | null> = {
  idle: null,
  checking: 'Checking your website…',
  verified: '✓ Restaurant website confirmed',
  unable_to_verify_but_can_continue:
    "We weren’t able to fully verify this website, but you can still continue. Our team may follow up.",
  likely_not_fit:
    "This website doesn’t appear to match a restaurant or foodservice operation. If this is incorrect, you can still submit and our team will review it.",
  national_chain:
    "Our program is designed for independent operators and doesn’t cover national chains. If you operate an independent concept, please use that website instead.",
  invalid_website: "We couldn’t reach that website. Please check the URL and try again.",
  error: 'Something went wrong on our end. You can continue and we’ll verify manually.',
};

export function WebsiteValidationStatus({ state, allowSubmit }: WebsiteValidationStatusProps) {
  const message = STATE_MESSAGES[state];

  if (state === 'idle' || !message) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-validation-state={state}
      data-allow-submit={allowSubmit}
      style={{ marginTop: '0.5rem', fontSize: '0.875rem' }}
    >
      {state === 'checking' && <span aria-label="Checking">{message}</span>}
      {state !== 'checking' && <span>{message}</span>}
    </div>
  );
}
