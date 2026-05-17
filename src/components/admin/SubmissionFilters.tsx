import Link from 'next/link';

const FILTERS = [
  { key: 'all',             label: 'All' },
  { key: 'manual_review',   label: 'Manual Review' },
  { key: 'workflow_failed', label: 'Workflow Failed' },
  { key: 'pdf_failed',      label: 'PDF Failed' },
  { key: 'crm_failed',      label: 'CRM Failed' },
  { key: 'meta_failed',     label: 'Meta Failed' },
  { key: 'qualified',       label: 'Qualified' },
  { key: 'dq',              label: 'DQ' },
] as const;

export function SubmissionFilters({ activeFilter }: { activeFilter: string }) {
  return (
    <div className="flex flex-wrap gap-2 mb-4">
      {FILTERS.map(({ key, label }) => {
        const isActive = activeFilter === key;
        return (
          <Link
            key={key}
            href={key === 'all' ? '/admin/submissions' : `/admin/submissions?filter=${key}`}
            className={[
              'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
              isActive
                ? 'bg-[#143225] text-white'
                : 'bg-white border border-[#e2e8f0] text-[#475569] hover:bg-[#f8fafc]',
            ].join(' ')}
          >
            {label}
          </Link>
        );
      })}
    </div>
  );
}
