// GET /api/admin/pipeline-diagnostics — service-to-service endpoint for
// fsiq-marketing-os's pipeline-integrity-monitor and (generalized)
// lead-email-delivery-monitor.
//
// This app has no direct view of GHL Workflows, Zapier, Anthropic, or
// PDFMonkey health — but every failure in those systems leaves a mark on the
// Submission row it touched. This endpoint surfaces those marks so an
// external monitor can watch for:
//   - submissions stuck/failed mid-pipeline (never resolved, never retried)
//   - abnormally low submission volume (intake itself silently broken)
//   - elevated AI-fallback / PDF-error / Meta-error / CRM-error rates
//     (proxy for Anthropic/PDFMonkey/Meta/GHL degradation — no synthetic
//     pings to those vendors; real submission outcomes are the more honest
//     signal and cost nothing extra to compute)
//   - both qualified AND disqualified leads that were CRM-synced but may not
//     have gotten their (qualified-report or DQ) email yet
//
// Auth: Authorization: Bearer <ADMIN_ACCESS_TOKEN> — same pattern as
// /api/admin/email-audit.

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import type { Prisma } from '@prisma/client';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const DEFAULT_WINDOW_HOURS = 24;
const DEFAULT_GRACE_MINUTES = 20;

function unauthorized(): NextResponse {
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const expected = process.env.ADMIN_ACCESS_TOKEN;
  const auth = req.headers.get('authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!expected || !token || token !== expected) return unauthorized();

  const { searchParams } = new URL(req.url);
  const windowHours   = Number(searchParams.get('windowHours'))   || DEFAULT_WINDOW_HOURS;
  const graceMinutes  = Number(searchParams.get('graceMinutes'))  || DEFAULT_GRACE_MINUTES;

  const now          = Date.now();
  const windowStart  = new Date(now - windowHours * 60 * 60_000);
  const graceCutoff  = new Date(now - graceMinutes * 60_000);
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60_000);

  // ── Volume: this window vs. the same trailing window each of the last 7 days ──
  const [submissionsThisWindow, submissionsTrailing7d] = await Promise.all([
    db.submission.count({ where: { createdAt: { gte: windowStart } } }),
    db.submission.count({ where: { createdAt: { gte: sevenDaysAgo, lt: windowStart } } }),
  ]);
  const trailing7dSameWindowAvg = Math.round((submissionsTrailing7d / 7) * 10) / 10;

  // ── Stuck / failed submissions — unresolved, past the grace period ────────────
  const stuckWhere: Prisma.SubmissionWhereInput = {
    createdAt: { gte: windowStart, lte: graceCutoff },
    OR: [
      { workflowStatus: 'failed' },
      { workflowStatus: 'partial' },
      { pdfStatus: 'error' },
      { crmSyncStatus: 'error' },
    ],
  };
  const stuck = await db.submission.findMany({
    where: stuckWhere,
    select: {
      id: true, email: true, restaurantName: true, createdAt: true,
      workflowStatus: true, pdfStatus: true, crmSyncStatus: true,
      pdfError: true, crmSyncError: true, dqReason: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  // ── Emails expected: qualified-report path (existing) + DQ path (new) ─────────
  // Hold states (manual review, workflow failure, PDF failure) never get an
  // email by design — excluded here; they surface under `stuck` instead if
  // unresolved, or are just legitimately silent if resolved by a human.
  const pendingEmailWhere: Prisma.SubmissionWhereInput = {
    createdAt: { gte: windowStart, lte: graceCutoff },
    crmSyncStatus: 'synced',
    ghlContactId: { not: null },
    manualReviewRequired: false,
    workflowStatus: { not: 'failed' },
    OR: [
      { qualified: true, pdfStatus: 'complete' },
      { qualified: false, dqReason: { not: null } },
    ],
  };
  const pendingEmailChecks = await db.submission.findMany({
    where: pendingEmailWhere,
    select: {
      id: true, email: true, restaurantName: true, ghlContactId: true,
      createdAt: true, qualified: true, dqReason: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  // ── Reliability rates over the window (proxy for 3rd-party degradation) ──────
  const windowSubmissions = await db.submission.findMany({
    where: { createdAt: { gte: windowStart } },
    select: { pdfStatus: true, pdfCachedUrl: true, metaStatus: true, crmSyncStatus: true, workflowErrors: true },
  });
  const total = windowSubmissions.length;
  const aiFallbackCount = windowSubmissions.filter((s) => {
    const errs = (s.workflowErrors as { stage?: string }[] | null) ?? [];
    return errs.some((e) => e.stage === 'ai_research' || e.stage === 'ai_narrative');
  }).length;
  const pdfErrorCount     = windowSubmissions.filter((s) => s.pdfStatus === 'error').length;
  const pdfCacheMissCount = windowSubmissions.filter((s) => s.pdfStatus === 'complete' && !s.pdfCachedUrl).length;
  const metaErrorCount    = windowSubmissions.filter((s) => s.metaStatus === 'error').length;
  const crmErrorCount     = windowSubmissions.filter((s) => s.crmSyncStatus === 'error').length;

  return NextResponse.json({
    windowHours,
    volume: {
      submissionsThisWindow,
      trailing7dSameWindowAvg,
    },
    stuck,
    pendingEmailChecks,
    reliability: {
      totalSubmissions: total,
      aiFallbackCount,
      pdfErrorCount,
      pdfCacheMissCount,
      metaErrorCount,
      crmErrorCount,
    },
  });
}
