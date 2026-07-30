interface FormNavigationProps {
  step: number;
  totalSteps: number;
  canAdvance: boolean;
  isSubmitting: boolean;
  canSubmit: boolean;
  onNext: () => void;
  onBack: () => void;
}

export function FormNavigation({
  step,
  totalSteps,
  canAdvance,
  isSubmitting,
  canSubmit,
  onNext,
  onBack,
}: FormNavigationProps) {
  return (
    <div className="mt-8">
      {step < totalSteps ? (
        <button type="button" onClick={onNext} disabled={!canAdvance} className="cta-pill">
          Continue
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      ) : (
        <button type="submit" disabled={isSubmitting || !canSubmit} className="cta-pill">
          {isSubmitting && <span className="w-4 h-4 rounded-full border-2 border-white/40 fsiq-spinner" aria-hidden="true" />}
          {isSubmitting ? 'Submitting…' : 'Get my savings report'}
          {!isSubmitting && (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      )}

      <div className="mt-4 flex items-center justify-between">
        {step > 1 ? (
          <button type="button" onClick={onBack} disabled={isSubmitting} className="btn-ghost">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M10 3l-5 5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Back
          </button>
        ) : (
          <span />
        )}
        <span className="text-[11px] text-[#94a3b8] flex items-center gap-1.5">
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M4 7V5a4 4 0 118 0v2m-9 0h10v7H3V7z" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Encrypted
        </span>
      </div>
    </div>
  );
}
