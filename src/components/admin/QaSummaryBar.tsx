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
}

function StatCard({ label, count, href, variant }: StatCardProps) {
  const containerCls = [
    'flex flex-col gap-1 rounded-xl border p-4 text-center',
    variant === 'red'    && count > 0 ? 'border-red-200 bg-red-50'   : '',
    variant === 'amber'  && count > 0 ? 'border-amber-200 bg-amber-50' : '',
    variant === 'neutral' || count === 0 ? 'border-[#e2e8f0] bg-white' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const countCls = [
    'text-2xl font-bold',
    variant === 'red'   && count > 0 ? 'text-red-700'   : '',
    variant === 'amber' && count > 0 ? 'text-amber-700' : '',
    (variant === 'neutral' || count === 0) ? 'text-[#143225]' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const inner = (
    <>
      <span className={countCls}>{count}</span>
      <span className="text-xs text-[#64748b]">{label}</span>
    </>
  );

  if (href) {
    return (
      <Link href={href} className={`${containerCls} hover:opacity-80 transition-opacity`}>
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
      <StatCard label="Qualified"       count={qualified}      variant="neutral" />
      <StatCard label="DQ"              count={dq}             variant="neutral" />
      <StatCard label="Manual Review"   count={manualReview}   variant="amber"   href="/admin/submissions?filter=manual_review" />
      <StatCard label="Workflow Failed" count={workflowFailed} variant="red"     href="/admin/submissions?filter=workflow_failed" />
      <StatCard label="PDF Failed"      count={pdfFailed}      variant="red"     href="/admin/submissions?filter=pdf_failed" />
      <StatCard label="CRM Failed"      count={crmFailed}      variant="red"     href="/admin/submissions?filter=crm_failed" />
      <StatCard label="Meta Failed"     count={metaFailed}     variant="red"     href="/admin/submissions?filter=meta_failed" />
    </div>
  );
}
