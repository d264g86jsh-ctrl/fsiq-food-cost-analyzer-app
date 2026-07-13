// GET /api/health — liveness probe for external monitors (app-health-monitor.skill.ts).
// Unlike the homepage, this round-trips the database so a paused/unreachable
// Supabase project (compute pause, connection exhaustion, etc.) shows as down
// instead of masquerading as "up" behind a static page.

import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  const startedAt = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: 'ok', db: 'up', response_time_ms: Date.now() - startedAt },
      { status: 200 },
    );
  } catch (err) {
    return NextResponse.json(
      {
        status: 'error',
        db: 'down',
        error: err instanceof Error ? err.message : 'unknown error',
        response_time_ms: Date.now() - startedAt,
      },
      { status: 503 },
    );
  }
}
