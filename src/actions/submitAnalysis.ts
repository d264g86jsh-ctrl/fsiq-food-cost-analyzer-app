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
import { assignLeadStatus, needsAiAndPdf } from '@/lib/crm/assign-lead-status';
import { buildGhlPayload } from '@/lib/crm/build-ghl-payload';
import { syncToGhl } from '@/lib/crm/ghl';
import { buildLeadEvent, buildQualifiedLeadEvent } from '@/lib/meta/meta-events';
import { sendToMetaCapi } from '@/lib/meta/meta-capi';
import { LEAD_STATUS } from '@/lib/crm/lead-status';
import type { TrackingContext } from '@/lib/meta/meta-types';
import type { AnalyzerFormPayload } from '@/lib/analyzer/form-types';
import { syncAndReturn } from '@/lib/workflow/sync-and-return';
import { failResult, pipelineLog } from '@/lib/workflow/helpers';
import { withRetry } from '@/lib/workflow/retry';
import type { SubmitAnalysisResult, WorkflowError } from '@/lib/workflow/types';

export type { SubmitAnalysisResult };

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

  // ── Step 1b: Server-side input validation ────────────────────────────────────
  if (!payload.email?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email.trim())) {
    return fail(null, 'Invalid email address.');
  }
  if (!payload.full_name?.trim() || payload.full_name.trim().length > 300) {
    return fail(null, 'Invalid name.');
  }
  if (!payload.restaurant_name?.trim() || payload.restaurant_name.trim().length > 300) {
    return fail(null, 'Invalid restaurant name.');
  }
  if (payload.phone && payload.phone.trim().length > 0 && payload.phone.replace(/\D/g, '').length < 7) {
    return fail(null, 'Invalid phone number.');
  }
  if (!payload.website?.trim()) {
    return fail(null, 'Website is required.');
  }

  // ── Step 1c: Idempotency key — deterministic dedup within 5-min bucket ───────
  // Hash of normalized(email) + normalized(website) + floor(now / 5min).
  // If a matching key already exists we return the existing submission rather
  // than creating a duplicate (double-click, client retry, etc.).
  const idempotencyKey = await (async () => {
    try {
      const bucket = Math.floor(Date.now() / (5 * 60 * 1000));
      const raw = `${payload.email.toLowerCase().trim()}|${payload.website.toLowerCase().trim()}|${bucket}`;
      const encoded = new TextEncoder().encode(raw);
      const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
      return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
      return null;
    }
  })();

  if (idempotencyKey) {
    try {
      const existing = await db.submission.findUnique({
        where: { idempotencyKey },
        select: { id: true, qualified: true, dqReason: true, dollarEstimate: true, pdfDownloadUrl: true },
      });
      if (existing) {
        pipelineLog('info', existing.id, 'idempotency', 'Duplicate submission detected — returning existing');
        return {
          success:               true,
          submissionId:          existing.id,
          error:                 null,
          qualified:             existing.qualified,
          dqReason:              existing.dqReason,
          leadStatus:            null,
          dollarEstimateDisplay: existing.dollarEstimate ? `$${Math.round(existing.dollarEstimate).toLocaleString()}` : null,
          pdfDownloadUrl:        existing.pdfDownloadUrl,
        };
      }
    } catch { /* non-fatal — proceed without dedup if DB check fails */ }
  }

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
        idempotencyKey:      idempotencyKey ?? undefined,
        workflowStage:       'submitted',
        workflowStatus:      'in_progress' as WorkflowStatus,
      },
      select: { id: true },
    });
    submissionId = created.id;
  } catch (err) {
    pipelineLog('error', null, 'db_create', 'DB submission create failed', { error: err instanceof Error ? err.message : String(err) });
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
    pipelineLog('error', submissionId, 'validation', 'Website validation failed', { error: err instanceof Error ? err.message : String(err) });
    await patch({ workflowStage: 'failed', workflowStatus: 'failed' as WorkflowStatus, workflowFailReason: 'validation_failed', workflowErrors: workflowErrors as unknown as Prisma.InputJsonValue });
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
    pipelineLog('error', submissionId, 'qualification', 'Lead qualification failed', { error: err instanceof Error ? err.message : String(err) });
    await patch({ workflowStage: 'failed', workflowStatus: 'failed' as WorkflowStatus, workflowFailReason: 'qualification_failed', workflowErrors: workflowErrors as unknown as Prisma.InputJsonValue });
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
    pipelineLog('info', submissionId, 'background_start', 'Background pipeline started');
    // ── Step 7: AI Research ────────────────────────────────────────────────────
    let researchResult: AiResearchResult;
    try {
      researchResult = await runAiResearch(aiInput);
    } catch (err) {
      workflowErrors.push({ stage: 'ai_research', error: err instanceof Error ? err.message : String(err), timestamp: new Date().toISOString() });
      researchResult = { ...buildFallbackResearch(aiInput), aiUsed: false, aiFallbackUsed: true, aiModel: null, aiError: err instanceof Error ? err.message : String(err), generatedAt: new Date().toISOString() };
    }
    await patch({
      logoUrl:                researchResult.logoUrl,
      businessSummary:        researchResult.businessSummary,
      conceptSignals:         researchResult.conceptSignals as Prisma.InputJsonValue,
      workflowStage:          'ai_research',
      aiResearchCompletedAt:  new Date(),
      ...(researchResult.aiFallbackUsed ? { workflowFailReason: 'ai_research_failed' } : {}),
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
      narrativeDistributor:   narrativeResult.narrativeDistributor,
      narrativeProcurement:   narrativeResult.narrativeProcurement,
      narrativeSku:           narrativeResult.narrativeSku,
      workflowStage:          'ai_narrative',
      aiNarrativeCompletedAt: new Date(),
      ...(narrativeResult.aiFallbackUsed ? { workflowFailReason: 'ai_narrative_failed' } : {}),
    });

    // ── Step 9: PDF generation ─────────────────────────────────────────────────
    const pdfModeDecision = determinePdfMode(
      validationResult.finalDecision,
      validationResult.countryEligibility,
      true,
    );

    let pdfResult: GeneratePdfResult;
    if (pdfModeDecision.mode === 'skip') {
      pdfResult = { pdfStatus: 'skipped', pdfMode: null, pdfMonkeyDocumentId: null, pdfDownloadUrl: null, pdfError: `PDF skipped: ${pdfModeDecision.reason}`, pdfRetryCount: 0, pdfUrlType: null };
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
        pdfResult = { pdfStatus: 'error', pdfMode: pdfModeDecision.mode, pdfMonkeyDocumentId: null, pdfDownloadUrl: null, pdfError: err instanceof Error ? err.message : String(err), pdfRetryCount: 0, pdfUrlType: null };
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
      pdfGeneratedAt:      new Date(),
      ...(pdfResult.pdfStatus === 'error' ? { workflowFailReason: 'pdf_generation_failed' } : {}),
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
      pipelineLog('info', submissionId, 'crm_sync', 'Starting GHL sync');
      const ghlPayload = buildGhlPayload(fresh, finalStatus.leadStatus, finalStatus.communicationRoute, finalStatus.tags);
      const crmResult = await withRetry(
        () => syncToGhl(ghlPayload),
        {
          maxAttempts: 3,
          backoffMs: 1000,
          onRetry: (attempt, err) => pipelineLog('warn', submissionId, 'crm_sync', `GHL sync retry ${attempt}`, { error: err instanceof Error ? err.message : String(err) }),
        },
      );
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

      metaResult = await withRetry(
        () => sendToMetaCapi(capiEvents),
        {
          maxAttempts: 3,
          backoffMs: 500,
          onRetry: (attempt, err) => pipelineLog('warn', submissionId, 'meta_capi', `Meta CAPI retry ${attempt}`, { error: err instanceof Error ? err.message : String(err) }),
        },
      ).catch((err) => ({
        metaStatus:   'error' as const,
        metaEventIds: [],
        metaError:    err instanceof Error ? err.message : String(err),
      }));
    }

    const finalFailReason =
      crmSyncStatus === 'error' ? 'crm_sync_failed' :
      metaResult.metaStatus === 'error' ? 'meta_capi_failed' :
      workflowErrors.length > 0 ? workflowErrors[workflowErrors.length - 1].stage + '_failed' :
      null;

    await db.submission.update({
      where: { id: submissionId },
      data: {
        crmSyncStatus:     crmSyncStatus as CrmSyncStatus,
        ghlContactId,
        crmSyncError,
        crmTags:           finalStatus.tags as unknown as Prisma.InputJsonValue,
        metaStatus:        metaResult.metaStatus,
        metaEventIds:      metaResult.metaEventIds as unknown as Prisma.InputJsonValue,
        metaError:         metaResult.metaError,
        workflowStage:     'complete',
        workflowStatus:    (workflowErrors.length > 0 || crmSyncStatus === 'error')
          ? 'partial' as WorkflowStatus
          : 'complete' as WorkflowStatus,
        workflowFailReason: finalFailReason,
        workflowErrors:    workflowErrors.length > 0
          ? (workflowErrors as unknown as Prisma.InputJsonValue)
          : undefined,
      },
    }).catch(() => {});
    } catch (unexpectedErr) {
      pipelineLog('error', submissionId, 'background_pipeline', 'Unexpected error in background pipeline', { error: unexpectedErr instanceof Error ? unexpectedErr.message : String(unexpectedErr) });
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

const fail = failResult;
