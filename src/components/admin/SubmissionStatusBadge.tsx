type BadgeVariant = 'green' | 'red' | 'amber' | 'gray' | 'blue';

function Badge({ label, variant }: { label: string; variant: BadgeVariant }) {
  const cls: Record<BadgeVariant, string> = {
    green: 'bg-green-100 text-green-800',
    red:   'bg-red-100 text-red-800',
    amber: 'bg-amber-100 text-amber-800',
    gray:  'bg-gray-100 text-gray-600',
    blue:  'bg-blue-100 text-blue-800',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cls[variant]}`}>
      {label}
    </span>
  );
}

export function QualifiedBadge({ qualified }: { qualified: boolean | null }) {
  if (qualified === true)  return <Badge label="Qualified" variant="green" />;
  if (qualified === false) return <Badge label="DQ" variant="gray" />;
  return <Badge label="—" variant="gray" />;
}

export function WorkflowStatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case 'complete':    return <Badge label="Complete" variant="green" />;
    case 'failed':      return <Badge label="Failed" variant="red" />;
    case 'partial':     return <Badge label="Partial" variant="amber" />;
    case 'in_progress': return <Badge label="In Progress" variant="blue" />;
    case 'pending':     return <Badge label="Pending" variant="gray" />;
    default:            return <Badge label={status ?? '—'} variant="gray" />;
  }
}

export function PdfStatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case 'complete':   return <Badge label="Complete" variant="green" />;
    case 'error':      return <Badge label="Error" variant="red" />;
    case 'skipped':    return <Badge label="Skipped" variant="gray" />;
    case 'generating': return <Badge label="Generating" variant="blue" />;
    case 'pending':    return <Badge label="Pending" variant="gray" />;
    default:           return <Badge label={status ?? '—'} variant="gray" />;
  }
}

export function CrmSyncBadge({ status }: { status: string | null }) {
  switch (status) {
    case 'synced':  return <Badge label="Synced" variant="green" />;
    case 'error':   return <Badge label="Error" variant="red" />;
    case 'pending': return <Badge label="Pending" variant="amber" />;
    default:        return <Badge label={status ?? '—'} variant="gray" />;
  }
}

export function MetaStatusBadge({ status }: { status: string | null }) {
  switch (status) {
    case 'fired':   return <Badge label="Fired" variant="green" />;
    case 'error':   return <Badge label="Error" variant="red" />;
    case 'skipped': return <Badge label="Skipped" variant="gray" />;
    default:        return <Badge label={status ?? '—'} variant="gray" />;
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
    case 'pending':      return <Badge label="Pending" variant="amber" />;
    case 'approved':     return <Badge label="Approved" variant="green" />;
    case 'rejected':     return <Badge label="Rejected" variant="red" />;
    case 'not_required': return <Badge label="Not Required" variant="gray" />;
    default:             return <Badge label={status ?? '—'} variant="gray" />;
  }
}
