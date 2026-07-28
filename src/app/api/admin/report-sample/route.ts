// GET /api/admin/report-sample — service-to-service endpoint for
// fsiq-marketing-os's report-link-integrity-monitor.
//
// Returns one qualified/PDF-complete submission ID from each of several age
// buckets (most recent, ~7d, ~30d, ~90d, ~180d old) so an external monitor
// can periodically re-fetch old report links and catch "link rot" — a
// permanent PDF (Supabase Storage cache or the original PDFMonkey doc)
// silently becoming unreachable months after it was generated, long after
// anyone would think to check.
//
// Auth: Authorization: Bearer <ADMIN_ACCESS_TOKEN>.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const AGE_BUCKETS_DAYS = [0, 7, 30, 90, 180];

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.ADMIN_ACCESS_TOKEN;
  const auth = req.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!expected || !token || token !== expected) return unauthorized();

  const now = Date.now();
  const samples: { ageDays: number; id: string; createdAt: Date }[] = [];

  for (const ageDays of AGE_BUCKETS_DAYS) {
    const targetTime = now - ageDays * 24 * 60 * 60_000;
    // Nearest qualified/complete submission to this target age, older side first
    // (a report link should stay valid indefinitely, so "closest available" is
    // fine — we don't need the exact day).
    const candidate = await db.submission.findFirst({
      where: {
        qualified: true,
        pdfStatus: 'complete',
        createdAt: { lte: new Date(targetTime) },
      },
      select: { id: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    if (candidate && !samples.some((s) => s.id === candidate.id)) {
      samples.push({ ageDays, id: candidate.id, createdAt: candidate.createdAt });
    }
  }

  return NextResponse.json({ samples });
}
