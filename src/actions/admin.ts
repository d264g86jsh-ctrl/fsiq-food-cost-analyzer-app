'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { validateAdminToken, ADMIN_COOKIE_NAME, ADMIN_COOKIE_MAX_AGE } from '@/lib/admin/admin-auth';
import type { ManualReviewStatus } from '@prisma/client';

export async function adminLogin(formData: FormData): Promise<void> {
  const token = formData.get('token')?.toString() ?? '';
  if (!validateAdminToken(token)) {
    redirect('/admin/login?error=Invalid+access+token');
  }
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/admin',
    maxAge: ADMIN_COOKIE_MAX_AGE,
  });
  redirect('/admin/submissions');
}

export async function adminLogout(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
  redirect('/admin/login');
}

export async function updateManualReview(
  submissionId: string,
  status: ManualReviewStatus,
  notes: string,
): Promise<{ success: boolean; error?: string }> {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_COOKIE_NAME)?.value ?? '';
  if (!validateAdminToken(session)) {
    return { success: false, error: 'Unauthorized.' };
  }
  try {
    await db.submission.update({
      where: { id: submissionId },
      data: {
        manualReviewStatus: status,
        manualReviewNotes:  notes.trim() || null,
        manualReviewedAt:   new Date(),
      },
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Update failed.' };
  }
}
