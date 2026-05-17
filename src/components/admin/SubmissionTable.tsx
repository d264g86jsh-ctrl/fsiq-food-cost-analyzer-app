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
      <div className="px-6 py-12 text-center text-sm text-[#94a3b8]">
        No submissions found.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-[#f8fafc] border-b border-[#e2e8f0]">
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
              <th
                key={col}
                className="px-3 py-2.5 text-left text-[#64748b] font-medium whitespace-nowrap"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr
              key={item.id}
              className="border-b border-[#e2e8f0] hover:bg-[#f8fafc] transition-colors"
            >
              <td className="px-3 py-2.5 whitespace-nowrap text-[#475569]">
                <Link
                  href={`/admin/submissions/${item.id}`}
                  className="hover:text-[#143225] hover:underline"
                >
                  {formatDate(item.createdAt)}
                </Link>
              </td>
              <td className="px-3 py-2.5">
                <Link
                  href={`/admin/submissions/${item.id}`}
                  className="font-medium text-[#143225] hover:underline"
                >
                  <Truncate text={item.restaurantName} maxWidth="max-w-[150px]" />
                </Link>
              </td>
              <td className="px-3 py-2.5">
                <Truncate text={item.fullName} maxWidth="max-w-[100px]" />
                <span className="block text-[#94a3b8]">
                  <Truncate text={item.email} maxWidth="max-w-[140px]" />
                </span>
              </td>
              <td className="px-3 py-2.5">
                <Truncate text={item.website} maxWidth="max-w-[130px]" />
              </td>
              <td className="px-3 py-2.5">
                <QualifiedBadge qualified={item.qualified} />
              </td>
              <td className="px-3 py-2.5 whitespace-nowrap text-[#475569]">
                {finalDecisionLabel(item.finalDecision)}
              </td>
              <td className="px-3 py-2.5">
                <PdfStatusBadge status={item.pdfStatus} />
              </td>
              <td className="px-3 py-2.5">
                <CrmSyncBadge status={item.crmSyncStatus} />
              </td>
              <td className="px-3 py-2.5">
                <MetaStatusBadge status={item.metaStatus} />
              </td>
              <td className="px-3 py-2.5">
                <WorkflowStatusBadge status={item.workflowStatus} />
              </td>
              <td className="px-3 py-2.5">
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
