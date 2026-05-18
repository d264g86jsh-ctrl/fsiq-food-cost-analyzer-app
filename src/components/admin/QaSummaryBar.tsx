import Link from 'next/link';

interface QaSummaryBarProps {
  total:          number;
  qualified:      number;
  dq:             number;
  manualReview:   number;
  workflowFailed: number;
  pdfFailed:      number;
  crmFailed:      number;
  metaFailed:     number;
}

interface StatCardProps {
  label:   string;
  count:   number;
  href?:   string;
  variant: 'neutral' | 'amber' | 'red';
  accent?: boolean;
}

function StatCard({ label, count, href, variant, accent }: StatCardProps) {
  const isAlert = variant === 'red' && count > 0;

  const inner = (
    <>
      {isAlert && <span className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl bg-[#dc2626]/70" />}
      {accent && count > 0 && <span className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl bg-[#52C275]" />}

      <div className="flex items-start justify-between gap-3 min-h-[28px]">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[#64748b] leading-snug">
          {label}
        </p>
        {isAlert && (
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="text-[#dc2626] shrink-0 mt-0.5" aria-hidden="true">
            <path d="M8 2l6 11H2L8 2z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
            <path d="M8 6.5v3M8 11.5h.01" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        )}
        {accent && count > 0 && (
          <svg width="11" height="11" viewBox="0 0 12 12" fill="none" className="text-[#52C275] shrink-0 mt-0.5" aria-hidden="true">
            <path d="M2.5 6.2 4.9 8.5 9.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </div>

      <p className={[
        'mt-2.5 text-[32px] font-bold tracking-[-0.03em] tabular-nums leading-none',
        isAlert ? 'text-[#dc2626]' : count === 0 ? 'text-[#cbd5d2]' : 'text-[#143225]',
      ].join(' ')}>
        {count}
      </p>
    </>
  );

  const containerCls = [
    'card-soft rounded-2xl p-5 relative overflow-hidden transition-opacity',
    isAlert ? 'stat-alert' : '',
  ].filter(Boolean).join(' ');

  if (href) {
    return (
      <Link href={href} className={`${containerCls} block hover:opacity-80`}>
        {inner}
      </Link>
    );
  }

  return <div className={containerCls}>{inner}</div>;
}

export function QaSummaryBar({
  total,
  qualified,
  dq,
  manualReview,
  workflowFailed,
  pdfFailed,
  crmFailed,
  metaFailed,
}: QaSummaryBarProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
      <StatCard label="Total"           count={total}          variant="neutral" />
      <StatCard label="Qualified"       count={qualified}      variant="neutral" accent />
      <StatCard label="DQ"              count={dq}             variant="neutral" />
      <StatCard label="Manual Review"   count={manualReview}   variant="amber"   href="/admin/submissions?filter=manual_review" />
      <StatCard label="Workflow Failed" count={workflowFailed} variant="red"     href="/admin/submissions?filter=workflow_failed" />
      <StatCard label="PDF Failed"      count={pdfFailed}      variant="red"     href="/admin/submissions?filter=pdf_failed" />
      <StatCard label="CRM Failed"      count={crmFailed}      variant="red"     href="/admin/submissions?filter=crm_failed" />
      <StatCard label="Meta Failed"     count={metaFailed}     variant="red"     href="/admin/submissions?filter=meta_failed" />
    </div>
  );
}
