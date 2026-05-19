-- Gender enum and per-profile preference fields for 1:1 mutual matching.
CREATE TYPE "Gender" AS ENUM ('MALE', 'FEMALE', 'NON_BINARY', 'OTHER');

ALTER TABLE "user_profiles"
  ADD COLUMN "gender" "Gender",
  ADD COLUMN "seeking_genders" "Gender"[] NOT NULL DEFAULT ARRAY[]::"Gender"[];

-- Index used by discovery's mutual-preference filter (caller side: my gender ∈ their seeking).
CREATE INDEX "user_profiles_gender_idx" ON "user_profiles"("gender");
