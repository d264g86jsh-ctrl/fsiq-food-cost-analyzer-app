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
      <div className="mb-4">
        <Link href="/admin/submissions" className="text-sm text-[#52C275] hover:underline">
          ← Back to submissions
        </Link>
      </div>
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-[#143225]">{submission.restaurantName}</h1>
        <p className="text-sm text-[#64748b] mt-0.5">{submission.id}</p>
      </div>
      <SubmissionDetail submission={submission} />
    </AdminShell>
  );
}
