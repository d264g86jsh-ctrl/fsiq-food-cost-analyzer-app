-- Add white-recolored logo data URI column (step 7.5 background pipeline output).
-- Null = not processed (opaque logo, blob-guard reject, SVG, conservative, or any failure).
-- PDF generation path uses this if non-null, otherwise falls back to original logoUrl.
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "logoProcessedDataUri" TEXT;
