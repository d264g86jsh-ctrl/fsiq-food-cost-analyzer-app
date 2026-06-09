import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { db } from '@/lib/db';

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Food Cost Analyzer | FoodServiceIQ' };
}

function isMobileUserAgent(ua: string): boolean {
  return /iPhone|iPad|Android|Mobile/i.test(ua);
}

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

  // Mobile browsers (iOS Safari, Android Chrome) don't render PDFs in iframes.
  // Redirect directly to the proxy route so the native PDF viewer handles it —
  // one tap from email to PDF, no intermediate page.
  const headersList = await headers();
  const ua = headersList.get('user-agent') ?? '';
  if (isMobileUserAgent(ua)) {
    redirect(`/api/report/${id}`);
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
        src={`/api/report/${id}`}
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
