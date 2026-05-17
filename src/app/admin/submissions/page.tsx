import { AdminShell } from '@/components/admin/AdminShell';
import { QaSummaryBar } from '@/components/admin/QaSummaryBar';
import { SubmissionFilters } from '@/components/admin/SubmissionFilters';
import { SubmissionTable } from '@/components/admin/SubmissionTable';
import { AdminAutoRefresh } from '@/components/admin/AdminAutoRefresh';
import { getSubmissions, getSubmissionCounts, type SubmissionFilter } from '@/lib/admin/submission-queries';
import Link from 'next/link';

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; page?: string }>;
}) {
  const params = await searchParams;
  const filter = (params.filter ?? 'all') as SubmissionFilter;
  const page = Math.max(1, parseInt(params.page ?? '1', 10) || 1);

  const [{ items, total, pageSize }, counts] = await Promise.all([
    getSubmissions(filter, page),
    getSubmissionCounts(),
  ]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <AdminShell title="Submissions">
      <QaSummaryBar {...counts} />
      <div className="mt-6">
        <SubmissionFilters activeFilter={filter} />
        <div className="bg-white border border-[#e2e8f0] rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-[#e2e8f0] flex items-center justify-between">
            <p className="text-sm text-[#475569]">
              {total} submission{total !== 1 ? 's' : ''}{filter !== 'all' ? ` matching filter` : ''}
            </p>
            <AdminAutoRefresh />
          </div>
          <SubmissionTable items={items} />
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 text-sm">
            <p className="text-[#64748b]">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/admin/submissions?${new URLSearchParams({ ...(filter !== 'all' ? { filter } : {}), page: String(page - 1) })}`}
                  className="px-3 py-1.5 border border-[#e2e8f0] rounded text-[#475569] hover:bg-[#f8fafc]"
                >
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/admin/submissions?${new URLSearchParams({ ...(filter !== 'all' ? { filter } : {}), page: String(page + 1) })}`}
                  className="px-3 py-1.5 border border-[#e2e8f0] rounded text-[#475569] hover:bg-[#f8fafc]"
                >
                  Next
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
