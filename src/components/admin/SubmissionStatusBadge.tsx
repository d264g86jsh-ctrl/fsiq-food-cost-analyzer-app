type PillKind = 'success' | 'error' | 'warn' | 'muted' | 'neutral';

const DOT: Record<PillKind, string> = {
  success: '#52C275',
  error:   '#dc2626',
  warn:    '#ca8a04',
  muted:   '#94a3b8',
  neutral: '#475569',
};

const CLS: Record<PillKind, string> = {
  success: 'pill-success',
  error:   'pill-error',
  warn:    'pill-warn',
  muted:   'pill-muted',
  neutral: 'pill-neutral',
};

function Pill({ kind, label }: { kind: PillKind; label: string }) {
  return (
    <span className={`pill ${CLS[kind]}`}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: DOT[kind] }} />
      {label}
    </span>
  );
}

export function QualifiedBadge({ qualified }: { qualified: boolean | null }) {
  if (qualified === true)  return <Pill kind="success" label="Qualified" />;
  if (qualified === false) return <Pill kind="muted"   label="DQ" />;
  return <Pill kind="muted" label="—" />;
}

export function WorkflowStatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case 'complete':    return <Pill kind="success" label="Complete" />;
    case 'failed':      return <Pill kind="error"   label="Failed" />;
    case 'partial':     return <Pill kind="warn"    label="Partial" />;
    case 'in_progress': return <Pill kind="neutral" label="In Progress" />;
    case 'pending':     return <Pill kind="muted"   label="Pending" />;
    default:            return <Pill kind="muted"   label={status ?? '—'} />;
  }
}

export function PdfStatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case 'complete':   return <Pill kind="success" label="Complete" />;
    case 'error':      return <Pill kind="error"   label="Error" />;
    case 'skipped':    return <Pill kind="muted"   label="Skipped" />;
    case 'generating': return <Pill kind="neutral" label="Generating" />;
    case 'pending':    return <Pill kind="muted"   label="Pending" />;
    default:           return <Pill kind="muted"   label={status ?? '—'} />;
  }
}

export function CrmSyncBadge({ status }: { status: string | null }) {
  switch (status) {
    case 'synced':  return <Pill kind="success" label="Synced" />;
    case 'error':   return <Pill kind="error"   label="Error" />;
    case 'pending': return <Pill kind="warn"    label="Pending" />;
    default:        return <Pill kind="muted"   label={status ?? '—'} />;
  }
}

export function MetaStatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case 'fired':   return <Pill kind="success" label="Fired" />;
    case 'error':   return <Pill kind="error"   label="Error" />;
    case 'skipped': return <Pill kind="muted"   label="Skipped" />;
    default:        return <Pill kind="muted"   label={status ?? '—'} />;
  }
}

export function ManualReviewBadge({
  status,
  required,
}: {
  status: string | null;
  required: boolean;
}) {
  if (!required && (status === 'not_required' || !status)) return null;
  switch (status) {
    case 'pending':      return <Pill kind="warn"    label="Pending" />;
    case 'approved':     return <Pill kind="success" label="Approved" />;
    case 'rejected':     return <Pill kind="error"   label="Rejected" />;
    case 'not_required': return <Pill kind="muted"   label="Not Required" />;
    default:             return <Pill kind="muted"   label={status ?? '—'} />;
  }
}
