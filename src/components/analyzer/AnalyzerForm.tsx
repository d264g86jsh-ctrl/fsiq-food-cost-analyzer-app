'use client';

// Phase 4 — 4-step Analyzer Quiz.
// Source of truth: docs/analyzer-ux-flow.md, docs/brand-guidelines.md
// Phase 8 replaces the submitAnalysis stub with full pipeline orchestration.

import { useState, useEffect, useCallback } from 'react';
import { validateWebsite } from '@/actions/validateWebsite';
import { submitAnalysis } from '@/actions/submitAnalysis';
import {
  WebsiteValidationStatus,
  decisionToUIState,
  isSubmitBlocked,
} from '@/components/analyzer/WebsiteValidationStatus';
import type { ValidationUIState } from '@/components/analyzer/WebsiteValidationStatus';
import type { ValidationResult } from '@/lib/website/types';
import { SuccessState } from '@/components/analyzer/SuccessState';
import {
  type AnalyzerFormPayload,
  CONCEPT_TYPE_OPTIONS,
  LOCATIONS_OPTIONS,
  ANNUAL_FOOD_SPEND_OPTIONS,
  DISTRIBUTOR_TYPE_OPTIONS,
  PROCUREMENT_STRATEGY_OPTIONS,
} from '@/lib/analyzer/form-types';
import {
  canAdvanceFromStep1,
  canAdvanceFromStep2,
  canAdvanceFromStep3,
  canSubmitStep4,
  getStep1Errors,
  getStep4Errors,
} from '@/lib/analyzer/form-validation';

// ── Types ─────────────────────────────────────────────────────────────────────

type FormData = Partial<AnalyzerFormPayload>;

const TOTAL_STEPS = 4;

const STEP_TITLES: Record<number, string> = {
  1: 'Tell us about your restaurant',
  2: 'Your restaurant profile',
  3: 'Your purchasing profile',
  4: 'Where should we send your analysis?',
};

// ── Component ─────────────────────────────────────────────────────────────────

export function AnalyzerForm() {
  const [step, setStep] = useState(1);
  const [formData, setFormData] = useState<FormData>({});
  const [validationState, setValidationState] = useState<ValidationUIState>('idle');
  const [, setValidationResult] = useState<ValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Capture hidden tracking params once on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tracking: Partial<FormData> = {};

    const utmKeys = [
      'utm_source',
      'utm_medium',
      'utm_campaign',
      'utm_content',
      'utm_term',
      'fbclid',
      'gclid',
    ] as const;

    for (const key of utmKeys) {
      const val = params.get(key);
      if (val) (tracking as Record<string, string>)[key] = val;
    }

    tracking.referrer = document.referrer || undefined;
    tracking.landing_page_url = window.location.href;

    // Capture fbp/fbc from cookies if available
    const cookieMap = Object.fromEntries(
      document.cookie.split(';').map((c) => {
        const [k, ...v] = c.trim().split('=');
        return [k.trim(), v.join('=')];
      }),
    );
    if (cookieMap['_fbp']) tracking.fbp = cookieMap['_fbp'];
    if (cookieMap['_fbc']) tracking.fbc = cookieMap['_fbc'];

    setFormData((prev) => ({ ...prev, ...tracking }));
  }, []);

  // ── Field update ─────────────────────────────────────────────────────────────

  function update(field: keyof AnalyzerFormPayload, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Clear field-level error on change
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  }

  // ── Website validation ────────────────────────────────────────────────────────

  const triggerValidation = useCallback(
    async (websiteOverride?: string, zipOverride?: string) => {
      const website = websiteOverride ?? formData.website ?? '';
      const zip = zipOverride ?? formData.zip_code ?? '';

      if (!website.trim()) return;

      setIsValidating(true);
      setValidationState('checking');

      try {
        const action = await validateWebsite({
          website,
          restaurantName: formData.restaurant_name ?? '',
          zipCode: zip,
        });

        if (!action.success || !action.result) {
          setValidationState('error');
          setValidationResult(null);
          return;
        }

        const result = action.result;
        setValidationResult(result);
        const uiState = decisionToUIState(
          result.finalDecision,
          result.internalFlags,
        );
        setValidationState(uiState);

        // Clear invalid_website field error if the new result resolves it
        if (uiState !== 'invalid_website' && fieldErrors.website) {
          setFieldErrors((prev) => {
            const next = { ...prev };
            delete next.website;
            return next;
          });
        }
      } catch {
        setValidationState('error');
        setValidationResult(null);
      } finally {
        setIsValidating(false);
      }
    },
    [formData.website, formData.zip_code, formData.restaurant_name, fieldErrors.website],
  );

  function handleWebsiteBlur() {
    const website = formData.website?.trim();
    if (website) triggerValidation(website);
  }

  function handleZipBlur() {
    const website = formData.website?.trim();
    const zip = formData.zip_code?.trim();
    if (website && zip) triggerValidation(website, zip);
  }

  // ── Step navigation ───────────────────────────────────────────────────────────

  function handleNext() {
    if (step === 1) {
      const errors = getStep1Errors(formData, validationState);
      if (Object.keys(errors).length > 0) {
        setFieldErrors(errors);
        return;
      }
    }
    setFieldErrors({});
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  }

  function handleBack() {
    setFieldErrors({});
    setSubmitError(null);
    setStep((s) => Math.max(s - 1, 1));
  }

  // ── Final submission ──────────────────────────────────────────────────────────

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors = getStep4Errors(formData);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const result = await submitAnalysis(formData as AnalyzerFormPayload);
      if (result.success) {
        setIsSubmitted(true);
      } else {
        setSubmitError('Something went wrong. Please try again.');
      }
    } catch {
      setSubmitError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  // ── Derived state ─────────────────────────────────────────────────────────────

  const canAdvance =
    step === 1 ? canAdvanceFromStep1(formData, validationState) :
    step === 2 ? canAdvanceFromStep2(formData) :
    step === 3 ? canAdvanceFromStep3(formData) :
    false;

  const blocked = isSubmitBlocked(validationState);

  if (isSubmitted) return <SuccessState />;

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-[#f8fafc] flex flex-col">
      {/* Header */}
      <header className="bg-[#143225] px-4 py-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/brand/fsiq-logo-white-transparent.png"
          alt="FoodServiceIQ"
          className="h-8"
        />
      </header>

      <main className="flex-1 px-4 py-8 w-full max-w-xl mx-auto">
        {/* Progress indicator */}
        <div className="mb-7">
          <p className="text-sm text-[#64748b] mb-2">Step {step} of {TOTAL_STEPS}</p>
          <div className="flex gap-1.5">
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <div
                key={i}
                className={`h-1 flex-1 rounded-full transition-colors ${
                  i + 1 <= step ? 'bg-[#52C275]' : 'bg-[#e2e8f0]'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Step heading */}
        <h2 className="text-xl font-semibold text-[#143225] mb-6">
          {STEP_TITLES[step]}
        </h2>

        <form onSubmit={handleSubmit} noValidate>
          {/* ── Step 1 — Restaurant basics ─────────────────────────────────────── */}
          {step === 1 && (
            <div className="space-y-5">
              <FormField
                label="Restaurant name"
                error={fieldErrors.restaurant_name}
                required
              >
                <input
                  type="text"
                  value={formData.restaurant_name ?? ''}
                  onChange={(e) => update('restaurant_name', e.target.value)}
                  placeholder="e.g. Casa Roberto"
                  autoComplete="organization"
                  className={inputCls(!!fieldErrors.restaurant_name)}
                />
              </FormField>

              <FormField
                label="Website"
                error={fieldErrors.website}
                required
              >
                <input
                  type="text"
                  value={formData.website ?? ''}
                  onChange={(e) => update('website', e.target.value)}
                  onBlur={handleWebsiteBlur}
                  placeholder="e.g. casaroberto.com"
                  autoComplete="url"
                  className={inputCls(
                    !!fieldErrors.website || validationState === 'invalid_website',
                  )}
                />
                <WebsiteValidationStatus
                  state={isValidating ? 'checking' : validationState}
                  allowSubmit={!blocked}
                />
              </FormField>

              <FormField
                label="ZIP code"
                error={fieldErrors.zip_code}
                hint="U.S. only"
                required
              >
                <input
                  type="text"
                  value={formData.zip_code ?? ''}
                  onChange={(e) => update('zip_code', e.target.value)}
                  onBlur={handleZipBlur}
                  placeholder="e.g. 78701"
                  maxLength={10}
                  autoComplete="postal-code"
                  className={inputCls(!!fieldErrors.zip_code)}
                />
              </FormField>
            </div>
          )}

          {/* ── Step 2 — Restaurant profile ───────────────────────────────────── */}
          {step === 2 && (
            <div className="space-y-5">
              <FormField label="Concept type" required>
                <select
                  value={formData.concept_type ?? ''}
                  onChange={(e) => update('concept_type', e.target.value)}
                  className={selectCls}
                >
                  <option value="">Select concept type</option>
                  {CONCEPT_TYPE_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Number of locations" required>
                <select
                  value={formData.locations ?? ''}
                  onChange={(e) => update('locations', e.target.value)}
                  className={selectCls}
                >
                  <option value="">Select number of locations</option>
                  {LOCATIONS_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Estimated annual food spend" required>
                <select
                  value={formData.annual_food_spend ?? ''}
                  onChange={(e) => update('annual_food_spend', e.target.value)}
                  className={selectCls}
                >
                  <option value="">Select annual food spend</option>
                  {ANNUAL_FOOD_SPEND_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </FormField>
            </div>
          )}

          {/* ── Step 3 — Purchasing profile ───────────────────────────────────── */}
          {step === 3 && (
            <div className="space-y-5">
              <FormField label="Primary distributor type" required>
                <select
                  value={formData.distributor_type ?? ''}
                  onChange={(e) => update('distributor_type', e.target.value)}
                  className={selectCls}
                >
                  <option value="">Select distributor type</option>
                  {DISTRIBUTOR_TYPE_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </FormField>

              <FormField label="Procurement strategy" required>
                <select
                  value={formData.procurement_strategy ?? ''}
                  onChange={(e) => update('procurement_strategy', e.target.value)}
                  className={selectCls}
                >
                  <option value="">Select procurement strategy</option>
                  {PROCUREMENT_STRATEGY_OPTIONS.map((o) => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </FormField>

              <FormField
                label="What are your biggest food spend categories or key items?"
                required
              >
                <textarea
                  value={formData.top_skus ?? ''}
                  onChange={(e) => update('top_skus', e.target.value)}
                  placeholder="Chicken, beef, seafood, dairy, produce, fryer oil…"
                  rows={3}
                  className={textareaCls}
                />
              </FormField>
            </div>
          )}

          {/* ── Step 4 — Contact info ─────────────────────────────────────────── */}
          {step === 4 && (
            <div className="space-y-5">
              <p className="text-[#475569] text-sm -mt-2">
                Your personalized food cost report will be delivered to your inbox.
              </p>

              <FormField
                label="Full name"
                error={fieldErrors.full_name}
                required
              >
                <input
                  type="text"
                  value={formData.full_name ?? ''}
                  onChange={(e) => update('full_name', e.target.value)}
                  placeholder="e.g. Maria Garcia"
                  autoComplete="name"
                  className={inputCls(!!fieldErrors.full_name)}
                />
              </FormField>

              <FormField
                label="Email address"
                error={fieldErrors.email}
                required
              >
                <input
                  type="email"
                  value={formData.email ?? ''}
                  onChange={(e) => update('email', e.target.value)}
                  placeholder="you@yourrestaurant.com"
                  autoComplete="email"
                  className={inputCls(!!fieldErrors.email)}
                />
              </FormField>

              <FormField label="Phone number" hint="Optional">
                <input
                  type="tel"
                  value={formData.phone ?? ''}
                  onChange={(e) => update('phone', e.target.value)}
                  placeholder="e.g. 512-555-0100"
                  autoComplete="tel"
                  className={inputCls(false)}
                />
              </FormField>

              {submitError && (
                <p className="text-red-600 text-sm">{submitError}</p>
              )}
            </div>
          )}

          {/* ── Navigation ────────────────────────────────────────────────────── */}
          <div className={`mt-8 flex ${step > 1 ? 'justify-between' : 'justify-end'}`}>
            {step > 1 && (
              <button
                type="button"
                onClick={handleBack}
                disabled={isSubmitting}
                className={secondaryBtnCls}
              >
                Back
              </button>
            )}

            {step < TOTAL_STEPS ? (
              <button
                type="button"
                onClick={handleNext}
                disabled={!canAdvance}
                className={primaryBtnCls(!canAdvance)}
              >
                Continue
              </button>
            ) : (
              <button
                type="submit"
                disabled={isSubmitting || !canSubmitStep4(formData)}
                className={primaryBtnCls(isSubmitting || !canSubmitStep4(formData))}
              >
                {isSubmitting ? 'Submitting…' : 'Get My Analysis'}
              </button>
            )}
          </div>
        </form>
      </main>

      <footer className="px-4 py-6 text-center">
        <p className="text-xs text-[#94a3b8]">FoodServiceIQ — Confidential</p>
      </footer>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

interface FormFieldProps {
  label: string;
  children: React.ReactNode;
  error?: string;
  hint?: string;
  required?: boolean;
}

function FormField({ label, children, error, hint, required }: FormFieldProps) {
  return (
    <div>
      <label className="block text-sm font-medium text-[#143225] mb-1.5">
        {label}
        {required && (
          <span className="text-[#52C275] ml-0.5" aria-hidden="true">*</span>
        )}
        {hint && (
          <span className="ml-2 text-[#94a3b8] font-normal text-xs">({hint})</span>
        )}
      </label>
      {children}
      {error && (
        <p className="mt-1 text-sm text-red-600" role="alert">{error}</p>
      )}
    </div>
  );
}

// ── Style utilities ───────────────────────────────────────────────────────────

const baseInput =
  'w-full px-3 py-2.5 border rounded-lg text-sm bg-white text-[#143225] placeholder-[#94a3b8] focus:outline-none focus:ring-2 transition-colors';

function inputCls(hasError: boolean): string {
  return `${baseInput} ${
    hasError
      ? 'border-red-400 focus:ring-red-200'
      : 'border-[#e2e8f0] focus:ring-[#52C275]/30 focus:border-[#52C275]'
  }`;
}

const selectCls =
  `${baseInput} border-[#e2e8f0] focus:ring-[#52C275]/30 focus:border-[#52C275] cursor-pointer`;

const textareaCls =
  `${baseInput} border-[#e2e8f0] focus:ring-[#52C275]/30 focus:border-[#52C275] resize-none`;

function primaryBtnCls(disabled: boolean): string {
  return `px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors min-h-[44px] ${
    disabled
      ? 'bg-[#e2e8f0] text-[#94a3b8] cursor-not-allowed'
      : 'bg-[#143225] text-white hover:bg-[#1a4632] active:bg-[#0e2418]'
  }`;
}

const secondaryBtnCls =
  'px-6 py-2.5 rounded-lg text-sm font-medium text-[#475569] border border-[#e2e8f0] hover:bg-white transition-colors min-h-[44px]';

