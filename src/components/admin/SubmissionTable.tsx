import Link from 'next/link';
import type { SubmissionListItem } from '@/lib/admin/submission-queries';
import {
  QualifiedBadge,
  WorkflowStatusBadge,
  PdfStatusBadge,
  CrmSyncBadge,
  MetaStatusBadge,
  ManualReviewBadge,
} from './SubmissionStatusBadge';
import { finalDecisionLabel, formatDate } from '@/lib/admin/submission-formatters';

const AVATAR_PALETTE = [
  'linear-gradient(135deg, #52C275, #143225)',
  'linear-gradient(135deg, #1a4632, #52C275)',
  'linear-gradient(135deg, #0e2418, #1a4632)',
  'linear-gradient(135deg, #475569, #143225)',
];

function RestaurantAvatar({ name }: { name: string | null }) {
  if (!name) return null;
  const sum = [...name].reduce((a, c) => a + c.charCodeAt(0), 0);
  const bg = AVATAR_PALETTE[sum % AVATAR_PALETTE.length];
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();
  return (
    <span className="avatar shrink-0" style={{ background: bg }} aria-hidden="true">
      {initials}
    </span>
  );
}

function Truncate({ text, maxWidth = 'max-w-[120px]' }: { text: string | null; maxWidth?: string }) {
  if (!text) return <span className="text-[#94a3b8]">—</span>;
  return (
    <span className={`block ${maxWidth} truncate`} title={text}>
      {text}
    </span>
  );
}

export function SubmissionTable({ items }: { items: SubmissionListItem[] }) {
  if (items.length === 0) {
    return (
      <div className="px-6 py-16 text-center">
        <p className="text-[14px] text-[#64748b]">No submissions match this filter.</p>
      </div>
    );
  }

  return (
    <div className="scroll-x">
      <table className="tbl">
        <thead>
          <tr>
            {[
              'Created',
              'Restaurant',
              'Name / Email',
              'Website',
              'Qualified',
              'Decision',
              'PDF',
              'CRM',
              'Meta',
              'Workflow',
              'Manual Review',
            ].map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td className="text-[#64748b] whitespace-nowrap">
                <Link
                  href={`/admin/submissions/${item.id}`}
                  className="hover:text-[#143225] hover:underline"
                >
                  {formatDate(item.createdAt)}
                </Link>
              </td>

              <td>
                <Link
                  href={`/admin/submissions/${item.id}`}
                  className="inline-flex items-center gap-2.5 hover:opacity-90 transition-opacity"
                >
                  <RestaurantAvatar name={item.restaurantName} />
                  <span className="font-medium text-[#143225]">
                    <Truncate text={item.restaurantName} maxWidth="max-w-[140px]" />
                  </span>
                </Link>
              </td>

              <td>
                <div className="leading-snug">
                  <p className="font-medium text-[#143225]">
                    <Truncate text={item.fullName} maxWidth="max-w-[100px]" />
                  </p>
                  <p className="text-[12px] text-[#64748b]">
                    <Truncate text={item.email} maxWidth="max-w-[140px]" />
                  </p>
                </div>
              </td>

              <td>
                <Truncate text={item.website} maxWidth="max-w-[130px]" />
              </td>

              <td>
                <QualifiedBadge qualified={item.qualified} />
              </td>

              <td className="text-[#475569] whitespace-nowrap">
                {finalDecisionLabel(item.finalDecision)}
              </td>

              <td>
                <PdfStatusBadge status={item.pdfStatus} />
              </td>

              <td>
                <CrmSyncBadge status={item.crmSyncStatus} />
              </td>

              <td>
                <MetaStatusBadge status={item.metaStatus} />
              </td>

              <td>
                <WorkflowStatusBadge status={item.workflowStatus} />
              </td>

              <td>
                <ManualReviewBadge
                  status={item.manualReviewStatus}
                  required={item.manualReviewRequired}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
