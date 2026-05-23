import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const { id } = await params;

  const submission = await db.submission.findUnique({
    where: { id },
    select: { qualified: true, pdfDownloadUrl: true },
  });

  if (!submission || submission.qualified !== true || !submission.pdfDownloadUrl) {
    return new NextResponse(null, { status: 404 });
  }

  const upstream = await fetch(submission.pdfDownloadUrl);
  if (!upstream.ok) {
    return new NextResponse(null, { status: 502 });
  }

  const pdf = await upstream.arrayBuffer();

  return new NextResponse(pdf, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="Food-Cost-Analyzer.pdf"',
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
