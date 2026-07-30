import type { FormData } from '@/components/analyzer/AnalyzerForm';
import type { AnalyzerFormPayload } from '@/lib/analyzer/form-types';
import { FormField } from '@/components/analyzer/form/shared/FormField';
import { inputCls } from '@/components/analyzer/form/shared/fieldStyles';

interface StepFourSectionProps {
  formData: FormData;
  fieldErrors: Record<string, string>;
  submitError: string | null;
  onUpdate: (field: keyof AnalyzerFormPayload, value: string) => void;
}

export function StepFourSection({ formData, fieldErrors, submitError, onUpdate }: StepFourSectionProps) {
  return (
    <div className="mt-6 space-y-6 fsiq-step-in">
      <FormField label="Full name" error={fieldErrors.full_name} required>
        <input type="text" value={formData.full_name ?? ''} onChange={(e) => onUpdate('full_name', e.target.value)} placeholder="e.g. Jamie Rivera" autoComplete="name" className={inputCls(!!fieldErrors.full_name)} />
      </FormField>

      <FormField label="Work email" error={fieldErrors.email} required>
        <input type="email" value={formData.email ?? ''} onChange={(e) => onUpdate('email', e.target.value)} placeholder="jamie@yourrestaurant.com" autoComplete="email" className={inputCls(!!fieldErrors.email)} />
      </FormField>

      <FormField label="Phone number" error={fieldErrors.phone} required>
        <input type="tel" value={formData.phone ?? ''} onChange={(e) => onUpdate('phone', e.target.value)} placeholder="(555) 123-4567" autoComplete="tel" className={inputCls(!!fieldErrors.phone)} />
      </FormField>

      {submitError && <p className="text-[12px] text-red-600" role="alert">{submitError}</p>}
    </div>
  );
}
