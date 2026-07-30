-- AlterTable
ALTER TABLE "Submission" ADD COLUMN "workflowFailReason" TEXT,
ADD COLUMN "aiResearchCompletedAt" TIMESTAMP(3),
ADD COLUMN "aiNarrativeCompletedAt" TIMESTAMP(3),
ADD COLUMN "pdfGeneratedAt" TIMESTAMP(3),
ADD COLUMN "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Submission_idempotencyKey_key" ON "Submission"("idempotencyKey");
