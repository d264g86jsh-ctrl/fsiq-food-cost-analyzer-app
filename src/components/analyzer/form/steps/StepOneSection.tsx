import type { FormData } from '@/components/analyzer/AnalyzerForm';
import type { AnalyzerFormPayload } from '@/lib/analyzer/form-types';
import { STATE_OPTIONS } from '@/lib/analyzer/form-types';
import { WebsiteValidationStatus } from '@/components/analyzer/WebsiteValidationStatus';
import type { ValidationUIState } from '@/components/analyzer/WebsiteValidationStatus';
import { FormField } from '@/components/analyzer/form/shared/FormField';
import { inputCls, selectCls } from '@/components/analyzer/form/shared/fieldStyles';

interface StepOneSectionProps {
  formData: FormData;
  fieldErrors: Record<string, string>;
  validationState: ValidationUIState;
  isValidating: boolean;
  blocked: boolean;
  onUpdate: (field: keyof AnalyzerFormPayload, value: string) => void;
  onWebsiteBlur: () => void;
  onStateChange: (selectedState: string) => void;
}

export function StepOneSection({ formData, fieldErrors, validationState, isValidating, blocked, onUpdate, onWebsiteBlur, onStateChange }: StepOneSectionProps) {
  return (
    <div className="mt-6 space-y-6 fsiq-step-in">
      <FormField label="Restaurant name" error={fieldErrors.restaurant_name} required>
        <input
          type="text"
          value={formData.restaurant_name ?? ''}
          onChange={(e) => onUpdate('restaurant_name', e.target.value)}
          placeholder="e.g. Casa Roberto"
          autoComplete="organization"
          className={inputCls(!!fieldErrors.restaurant_name)}
        />
      </FormField>

      <FormField label="Website" error={fieldErrors.website} required>
        <input
          type="text"
          value={formData.website ?? ''}
          onChange={(e) => onUpdate('website', e.target.value)}
          onBlur={onWebsiteBlur}
          placeholder="e.g. casaroberto.com"
          autoComplete="url"
          className={inputCls(!!fieldErrors.website || validationState === 'invalid_website')}
        />
        <WebsiteValidationStatus state={isValidating ? 'checking' : validationState} allowSubmit={!blocked} />
      </FormField>

      <FormField label="State" error={fieldErrors.state} required>
        <select
          value={formData.state ?? ''}
          onChange={(e) => {
            onUpdate('state', e.target.value);
            onStateChange(e.target.value);
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
  );
}
