// GET /api/admin/email-audit — service-to-service endpoint for the
// lead-email-delivery-monitor skill (fsiq-marketing-os).
//
// Lists qualified, PDF-ready, GHL-synced submissions that are old enough that
// GHL's "FSIQ Full PDF Ready" workflow should have already emailed them, so an
// external monitor can verify delivery actually happened (this app has no
// visibility into GHL Workflows or email delivery — GHL/Zapier own that).
//
// Auth: Authorization: Bearer <ADMIN_ACCESS_TOKEN>. Not the cookie-based
// /admin/* session — this is a separate machine-to-machine credential check,
// same token, different mechanism (see src/middleware.ts for the UI path).

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_WINDOW_MINUTES = 240; // how far back to look
const DEFAULT_GRACE_MINUTES = 20;   // how long to give GHL's workflow before flagging

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.ADMIN_ACCESS_TOKEN;
  const auth = req.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!expected || !token || token !== expected) return unauthorized();

  const { searchParams } = new URL(req.url);
  const windowMinutes = Number(searchParams.get('windowMinutes')) || DEFAULT_WINDOW_MINUTES;
  const graceMinutes  = Number(searchParams.get('graceMinutes'))  || DEFAULT_GRACE_MINUTES;

  const now = Date.now();
  const windowStart = new Date(now - windowMinutes * 60_000);
  const graceCutoff = new Date(now - graceMinutes * 60_000);

  const submissions = await db.submission.findMany({
    where: {
      qualified:      true,
      pdfStatus:      'complete',
      crmSyncStatus:  'synced',
      ghlContactId:   { not: null },
      createdAt:      { gte: windowStart, lte: graceCutoff },
    },
    select: {
      id:             true,
      email:          true,
      restaurantName: true,
      ghlContactId:   true,
      createdAt:      true,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  return NextResponse.json({ submissions });
}
