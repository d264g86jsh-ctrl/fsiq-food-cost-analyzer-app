'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { validateAdminToken, ADMIN_COOKIE_NAME, ADMIN_COOKIE_MAX_AGE } from '@/lib/admin/admin-auth';
import { syncToGhl } from '@/lib/crm/ghl';
import { buildGhlPayload } from '@/lib/crm/build-ghl-payload';
import { assignLeadStatus } from '@/lib/crm/assign-lead-status';
import type { ManualReviewStatus, CrmSyncStatus, WorkflowStatus } from '@prisma/client';

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

export async function retryGhlSync(
  submissionId: string,
): Promise<{ success: boolean; ghlContactId?: string | null; error?: string }> {
  const cookieStore = await cookies();
  const session = cookieStore.get(ADMIN_COOKIE_NAME)?.value ?? '';
  if (!validateAdminToken(session)) {
    return { success: false, error: 'Unauthorized.' };
  }

  const submission = await db.submission.findUnique({ where: { id: submissionId } }).catch(() => null);
  if (!submission) return { success: false, error: 'Submission not found.' };

  // Rebuild lead status from current DB state so the GHL payload is accurate.
  const finalStatus = assignLeadStatus({
    finalDecision:        submission.finalDecision ?? 'plausible_unverified',
    countryEligibility:   submission.countryEligibility ?? 'unknown',
    qualified:            submission.qualified ?? false,
    dqReason:             submission.dqReason,
    pdfMode:              submission.pdfMode as 'full' | 'conservative' | null,
    pdfStatus:            (submission.pdfStatus as 'complete' | 'error' | 'skipped' | null) ?? null,
    pdfDownloadUrl:       submission.pdfDownloadUrl,
    manualReviewRequired: submission.manualReviewRequired,
    workflowFailed:       submission.workflowStatus === 'failed',
  });

  const ghlPayload = buildGhlPayload(submission, finalStatus.leadStatus, finalStatus.communicationRoute, finalStatus.tags);
  const crmResult = await syncToGhl(ghlPayload);

  // Update DB with retry result. If it succeeded, clear the error.
  // If it failed again, preserve partial status and refresh the error message.
  const nowSynced = crmResult.crmSyncStatus === 'synced';
  await db.submission.update({
    where: { id: submissionId },
    data: {
      crmSyncStatus: crmResult.crmSyncStatus as CrmSyncStatus,
      ghlContactId:  crmResult.ghlContactId,
      crmSyncError:  crmResult.crmSyncError,
      crmTags:       crmResult.crmTags as string[],
      // Upgrade workflowStatus to complete only if the retry fixed the last remaining failure
      ...(nowSynced && submission.workflowStatus === 'partial'
        ? { workflowStatus: 'complete' as WorkflowStatus }
        : {}),
    },
  });

  if (nowSynced) {
    return { success: true, ghlContactId: crmResult.ghlContactId };
  }
  return { success: false, error: crmResult.crmSyncError ?? 'GHL sync failed.' };
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
