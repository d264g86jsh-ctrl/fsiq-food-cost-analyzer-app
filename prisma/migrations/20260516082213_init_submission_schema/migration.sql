-- CreateEnum
CREATE TYPE "FinalDecision" AS ENUM ('verified_restaurant', 'plausible_unverified', 'clear_non_fit', 'national_chain', 'invalid_website');

-- CreateEnum
CREATE TYPE "CountryEligibility" AS ENUM ('us_verified', 'likely_us', 'non_us', 'unknown');

-- CreateEnum
CREATE TYPE "DqReason" AS ENUM ('national_chain', 'invalid_website', 'below_threshold', 'below_minimum', 'clear_non_fit');

-- CreateEnum
CREATE TYPE "PdfMode" AS ENUM ('full', 'conservative');

-- CreateEnum
CREATE TYPE "PdfStatus" AS ENUM ('pending', 'generating', 'complete', 'error', 'skipped');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('pending', 'sent', 'error', 'skipped');

-- CreateEnum
CREATE TYPE "CrmSyncStatus" AS ENUM ('pending', 'synced', 'error');

-- CreateEnum
CREATE TYPE "WorkflowStatus" AS ENUM ('pending', 'in_progress', 'complete', 'failed', 'partial');

-- CreateEnum
CREATE TYPE "ManualReviewStatus" AS ENUM ('not_required', 'pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "Submission" (
    "id" TEXT NOT NULL,
    "restaurantName" TEXT NOT NULL,
    "website" TEXT NOT NULL,
    "zipCode" TEXT NOT NULL,
    "conceptType" TEXT NOT NULL,
    "locations" TEXT NOT NULL,
    "annualFoodSpend" TEXT NOT NULL,
    "distributorType" TEXT NOT NULL,
    "procurementStrategy" TEXT NOT NULL,
    "topSkus" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "ipAddress" TEXT,
    "websiteValidationResult" JSONB,
    "finalDecision" "FinalDecision",
    "countryEligibility" "CountryEligibility",
    "locationConfidenceScore" DOUBLE PRECISION,
    "internalFlags" JSONB,
    "manualReviewRequired" BOOLEAN NOT NULL DEFAULT false,
    "qualified" BOOLEAN,
    "dqReason" "DqReason",
    "spendBucket" TEXT,
    "bucketMidpoint" INTEGER,
    "finalPct" DOUBLE PRECISION,
    "dollarEstimate" INTEGER,
    "caseStudy" TEXT,
    "year1" INTEGER,
    "year2" INTEGER,
    "year3" INTEGER,
    "year4" INTEGER,
    "year5" INTEGER,
    "projectionHeights" JSONB,
    "logoUrl" TEXT,
    "businessSummary" TEXT,
    "conceptSignals" JSONB,
    "narrativeDistributor" TEXT,
    "narrativeProcurement" TEXT,
    "narrativeSku" TEXT,
    "pdfMode" "PdfMode",
    "pdfStatus" "PdfStatus",
    "pdfMonkeyDocumentId" TEXT,
    "pdfDownloadUrl" TEXT,
    "pdfError" TEXT,
    "pdfRetryCount" INTEGER NOT NULL DEFAULT 0,
    "emailStatus" "EmailStatus",
    "emailVariant" TEXT,
    "emailSentAt" TIMESTAMP(3),
    "emailError" TEXT,
    "emailRetryCount" INTEGER NOT NULL DEFAULT 0,
    "metaStatus" TEXT,
    "metaEventIds" JSONB,
    "metaError" TEXT,
    "crmSyncStatus" "CrmSyncStatus",
    "ghlContactId" TEXT,
    "crmSyncError" TEXT,
    "crmSyncRetryCount" INTEGER NOT NULL DEFAULT 0,
    "crmTags" JSONB,
    "manualReviewStatus" "ManualReviewStatus" NOT NULL DEFAULT 'not_required',
    "manualReviewNotes" TEXT,
    "manualReviewedAt" TIMESTAMP(3),
    "workflowStage" TEXT,
    "workflowStatus" "WorkflowStatus",
    "workflowErrors" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Submission_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Submission_email_idx" ON "Submission"("email");

-- CreateIndex
CREATE INDEX "Submission_restaurantName_idx" ON "Submission"("restaurantName");

-- CreateIndex
CREATE INDEX "Submission_finalDecision_idx" ON "Submission"("finalDecision");

-- CreateIndex
CREATE INDEX "Submission_countryEligibility_idx" ON "Submission"("countryEligibility");

-- CreateIndex
CREATE INDEX "Submission_qualified_idx" ON "Submission"("qualified");

-- CreateIndex
CREATE INDEX "Submission_manualReviewRequired_idx" ON "Submission"("manualReviewRequired");

-- CreateIndex
CREATE INDEX "Submission_pdfStatus_idx" ON "Submission"("pdfStatus");

-- CreateIndex
CREATE INDEX "Submission_emailStatus_idx" ON "Submission"("emailStatus");

-- CreateIndex
CREATE INDEX "Submission_crmSyncStatus_idx" ON "Submission"("crmSyncStatus");

-- CreateIndex
CREATE INDEX "Submission_createdAt_idx" ON "Submission"("createdAt");
