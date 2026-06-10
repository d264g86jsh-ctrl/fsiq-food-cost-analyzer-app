-- Add traffic attribution fields to Submission table.
-- All columns are nullable — existing rows get NULL automatically.

ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "fbclid"         TEXT;
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "leadSource"     TEXT;
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "fbp"            TEXT;
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "fbc"            TEXT;
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "landingPageUrl" TEXT;
