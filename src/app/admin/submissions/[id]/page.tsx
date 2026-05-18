import { notFound } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { SubmissionDetail } from '@/components/admin/SubmissionDetail';
import { getSubmission } from '@/lib/admin/submission-queries';
import Link from 'next/link';

export default async function SubmissionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const submission = await getSubmission(id);
  if (!submission) notFound();

  return (
    <AdminShell>
      <div className="mb-5 fsiq-in">
        <Link href="/admin/submissions" className="btn-back">
          <svg width="13" height="13" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path d="M10 3 5 8l5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Back to submissions
        </Link>
      </div>

      <div className="mb-7 fsiq-in" style={{ animationDelay: '20ms' }}>
        <h1 className="text-[28px] sm:text-[32px] font-bold tracking-[-0.02em] text-[#143225] leading-tight">
          {submission.restaurantName}
        </h1>
        <p className="mt-1 text-[12.5px] font-mono text-[#64748b]">{submission.id}</p>
      </div>

      <div className="fsiq-in" style={{ animationDelay: '50ms' }}>
        <SubmissionDetail submission={submission} />
      </div>
    </AdminShell>
  );
}
