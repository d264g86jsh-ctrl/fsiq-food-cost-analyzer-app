// POST /api/validate-website — stateless website validation endpoint.
// Called on field blur (real-time). Delegates to runValidation in src/lib/website/run-validation.ts.
// Does not write to the database. Phase 8 (submitAnalysis) owns DB writes.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { runValidation } from '@/lib/website/run-validation';
import type { ValidateWebsiteRequest } from '@/lib/website/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: ValidateWebsiteRequest;
  try {
    body = (await req.json()) as ValidateWebsiteRequest;
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 });
  }

  const { website, restaurantName, state } = body;

  if (!website || !restaurantName || !state) {
    return NextResponse.json(
      { success: false, error: 'website, restaurantName, and state are required' },
      { status: 400 },
    );
  }

  try {
    const result = await runValidation(body);
    return NextResponse.json({ success: true, result });
  } catch (err) {
    console.error('[validate-website] Unexpected error:', err);
    return NextResponse.json({ success: false, error: 'Internal validation error' }, { status: 500 });
  }
}
