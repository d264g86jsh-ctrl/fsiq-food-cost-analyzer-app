import type { FormData } from '@/components/analyzer/AnalyzerForm';
import type { AnalyzerFormPayload } from '@/lib/analyzer/form-types';
import { DISTRIBUTOR_TYPE_OPTIONS, PROCUREMENT_STRATEGY_OPTIONS } from '@/lib/analyzer/form-types';
import { FormField } from '@/components/analyzer/form/shared/FormField';
import { selectCls, textareaCls } from '@/components/analyzer/form/shared/fieldStyles';

interface StepThreeSectionProps {
  formData: FormData;
  onUpdate: (field: keyof AnalyzerFormPayload, value: string) => void;
}

export function StepThreeSection({ formData, onUpdate }: StepThreeSectionProps) {
  return (
    <div className="mt-6 space-y-6 fsiq-step-in">
      <FormField label="Primary distributor type" required>
        <select value={formData.distributor_type ?? ''} onChange={(e) => onUpdate('distributor_type', e.target.value)} className={selectCls(false)}>
          <option value="">Select distributor type</option>
          {DISTRIBUTOR_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </FormField>

      <FormField label="Procurement strategy" required>
        <select value={formData.procurement_strategy ?? ''} onChange={(e) => onUpdate('procurement_strategy', e.target.value)} className={selectCls(false)}>
          <option value="">Select procurement strategy</option>
          {PROCUREMENT_STRATEGY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </FormField>

      <FormField label="Top SKUs / spend categories" required>
        <textarea
          value={formData.top_skus ?? ''}
          onChange={(e) => onUpdate('top_skus', e.target.value)}
          placeholder="Chicken, beef, seafood, dairy, produce, fryer oil…"
          rows={3}
          className={textareaCls}
        />
      </FormField>
    </div>
  );
}
