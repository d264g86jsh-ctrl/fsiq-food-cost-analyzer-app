-- Add phoneRaw column to preserve user-entered phone for GHL fsiq_phone_raw custom field.
-- phone stores the normalized value; phoneRaw stores the trimmed raw input.
-- All nullable — existing rows get NULL automatically.

ALTER TABLE "Submission" ADD COLUMN IF NOT EXISTS "phoneRaw" TEXT;
