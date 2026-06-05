-- AddColumn: pdfCachedUrl and pdfCachedAt to Submission table
-- Run via Supabase SQL editor if prisma migrate dev hangs (PgBouncer limitation)

ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "pdfCachedUrl" TEXT;
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "pdfCachedAt" TIMESTAMP(3);
