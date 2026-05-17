'use server';

// Phase 8 — Full pipeline orchestration.
// Source of truth: docs/build-phases.md §Phase 8, docs/architecture.md §Request Flow.
//
// Pipeline: DB save → validation → qualification → [early exit if no AI/PDF needed] →
//           assign preliminary lead status → return response to client immediately →
//           [background via waitUntil] AI research → AI narrative → PDF generation →
//           GHL sync → Meta CAPI → final DB update.
//
// DQ/non-fit path: steps 1–4 → early exit → syncAndReturn (GHL + Meta + complete).
// Qualified path:  steps 1–4 → preliminary status → return to client →
//                  background: steps 7–10.
//
// Routing decisions (DQ reason, lead status, tags, clear_non_fit handling) live
// entirely in src/lib/crm/assign-lead-status.ts. This file is orchestration only.
//
// Security: never expose API keys to client; never throw unhandled errors to user.

import { waitUntil } from '@vercel/functions';
import { headers } from 'next/headers';
import type { FinalDecision, CountryEligibility, DqReason, PdfMode, PdfStatus, CrmSyncStatus, WorkflowStatus, ManualReviewStatus, Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { runValidation } from '@/lib/website/run-validation';
import { qualifyLead, type QualifyLeadResult } from '@/lib/qualification/qualify-lead';
import { buildResearchInput } from '@/lib/ai/research-input';
import { runAiResearch } from '@/lib/ai/ai-researcher';
import { generateAiNarrative } from '@/lib/ai/ai-narrative';
import { buildFallbackResearch, buildFallbackNarrative } from '@/lib/ai/fallback-narrative';
import { determinePdfMode } from '@/lib/pdf/pdf-mode';
import { generatePdf } from '@/lib/pdf/pdfmonkey';
import type { GeneratePdfResult, GeneratePdfInput } from '@/lib/pdf/pdf-types';
import type { AiResearchResult, AiNarrativeResult } from '@/lib/ai/ai-types';
import { assignLeadStatus, needsAiAndPdf, type AssignLeadStatusResult } from '@/lib/crm/assign-lead-status';
import { buildGhlPayload } from '@/lib/crm/build-ghl-payload';
import { syncToGhl } from '@/lib/crm/ghl';
import { buildLeadEvent, buildQualifiedLeadEvent } from '@/lib/meta/meta-events';
import { sendToMetaCapi } from '@/lib/meta/meta-capi';
import { LEAD_STATUS } from '@/lib/crm/lead-status';
import type { TrackingContext } from '@/lib/meta/meta-types';
import type { AnalyzerFormPayload } from '@/lib/analyzer/form-types';

// ── Result type ───────────────────────────────────────────────────────────────

export interface SubmitAnalysisResult {
  success: boolean;
  submissionId: string | null;
  error: string | null;
  qualified: boolean | null;
  dqReason: string | null;
  leadStatus: string | null;
  dollarEstimateDisplay: string | null;
  pdfDownloadUrl: string | null;
}

type WorkflowError = { stage: string; error: string; timestamp: string };

// ── Main action ───────────────────────────────────────────────────────────────

export async function submitAnalysis(payload: AnalyzerFormPayload): Promise<SubmitAnalysisResult> {
  const workflowErrors: WorkflowError[] = [];

  // ── Step 1: Capture IP (best effort) + assemble tracking context ────────────
  let ipAddress: string | null = null;
  try {
    const hdrs = await headers();
    ipAddress =
      hdrs.get('x-forwarded-for')?.split(',')[0]?.trim() ??
      hdrs.get('x-real-ip') ??
      null;
  } catch { /* best effort — not required */ }

  const trackingContext: TrackingContext = {
    fbp:             payload.fbp             ?? null,
    fbc:             payload.fbc             ?? null,
    eventId:         payload.event_id        ?? null,
    clientUserAgent: payload.client_user_agent ?? null,
    clientIpAddress: ipAddress,
  };

  // ── Step 2: Initial DB save ──────────────────────────────────────────────────
  let submissionId: string;
  try {
    const created = await db.submission.create({
      data: {
        restaurantName:      payload.restaurant_name,
        website:             payload.website,
        state:               payload.state,
        conceptType:         payload.concept_type,
        locations:           payload.locations,
        annualFoodSpend:     payload.annual_food_spend,
        distributorType:     payload.distributor_type,
        procurementStrategy: payload.procurement_strategy,
        topSkus:             payload.top_skus,
        fullName:            payload.full_name,
        email:               payload.email,
        phone:               payload.phone ?? null,
        utmSource:           payload.utm_source ?? null,
        utmMedium:           payload.utm_medium ?? null,
        utmCampaign:         payload.utm_campaign ?? null,
        utmContent:          payload.utm_content ?? null,
        utmTerm:             payload.utm_term ?? null,
        ipAddress,
        workflowStage:       'submitted',
        workflowStatus:      'in_progress' as WorkflowStatus,
      },
      select: { id: true },
    });
    submissionId = created.id;
  } catch (err) {
    console.error('[submitAnalysis] DB create failed:', err);
    return fail(null, 'Failed to save submission. Please try again.');
  }

  // patch — update DB fields; non-fatal on error
  async function patch(data: Prisma.SubmissionUpdateInput) {
    try {
      await db.submission.update({ where: { id: submissionId }, data });
    } catch (err) {
      workflowErrors.push({ stage: 'db_update', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() });
    }
  }

  // ── Step 3: Website validation ───────────────────────────────────────────────
  let validationResult: Awaited<ReturnType<typeof runValidation>>;
  try {
    validationResult = await runValidation({
      website:        payload.website,
      restaurantName: payload.restaurant_name,
      state:          payload.state,
      conceptType:    payload.concept_type,
    });
    await patch({
      websiteValidationResult: validationResult as unknown as Prisma.InputJsonValue,
      finalDecision:           validationResult.finalDecision as FinalDecision,
      countryEligibility:      validationResult.countryEligibility as CountryEligibility,
      locationConfidenceScore: validationResult.locationConfidenceScore,
      internalFlags:           validationResult.internalFlags as Prisma.InputJsonValue,
      manualReviewRequired:    validationResult.manualReviewRequired,
      manualReviewStatus:      validationResult.manualReviewRequired ? ('pending' as ManualReviewStatus) : undefined,
      workflowStage:           'validated',
    });
  } catch (err) {
    console.error('[submitAnalysis] validation failed:', err);
    await patch({ workflowStage: 'failed', workflowStatus: 'failed' as WorkflowStatus, workflowErrors: workflowErrors as unknown as Prisma.InputJsonValue });
    return fail(submissionId, 'Analysis failed. Please try again.');
  }

  // ── Step 4: Qualification ────────────────────────────────────────────────────
  let qualResult: QualifyLeadResult;
  let effectiveQualified: boolean;
  let effectiveDqReason: DqReason | null;
  try {
    qualResult = qualifyLead({
      restaurantName:      payload.restaurant_name,
      annualFoodSpend:     payload.annual_food_spend,
      locations:           payload.locations,
      distributorType:     payload.distributor_type,
      procurementStrategy: payload.procurement_strategy,
      topSkus:             payload.top_skus,
      validation: {
        finalDecision:             validationResult.finalDecision,
        websiteReachabilityStatus: validationResult.websiteReachabilityStatus,
        internalFlags:             validationResult.internalFlags,
      },
    });

    // Effective DB values: routing layer (assignLeadStatus) treats clear_non_fit
    // as DQ regardless of spend. Persist the routing-consistent values so the DB
    // record accurately reflects the lead's actual outcome.
    const isClearNonFit = validationResult.finalDecision === 'clear_non_fit';
    effectiveQualified = qualResult.qualified && !isClearNonFit;
    effectiveDqReason = effectiveQualified
      ? null
      : (isClearNonFit && qualResult.qualified
          ? ('clear_non_fit' as DqReason)
          : (qualResult.dqReason as DqReason));

    await patch({
      qualified:          effectiveQualified,
      dqReason:           effectiveDqReason,
      spendBucket:        qualResult.spendBucket,
      bucketMidpoint:     qualResult.bucketMidpoint,
      finalPct:           qualResult.finalPct,
      dollarEstimate:     qualResult.dollarEstimate,
      caseStudy:          qualResult.caseStudy,
      year1:              qualResult.year1,
      year2:              qualResult.year2,
      year3:              qualResult.year3,
      year4:              qualResult.year4,
      year5:              qualResult.year5,
      projectionHeights:  qualResult.projectionHeights
        ? (qualResult.projectionHeights as unknown as Prisma.InputJsonValue)
        : undefined,
      workflowStage:      'qualified',
    });
  } catch (err) {
    console.error('[submitAnalysis] qualification failed:', err);
    await patch({ workflowStage: 'failed', workflowStatus: 'failed' as WorkflowStatus, workflowErrors: workflowErrors as unknown as Prisma.InputJsonValue });
    return fail(submissionId, 'Analysis failed. Please try again.');
  }

  // ── Steps 5–6: Early exit — DQ, manual review, and clear_non_fit ─────────────
  // needsAiAndPdf() is the authoritative routing predicate from the routing layer.
  // It returns false for any path that should skip AI + PDF (DQ, manual review, clear_non_fit).
  if (!needsAiAndPdf({
    finalDecision:        validationResult.finalDecision,
    qualified:            qualResult.qualified,
    manualReviewRequired: validationResult.manualReviewRequired,
    workflowFailed:       false,
  })) {
    const status = assignLeadStatus({
      finalDecision:        validationResult.finalDecision,
      countryEligibility:   validationResult.countryEligibility,
      qualified:            effectiveQualified,
      dqReason:             effectiveDqReason,
      pdfMode:              null,
      pdfStatus:            null,
      pdfDownloadUrl:       null,
      manualReviewRequired: validationResult.manualReviewRequired,
      workflowFailed:       false,
    });
    return syncAndReturn({
      submissionId,
      status,
      workflowErrors,
      responseQualified:      effectiveQualified,
      responseDqReason:       effectiveDqReason,
      responseDollarEstimate: null,
      trackingContext,
    });
  }

  // ── Qualified path — return early, run AI + PDF + sync in background ──────────

  const formContext = {
    restaurantName:      payload.restaurant_name,
    website:             payload.website,
    state:               payload.state,
    conceptType:         payload.concept_type,
    locations:           payload.locations,
    annualFoodSpend:     payload.annual_food_spend,
    distributorType:     payload.distributor_type,
    procurementStrategy: payload.procurement_strategy,
    topSkus:             payload.top_skus,
  };
  const aiInput = buildResearchInput(formContext, validationResult, qualResult);

  // Preliminary lead status — pdfMode/pdfStatus null until background completes.
  // Returns QUALIFIED_PDF_PENDING from the routing layer.
  const prelimStatus = assignLeadStatus({
    finalDecision:        validationResult.finalDecision,
    countryEligibility:   validationResult.countryEligibility,
    qualified:            true,
    dqReason:             null,
    pdfMode:              null,
    pdfStatus:            null,
    pdfDownloadUrl:       null,
    manualReviewRequired: false,
    workflowFailed:       false,
  });

  await patch({
    workflowStage:  'qualification_complete',
    workflowStatus: 'in_progress' as WorkflowStatus,
  });

  // ── Background: steps 7–10 via waitUntil (runs after response is sent) ────────
  waitUntil((async () => {
    try {
    console.log('[FSIQ DEBUG] waitUntil background started for submission:', submissionId);
    // ── Step 7: AI Research ────────────────────────────────────────────────────
    let researchResult: AiResearchResult;
    try {
      researchResult = await runAiResearch(aiInput);
    } catch (err) {
      workflowErrors.push({ stage: 'ai_research', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() });
      researchResult = { ...buildFallbackResearch(aiInput), aiUsed: false, aiFallbackUsed: true, aiModel: null, aiError: err instanceof Error ? err.message : String(err), generatedAt: new Date().toISOString() };
    }
    await patch({
      logoUrl:         researchResult.logoUrl,
      businessSummary: researchResult.businessSummary,
      conceptSignals:  researchResult.conceptSignals as Prisma.InputJsonValue,
      workflowStage:   'ai_research',
    });

    // 1-second delay between Claude calls (Phase 5 spec: orchestrator's responsibility)
    await new Promise((r) => setTimeout(r, 1000));

    // ── Step 8: AI Narrative ───────────────────────────────────────────────────
    let narrativeResult: AiNarrativeResult;
    try {
      narrativeResult = await generateAiNarrative(aiInput);
    } catch (err) {
      workflowErrors.push({ stage: 'ai_narrative', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() });
      narrativeResult = { ...buildFallbackNarrative(aiInput), aiUsed: false, aiFallbackUsed: true, aiModel: null, aiError: err instanceof Error ? err.message : String(err), generatedAt: new Date().toISOString() };
    }
    await patch({
      narrativeDistributor: narrativeResult.narrativeDistributor,
      narrativeProcurement: narrativeResult.narrativeProcurement,
      narrativeSku:         narrativeResult.narrativeSku,
      workflowStage:        'ai_narrative',
    });

    // ── Step 9: PDF generation ─────────────────────────────────────────────────
    const pdfModeDecision = determinePdfMode(
      validationResult.finalDecision,
      validationResult.countryEligibility,
      true,
    );

    let pdfResult: GeneratePdfResult;
    if (pdfModeDecision.mode === 'skip') {
      pdfResult = { pdfStatus: 'skipped', pdfMode: null, pdfMonkeyDocumentId: null, pdfDownloadUrl: null, pdfError: `PDF skipped: ${pdfModeDecision.reason}`, pdfRetryCount: 0 };
    } else {
      try {
        pdfResult = await generatePdf({
          restaurantName:        payload.restaurant_name,
          fullName:              payload.full_name,
          conceptType:           payload.concept_type,
          locations:             payload.locations,
          annualSpend:           qualResult.annualSpend,
          spendBucket:           qualResult.spendBucket,
          finalPctDisplay:       qualResult.finalPctDisplay,
          dollarEstimateDisplay: qualResult.dollarEstimateDisplay,
          dollarEstimate:        qualResult.dollarEstimate,
          caseStudy:             qualResult.caseStudy,
          year1:                 qualResult.year1,
          year2:                 qualResult.year2,
          year3:                 qualResult.year3,
          year4:                 qualResult.year4,
          year5:                 qualResult.year5,
          projectionHeights:     qualResult.projectionHeights as GeneratePdfInput['projectionHeights'],
          logoUrl:               researchResult.logoUrl,
          businessSummary:       researchResult.businessSummary,
          narrativeDistributor:  narrativeResult.narrativeDistributor,
          narrativeProcurement:  narrativeResult.narrativeProcurement,
          narrativeSku:          narrativeResult.narrativeSku,
          mode:                  pdfModeDecision.mode,
        });
      } catch (err) {
        workflowErrors.push({ stage: 'pdf_generation', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() });
        pdfResult = { pdfStatus: 'error', pdfMode: pdfModeDecision.mode, pdfMonkeyDocumentId: null, pdfDownloadUrl: null, pdfError: err instanceof Error ? err.message : String(err), pdfRetryCount: 0 };
      }
    }
    await patch({
      pdfMode:             pdfResult.pdfMode as PdfMode | null,
      pdfStatus:           pdfResult.pdfStatus as PdfStatus,
      pdfMonkeyDocumentId: pdfResult.pdfMonkeyDocumentId,
      pdfDownloadUrl:      pdfResult.pdfDownloadUrl,
      pdfError:            pdfResult.pdfError,
      pdfRetryCount:       pdfResult.pdfRetryCount,
      workflowStage:       'pdf_generation',
    });

    // ── Step 10: Assign final lead status + GHL sync + Meta CAPI ───────────────
    const finalStatus = assignLeadStatus({
      finalDecision:        validationResult.finalDecision,
      countryEligibility:   validationResult.countryEligibility,
      qualified:            true,
      dqReason:             null,
      pdfMode:              pdfResult.pdfMode,
      pdfStatus:            pdfResult.pdfStatus,
      pdfDownloadUrl:       pdfResult.pdfDownloadUrl,
      manualReviewRequired: false,
      workflowFailed:       false,
    });

    // Re-fetch fresh record for GHL payload builder and CAPI user data
    const fresh = await db.submission.findUnique({ where: { id: submissionId } }).catch(() => null);

    let crmSyncStatus: 'synced' | 'error' = 'error';
    let ghlContactId: string | null = null;
    let crmSyncError: string | null = 'Record not found for GHL sync';

    if (fresh) {
      console.log('[FSIQ DEBUG] Starting GHL sync for submission:', submissionId);
      const ghlPayload = buildGhlPayload(fresh, finalStatus.leadStatus, finalStatus.communicationRoute, finalStatus.tags);
      const crmResult = await syncToGhl(ghlPayload);
      crmSyncStatus = crmResult.crmSyncStatus;
      ghlContactId  = crmResult.ghlContactId;
      crmSyncError  = crmResult.crmSyncError;
    }

    let metaResult: { metaStatus: 'fired' | 'error' | 'skipped'; metaEventIds: string[]; metaError: string | null } = {
      metaStatus: 'skipped', metaEventIds: [], metaError: 'Record not found for CAPI',
    };

    if (fresh) {
      const capiEvents = [buildLeadEvent(fresh, trackingContext)];

      const isQualifiedPdfReady =
        finalStatus.leadStatus === LEAD_STATUS.QUALIFIED_FULL_PDF_READY ||
        finalStatus.leadStatus === LEAD_STATUS.QUALIFIED_CONSERVATIVE_PDF_READY;

      if (isQualifiedPdfReady) {
        capiEvents.push(buildQualifiedLeadEvent(fresh, trackingContext));
      }

      metaResult = await sendToMetaCapi(capiEvents).catch((err) => ({
        metaStatus:   'error' as const,
        metaEventIds: [],
        metaError:    err instanceof Error ? err.message : String(err),
      }));
    }

    await db.submission.update({
      where: { id: submissionId },
      data: {
        crmSyncStatus:  crmSyncStatus as CrmSyncStatus,
        ghlContactId,
        crmSyncError,
        crmTags:        finalStatus.tags as unknown as Prisma.InputJsonValue,
        metaStatus:     metaResult.metaStatus,
        metaEventIds:   metaResult.metaEventIds as unknown as Prisma.InputJsonValue,
        metaError:      metaResult.metaError,
        workflowStage:  'complete',
        workflowStatus: (workflowErrors.length > 0 || crmSyncStatus === 'error')
          ? 'partial' as WorkflowStatus
          : 'complete' as WorkflowStatus,
        workflowErrors: workflowErrors.length > 0
          ? (workflowErrors as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    }).catch(() => {});
    } catch (unexpectedErr) {
      console.error('[submitAnalysis] background pipeline unexpected error:', unexpectedErr);
      await db.submission.update({
        where: { id: submissionId },
        data: { workflowStage: 'complete', workflowStatus: 'partial' as WorkflowStatus },
      }).catch(() => {});
    }
  })());

  // Return to client immediately — background continues via waitUntil
  return {
    success:               true,
    submissionId,
    error:                 null,
    qualified:             true,
    dqReason:              null,
    leadStatus:            prelimStatus.leadStatus,
    dollarEstimateDisplay: qualResult.dollarEstimateDisplay,
    pdfDownloadUrl:        null,
  };
}

// ── syncAndReturn: GHL sync + Meta CAPI + final DB update + client response ────
// Used only by the DQ / manual-review early-exit path (steps 5–6 above).

async function syncAndReturn({
  submissionId,
  status,
  workflowErrors,
  responseQualified,
  responseDqReason,
  responseDollarEstimate,
  trackingContext,
}: {
  submissionId: string;
  status: AssignLeadStatusResult;
  workflowErrors: WorkflowError[];
  responseQualified: boolean;
  responseDqReason: string | null;
  responseDollarEstimate: string | null;
  trackingContext: TrackingContext;
}): Promise<SubmitAnalysisResult> {
  // Fetch fresh record for GHL payload builder and CAPI user data
  const fresh = await db.submission.findUnique({ where: { id: submissionId } }).catch(() => null);

  let crmSyncStatus: 'synced' | 'error' = 'error';
  let ghlContactId: string | null = null;
  let crmSyncError: string | null = 'Record not found for GHL sync';

  if (fresh) {
    const ghlPayload = buildGhlPayload(fresh, status.leadStatus, status.communicationRoute, status.tags);
    const crmResult = await syncToGhl(ghlPayload);
    crmSyncStatus = crmResult.crmSyncStatus;
    ghlContactId  = crmResult.ghlContactId;
    crmSyncError  = crmResult.crmSyncError;
  }

  // ── Meta CAPI — non-fatal; fires after GHL sync ───────────────────────────
  let metaResult: { metaStatus: 'fired' | 'error' | 'skipped'; metaEventIds: string[]; metaError: string | null } = {
    metaStatus: 'skipped', metaEventIds: [], metaError: 'Record not found for CAPI',
  };

  if (fresh) {
    const capiEvents = [buildLeadEvent(fresh, trackingContext)];

    // QualifiedLead fires only for PDF-ready qualified leads — not on the DQ path
    const isQualifiedPdfReady =
      status.leadStatus === LEAD_STATUS.QUALIFIED_FULL_PDF_READY ||
      status.leadStatus === LEAD_STATUS.QUALIFIED_CONSERVATIVE_PDF_READY;

    if (isQualifiedPdfReady) {
      capiEvents.push(buildQualifiedLeadEvent(fresh, trackingContext));
    }

    metaResult = await sendToMetaCapi(capiEvents).catch((err) => ({
      metaStatus:   'error' as const,
      metaEventIds: [],
      metaError:    err instanceof Error ? err.message : String(err),
    }));
  }

  await db.submission.update({
    where: { id: submissionId },
    data: {
      crmSyncStatus:  crmSyncStatus as CrmSyncStatus,
      ghlContactId,
      crmSyncError,
      crmTags:        status.tags as unknown as Prisma.InputJsonValue,
      metaStatus:     metaResult.metaStatus,
      metaEventIds:   metaResult.metaEventIds as unknown as Prisma.InputJsonValue,
      metaError:      metaResult.metaError,
      workflowStage:  'complete',
      workflowStatus: (workflowErrors.length > 0 || crmSyncStatus === 'error')
        ? 'partial' as WorkflowStatus
        : 'complete' as WorkflowStatus,
      workflowErrors: workflowErrors.length > 0
        ? (workflowErrors as unknown as Prisma.InputJsonValue)
        : undefined,
    },
  }).catch(() => {});

  return {
    success:               true,
    submissionId,
    error:                 null,
    qualified:             responseQualified,
    dqReason:              responseDqReason,
    leadStatus:            status.leadStatus,
    dollarEstimateDisplay: responseDollarEstimate,
    pdfDownloadUrl:        null,
  };
}

function fail(submissionId: string | null, error: string): SubmitAnalysisResult {
  return { success: false, submissionId, error, qualified: null, dqReason: null, leadStatus: null, dollarEstimateDisplay: null, pdfDownloadUrl: null };
}
