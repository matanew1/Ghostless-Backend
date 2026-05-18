DROP INDEX IF EXISTS "users_apple_id_key";

ALTER TABLE "users" DROP COLUMN IF EXISTS "apple_id";
