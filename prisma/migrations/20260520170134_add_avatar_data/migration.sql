-- DropIndex
DROP INDEX "user_profiles_gender_idx";

-- AlterTable
ALTER TABLE "user_profiles" ADD COLUMN     "avatar_data" TEXT;
