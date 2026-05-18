'use client';

// Phase 4 — 4-step Analyzer Quiz.
// Source of truth: docs/analyzer-ux-flow.md, docs/brand-guidelines.md
// Phase 8 replaces the submitAnalysis stub with full pipeline orchestration.
// v2 visual redesign: page chrome removed (lives in AnalyzerPageV2), classNames updated.

import { useState, useEffect, useCallback, useRef } from 'react';
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
  STATE_OPTIONS,
  CONCEPT_TYPE_OPTIONS,
  LOCATIONS_OPTIONS,
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
import { persistTrackingParams, getTrackingParams, readMetaCookies } from '@/lib/meta/tracking-params';
import { generateEventId } from '@/lib/meta/event-id';
import { fireAnalyzerStarted, fireBrowserLead } from '@/lib/meta/browser-events';

// ── Types ─────────────────────────────────────────────────────────────────────

type FormData = Partial<AnalyzerFormPayload>;

const TOTAL_STEPS = 4;

const STEP_TITLES: Record<number, string> = {
  1: 'Tell us about your restaurant.',
  2: 'A bit about your setup.',
  3: 'Where your dollars go.',
  4: 'Where do we send your report?',
};

// ── Radio card group ──────────────────────────────────────────────────────────

function RadioCardGroup({
  name,
  options,
  value,
  onChange,
}: {
  name: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="radio-card-grid">
      {options.map((opt) => (
        <label key={opt.value} className="radio-card">
          <input
            type="radio"
            name={name}
            value={opt.value}
            checked={value === opt.value}
            onChange={() => onChange(opt.value)}
          />
          <span className="radio-card-inner">
            <span className="radio-card-dot" aria-hidden="true" />
            {opt.label}
          </span>
        </label>
      ))}
    </div>
  );
}

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
  const analyzerStartedFired = useRef(false);

  // Persist tracking params on mount (first-touch sessionStorage), then read them back.
  useEffect(() => {
    persistTrackingParams();
    const stored = getTrackingParams();
    const cookies = readMetaCookies(stored.fbclid);

    const tracking: Partial<FormData> = {
      utm_source:    stored.utm_source,
      utm_medium:    stored.utm_medium,
      utm_campaign:  stored.utm_campaign,
      utm_content:   stored.utm_content,
      utm_term:      stored.utm_term,
      utm_id:        stored.utm_id,
      fbclid:        stored.fbclid,
      gclid:         stored.gclid,
      fbadid:        stored.fbadid,
      creative_name: stored.creative_name,
      creative_id:   stored.creative_id,
      campaign:      stored.campaign,
      referrer:      stored.referrer,
      landing_page_url: stored.landing_page_url,
      fbp:           cookies.fbp,
      fbc:           cookies.fbc,
    };

    // Remove undefined keys to keep formData clean
    const clean = Object.fromEntries(
      Object.entries(tracking).filter(([, v]) => v !== undefined),
    ) as Partial<FormData>;

    setFormData((prev) => ({ ...prev, ...clean }));
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
    // Fire AnalyzerStarted once on first field interaction
    if (!analyzerStartedFired.current) {
      analyzerStartedFired.current = true;
      fireAnalyzerStarted();
    }
  }

  // ── Website validation ────────────────────────────────────────────────────────

  const triggerValidation = useCallback(
    async (websiteOverride?: string, stateOverride?: string) => {
      const website = websiteOverride ?? formData.website ?? '';
      const stateValue = stateOverride ?? formData.state ?? '';

      if (!website.trim()) return;

      setIsValidating(true);
      setValidationState('checking');

      try {
        const action = await validateWebsite({
          website,
          restaurantName: formData.restaurant_name ?? '',
          state: stateValue,
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
    [formData.website, formData.state, formData.restaurant_name, fieldErrors.website],
  );

  function handleWebsiteBlur() {
    const website = formData.website?.trim();
    if (website) triggerValidation(website);
  }

  function handleStateChange(selectedState: string) {
    const website = formData.website?.trim();
    if (website && selectedState) triggerValidation(website, selectedState);
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

    // Generate event_id here so browser and server share the same value for Meta deduplication.
    const eventId = generateEventId();
    fireBrowserLead(eventId);

    try {
      const payload: AnalyzerFormPayload = {
        ...(formData as AnalyzerFormPayload),
        event_id:          eventId,
        client_user_agent: navigator.userAgent,
      };
      const result = await submitAnalysis(payload);
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
    <>
      {/* Segmented progress bar */}
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5 flex-1">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div key={i} className="flex-1 h-[3px] rounded-full bg-[#143225]/[0.12] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#143225] transition-all duration-500"
                style={{ width: i < step - 1 ? '100%' : i === step - 1 ? '60%' : '0%' }}
              />
            </div>
          ))}
        </div>
        <span className="text-[11px] font-medium text-[#64748b] tabular-nums tracking-tight whitespace-nowrap">
          {step} / {TOTAL_STEPS}
        </span>
      </div>

      {/* Step heading */}
      <h2
        key={`heading-${step}`}
        className="mt-6 text-[22px] sm:text-[26px] font-bold tracking-[-0.015em] text-[#143225] fsiq-step-in"
      >
        {STEP_TITLES[step]}
      </h2>

      <form onSubmit={handleSubmit} noValidate>
        {/* ── Step 1 — Restaurant basics ──────────────────────────────────── */}
        {step === 1 && (
          <div key="step-1" className="mt-6 space-y-6 fsiq-step-in">
            <FormField label="Restaurant name" error={fieldErrors.restaurant_name} required>
              <input
                type="text"
                value={formData.restaurant_name ?? ''}
                onChange={(e) => update('restaurant_name', e.target.value)}
                placeholder="e.g. Casa Roberto"
                autoComplete="organization"
                className={inputCls(!!fieldErrors.restaurant_name)}
              />
            </FormField>

            <FormField label="Website" error={fieldErrors.website} required>
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

            <FormField label="State" error={fieldErrors.state} required>
              <select
                value={formData.state ?? ''}
                onChange={(e) => {
                  update('state', e.target.value);
                  handleStateChange(e.target.value);
                }}
                className={selectCls(!!fieldErrors.state)}
              >
                <option value="">Select your state</option>
                {STATE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </FormField>
          </div>
        )}

        {/* ── Step 2 — Restaurant profile ─────────────────────────────────── */}
        {step === 2 && (
          <div key="step-2" className="mt-6 space-y-6 fsiq-step-in">
            <FormField label="Concept type" required>
              <select
                value={formData.concept_type ?? ''}
                onChange={(e) => update('concept_type', e.target.value)}
                className={selectCls(false)}
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
                className={selectCls(false)}
              >
                <option value="">Select number of locations</option>
                {LOCATIONS_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </FormField>

            <FormField label="Estimated annual food spend" required>
              <input
                type="text"
                placeholder="e.g. $1.5M, $800K, or $800,000"
                className="field-underline"
                value={formData.annual_food_spend ?? ''}
                onChange={(e) => update('annual_food_spend', e.target.value)}
              />
              <p className="text-[11px] text-[#64748b] mt-1">Enter your total annual food &amp; beverage spend</p>
            </FormField>
          </div>
        )}

        {/* ── Step 3 — Purchasing profile ──────────────────────────────────── */}
        {step === 3 && (
          <div key="step-3" className="mt-6 space-y-6 fsiq-step-in">
            <FormField label="Primary distributor type" required>
              <RadioCardGroup
                name="distributor_type"
                options={DISTRIBUTOR_TYPE_OPTIONS}
                value={formData.distributor_type ?? ''}
                onChange={(v) => update('distributor_type', v)}
              />
            </FormField>

            <FormField label="Procurement strategy" required>
              <RadioCardGroup
                name="procurement_strategy"
                options={PROCUREMENT_STRATEGY_OPTIONS}
                value={formData.procurement_strategy ?? ''}
                onChange={(v) => update('procurement_strategy', v)}
              />
            </FormField>

            <FormField label="Top SKUs / spend categories" required>
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

        {/* ── Step 4 — Contact info ────────────────────────────────────────── */}
        {step === 4 && (
          <div key="step-4" className="mt-6 space-y-6 fsiq-step-in">
            <FormField label="Full name" error={fieldErrors.full_name} required>
              <input
                type="text"
                value={formData.full_name ?? ''}
                onChange={(e) => update('full_name', e.target.value)}
                placeholder="e.g. Jamie Rivera"
                autoComplete="name"
                className={inputCls(!!fieldErrors.full_name)}
              />
            </FormField>

            <FormField label="Work email" error={fieldErrors.email} required>
              <input
                type="email"
                value={formData.email ?? ''}
                onChange={(e) => update('email', e.target.value)}
                placeholder="jamie@yourrestaurant.com"
                autoComplete="email"
                className={inputCls(!!fieldErrors.email)}
              />
            </FormField>

            <FormField label="Phone number" hint="Optional">
              <input
                type="tel"
                value={formData.phone ?? ''}
                onChange={(e) => update('phone', e.target.value)}
                placeholder="(555) 123-4567"
                autoComplete="tel"
                className={inputCls(false)}
              />
            </FormField>

            {submitError && (
              <p className="text-[12px] text-red-600" role="alert">{submitError}</p>
            )}
          </div>
        )}

        {/* ── Navigation ────────────────────────────────────────────────────── */}
        <div className="mt-8">
          {/* Primary CTA */}
          {step < TOTAL_STEPS ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={!canAdvance}
              className="cta-pill"
            >
              Continue
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <button
              type="submit"
              disabled={isSubmitting || !canSubmitStep4(formData)}
              className="cta-pill"
            >
              {isSubmitting && (
                <span className="w-4 h-4 rounded-full border-2 border-white/40 fsiq-spinner" aria-hidden="true" />
              )}
              {isSubmitting ? 'Submitting…' : 'Get my savings report'}
              {!isSubmitting && (
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          )}

          {/* Back + encryption notice */}
          <div className="mt-4 flex items-center justify-between">
            {step > 1 ? (
              <button
                type="button"
                onClick={handleBack}
                disabled={isSubmitting}
                className="btn-ghost"
              >
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
              Encrypted · never sold
            </span>
          </div>
        </div>
      </form>
    </>
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
      <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748b] mb-2">
        {label}
        {required && (
          <span className="text-[#52C275] ml-0.5" aria-hidden="true">*</span>
        )}
        {hint && (
          <span className="ml-2 normal-case tracking-normal text-[10px] text-[#94a3b8]">{hint}</span>
        )}
      </label>
      {children}
      {error && (
        <p className="mt-2 text-[12px] text-red-600" role="alert">{error}</p>
      )}
    </div>
  );
}

// ── Style utilities ───────────────────────────────────────────────────────────

function inputCls(hasError: boolean): string {
  return `field-underline${hasError ? ' field-error' : ''}`;
}

function selectCls(hasError: boolean): string {
  return `field-underline select-underline-caret${hasError ? ' field-error' : ''}`;
}

const textareaCls =
  'w-full bg-white/70 border border-[#e2e8f0] rounded-2xl px-4 py-3 text-[15px] text-[#143225] placeholder-[#94a3b8] resize-none focus:outline-none focus:border-[#143225] focus:shadow-[0_0_0_4px_rgba(82,194,117,0.18)] transition-all';
