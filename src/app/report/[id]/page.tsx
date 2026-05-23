import { notFound } from 'next/navigation';
import { db } from '@/lib/db';

export default async function ReportPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const submission = await db.submission.findUnique({
    where: { id },
    select: { qualified: true, pdfDownloadUrl: true },
  });

  if (!submission || submission.qualified !== true || !submission.pdfDownloadUrl) {
    notFound();
  }

  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #143225 0%, #1a4632 100%)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
      }}
    >
      <iframe
        src={submission.pdfDownloadUrl}
        title="Your Food Cost Analysis Report"
        style={{
          display: 'block',
          width: '100%',
          height: '100vh',
          border: 'none',
          background: 'white',
          boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
        }}
      />
    </div>
  );
}
