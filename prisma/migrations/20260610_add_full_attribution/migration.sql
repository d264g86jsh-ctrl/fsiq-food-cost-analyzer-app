-- Extend attribution columns: utm_id, fbadid, referrer.
-- All nullable — existing rows unaffected.

ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "utmId"  TEXT;
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "fbadid" TEXT;
ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "referrer" TEXT;
