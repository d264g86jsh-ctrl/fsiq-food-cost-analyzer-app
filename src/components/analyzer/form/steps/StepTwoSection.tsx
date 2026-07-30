import type { FormData } from '@/components/analyzer/AnalyzerForm';
import type { AnalyzerFormPayload } from '@/lib/analyzer/form-types';
import { CONCEPT_TYPE_OPTIONS, LOCATIONS_OPTIONS } from '@/lib/analyzer/form-types';
import { FormField } from '@/components/analyzer/form/shared/FormField';
import { selectCls } from '@/components/analyzer/form/shared/fieldStyles';

interface StepTwoSectionProps {
  formData: FormData;
  onUpdate: (field: keyof AnalyzerFormPayload, value: string) => void;
}

export function StepTwoSection({ formData, onUpdate }: StepTwoSectionProps) {
  return (
    <div className="mt-6 space-y-6 fsiq-step-in">
      <FormField label="Concept type" required>
        <select value={formData.concept_type ?? ''} onChange={(e) => onUpdate('concept_type', e.target.value)} className={selectCls(false)}>
          <option value="">Select concept type</option>
          {CONCEPT_TYPE_OPTIONS.map((o) => (
            <option key={o} value={o}>{o}</option>
          ))}
        </select>
      </FormField>

      <FormField label="Number of locations" required>
        <select value={formData.locations ?? ''} onChange={(e) => onUpdate('locations', e.target.value)} className={selectCls(false)}>
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
          onChange={(e) => onUpdate('annual_food_spend', e.target.value)}
        />
        <p className="text-[11px] text-[#64748b] mt-1">Enter your total annual food & beverage spend</p>
      </FormField>
    </div>
  );
}
