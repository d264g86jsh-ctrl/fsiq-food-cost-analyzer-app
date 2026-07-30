interface FormProgressHeaderProps {
  step: number;
  totalSteps: number;
  title: string;
}

export function FormProgressHeader({ step, totalSteps, title }: FormProgressHeaderProps) {
  return (
    <>
      <div className="flex items-center gap-3">
        <div className="flex gap-1.5 flex-1">
          {Array.from({ length: totalSteps }, (_, i) => (
            <div key={i} className="flex-1 h-[3px] rounded-full bg-[#143225]/[0.12] overflow-hidden">
              <div
                className="h-full rounded-full bg-[#143225] transition-all duration-500"
                style={{ width: i < step - 1 ? '100%' : i === step - 1 ? '60%' : '0%' }}
              />
            </div>
          ))}
        </div>
        <span className="text-[11px] font-medium text-[#64748b] tabular-nums tracking-tight whitespace-nowrap">
          {step} / {totalSteps}
        </span>
      </div>

      <h2 key={`heading-${step}`} className="mt-6 text-[22px] sm:text-[26px] font-bold tracking-[-0.015em] text-[#143225] fsiq-step-in">
        {title}
      </h2>
    </>
  );
}
