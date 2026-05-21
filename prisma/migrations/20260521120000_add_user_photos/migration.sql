-- Add optional gallery photos column to user_profiles.
-- Avatar (avatar_url) remains the main photo; this stores up to 5 additional URLs.
ALTER TABLE "user_profiles"
  ADD COLUMN "photos" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
