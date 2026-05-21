-- Change default zone for new users from UNMAPPED to STEADY (center of the spectrum).
-- Migrate any existing UNMAPPED rows so they participate in zone-filtered discovery.

ALTER TABLE "user_metrics" ALTER COLUMN "zone" SET DEFAULT 'STEADY';

UPDATE "user_metrics" SET "zone" = 'STEADY' WHERE "zone" = 'UNMAPPED';
