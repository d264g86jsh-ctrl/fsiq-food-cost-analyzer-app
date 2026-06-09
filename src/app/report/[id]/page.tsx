import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Image from 'next/image';
import { db } from '@/lib/db';

export async function generateMetadata(): Promise<Metadata> {
  return { title: 'Food Cost Analyzer | FoodServiceIQ' };
}

const BG = 'linear-gradient(135deg, #143225 0%, #1a4632 100%)';

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
    <div style={{ margin: 0, padding: 0, minHeight: '100vh', background: BG }}>

      {/* ── Desktop (≥768px): full-screen iframe ── */}
      <div className="hidden md:block" style={{ height: '100vh' }}>
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

      {/* ── Mobile (<768px): branded CTA ──
           iOS Safari and Android Chrome don't render PDFs inside iframes.
           Instead, link directly to the proxy route which opens in the
           native PDF viewer — the correct behaviour on mobile. ── */}
      <div
        className="flex md:hidden"
        style={{
          minHeight: '100vh',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 28px',
          gap: '28px',
          textAlign: 'center',
        }}
      >
        <Image
          src="/brand/fsiq-iq-logo.png"
          alt="FoodServiceIQ"
          width={88}
          height={88}
          style={{ borderRadius: '20px' }}
          priority
        />

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '320px' }}>
          <h1
            style={{
              color: 'white',
              fontSize: '24px',
              fontWeight: '700',
              lineHeight: '1.25',
              margin: 0,
            }}
          >
            Your Food Cost Analysis is Ready
          </h1>
          <p
            style={{
              color: 'rgba(255,255,255,0.72)',
              fontSize: '16px',
              lineHeight: '1.6',
              margin: 0,
            }}
          >
            Tap below to open your personalized report
          </p>
        </div>

        <a
          href={`/api/report/${id}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-block',
            backgroundColor: 'white',
            color: '#143225',
            fontWeight: '700',
            fontSize: '17px',
            padding: '16px 44px',
            borderRadius: '999px',
            textDecoration: 'none',
            boxShadow: '0 4px 20px rgba(0,0,0,0.25)',
            marginTop: '4px',
            letterSpacing: '-0.01em',
          }}
        >
          Open Report
        </a>
      </div>

    </div>
  );
}
