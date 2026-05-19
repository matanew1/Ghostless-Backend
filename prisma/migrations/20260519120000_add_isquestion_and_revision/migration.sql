-- Add is_question to messages (backfill: literal '?' present in content)
ALTER TABLE "messages" ADD COLUMN "is_question" BOOLEAN NOT NULL DEFAULT false;
UPDATE "messages" SET "is_question" = true WHERE "content" LIKE '%?%';

-- Add revision to user_metrics for optimistic concurrency control
ALTER TABLE "user_metrics" ADD COLUMN "revision" INTEGER NOT NULL DEFAULT 0;
