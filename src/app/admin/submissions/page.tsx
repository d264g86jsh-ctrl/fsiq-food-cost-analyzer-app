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
      <div className="fsiq-in">
        <QaSummaryBar {...counts} />
      </div>

      <div className="mt-7 fsiq-in" style={{ animationDelay: '40ms' }}>
        <SubmissionFilters activeFilter={filter} />

        <div className="card-solid rounded-3xl overflow-hidden">
          <div className="px-6 py-4 border-b border-[#eef0ea] flex items-center justify-between">
            <p className="text-[14px] font-semibold text-[#143225]">
              {total} submission{total !== 1 ? 's' : ''}
              {filter !== 'all' && (
                <span className="ml-2 pill pill-neutral">Filtered</span>
              )}
            </p>
            <div className="flex items-center gap-3">
              <AdminAutoRefresh />
            </div>
          </div>
          <SubmissionTable items={items} />
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-5 text-[13px]">
            <p className="text-[#64748b]">Page {page} of {totalPages}</p>
            <div className="flex gap-2">
              {page > 1 && (
                <Link
                  href={`/admin/submissions?${new URLSearchParams({ ...(filter !== 'all' ? { filter } : {}), page: String(page - 1) })}`}
                  className="chip"
                >
                  Previous
                </Link>
              )}
              {page < totalPages && (
                <Link
                  href={`/admin/submissions?${new URLSearchParams({ ...(filter !== 'all' ? { filter } : {}), page: String(page + 1) })}`}
                  className="chip"
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
