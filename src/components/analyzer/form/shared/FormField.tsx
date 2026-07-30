import type { ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  children: ReactNode;
  error?: string;
  hint?: string;
  required?: boolean;
}

export function FormField({ label, children, error, hint, required }: FormFieldProps) {
  return (
    <div>
      <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#64748b] mb-2">
        {label}
        {required && <span className="text-[#52C275] ml-0.5" aria-hidden="true">*</span>}
        {hint && (
          <span className="ml-2 normal-case tracking-normal text-[10px] text-[#94a3b8]">{hint}</span>
        )}
      </label>
      {children}
      {error && <p className="mt-2 text-[12px] text-red-600" role="alert">{error}</p>}
    </div>
  );
}
