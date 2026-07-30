'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { validateWebsite } from '@/actions/validateWebsite';
import { submitAnalysis } from '@/actions/submitAnalysis';
import { decisionToUIState, isSubmitBlocked } from '@/components/analyzer/WebsiteValidationStatus';
import type { ValidationUIState } from '@/components/analyzer/WebsiteValidationStatus';
import type { ValidationResult } from '@/lib/website/types';
import { SuccessState } from '@/components/analyzer/SuccessState';
import {
  type AnalyzerFormPayload,
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
import { StepOneSection } from '@/components/analyzer/form/steps/StepOneSection';
import { StepTwoSection } from '@/components/analyzer/form/steps/StepTwoSection';
import { StepThreeSection } from '@/components/analyzer/form/steps/StepThreeSection';
import { StepFourSection } from '@/components/analyzer/form/steps/StepFourSection';
import { FormNavigation } from '@/components/analyzer/form/navigation/FormNavigation';
import { FormProgressHeader } from '@/components/analyzer/form/shared/FormProgressHeader';

export type FormData = Partial<AnalyzerFormPayload>;

const TOTAL_STEPS = 4;

const STEP_TITLES: Record<number, string> = {
  1: 'Tell us about your restaurant.',
  2: 'Tell us how you operate.',
  3: 'Tell us how you buy food.',
  4: 'Where do we send your report?',
};

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

  useEffect(() => {
    persistTrackingParams();
    const stored = getTrackingParams();
    const cookies = readMetaCookies(stored.fbclid);

    const tracking: Partial<FormData> = {
      utm_source: stored.utm_source,
      utm_medium: stored.utm_medium,
      utm_campaign: stored.utm_campaign,
      utm_content: stored.utm_content,
      utm_term: stored.utm_term,
      utm_id: stored.utm_id,
      fbclid: stored.fbclid,
      gclid: stored.gclid,
      fbadid: stored.fbadid,
      creative_name: stored.creative_name,
      creative_id: stored.creative_id,
      campaign: stored.campaign,
      referrer: stored.referrer,
      landing_page_url: stored.landing_page_url,
      fbp: cookies.fbp,
      fbc: cookies.fbc,
    };

    const clean = Object.fromEntries(
      Object.entries(tracking).filter(([, v]) => v !== undefined),
    ) as Partial<FormData>;

    setFormData((prev) => ({ ...prev, ...clean }));
  }, []);

  function update(field: keyof AnalyzerFormPayload, value: string) {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
    if (!analyzerStartedFired.current) {
      analyzerStartedFired.current = true;
      fireAnalyzerStarted();
    }
  }

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
        const uiState = decisionToUIState(result.finalDecision, result.internalFlags);
        setValidationState(uiState);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errors = getStep4Errors(formData);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const eventId = generateEventId();
    fireBrowserLead(eventId);

    try {
      const payload: AnalyzerFormPayload = {
        ...(formData as AnalyzerFormPayload),
        event_id: eventId,
        client_user_agent: navigator.userAgent,
      };
      const result = await submitAnalysis(payload);
      if (result.success) setIsSubmitted(true);
      else setSubmitError(result.error ?? 'Something went wrong. Please try again.');
    } catch {
      setSubmitError('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const canAdvance =
    step === 1 ? canAdvanceFromStep1(formData, validationState) :
    step === 2 ? canAdvanceFromStep2(formData) :
    step === 3 ? canAdvanceFromStep3(formData) :
    false;

  const blocked = isSubmitBlocked(validationState);

  if (isSubmitted) return <SuccessState />;

  return (
    <>
      <FormProgressHeader step={step} totalSteps={TOTAL_STEPS} title={STEP_TITLES[step]} />

      <form onSubmit={handleSubmit} noValidate>
        {step === 1 && (
          <StepOneSection
            formData={formData}
            fieldErrors={fieldErrors}
            validationState={validationState}
            isValidating={isValidating}
            blocked={blocked}
            onUpdate={update}
            onWebsiteBlur={handleWebsiteBlur}
            onStateChange={handleStateChange}
          />
        )}

        {step === 2 && <StepTwoSection formData={formData} onUpdate={update} />}
        {step === 3 && <StepThreeSection formData={formData} onUpdate={update} />}
        {step === 4 && (
          <StepFourSection
            formData={formData}
            fieldErrors={fieldErrors}
            submitError={submitError}
            onUpdate={update}
          />
        )}

        <FormNavigation
          step={step}
          totalSteps={TOTAL_STEPS}
          canAdvance={canAdvance}
          isSubmitting={isSubmitting}
          canSubmit={canSubmitStep4(formData)}
          onNext={handleNext}
          onBack={handleBack}
        />
      </form>
    </>
  );
}
