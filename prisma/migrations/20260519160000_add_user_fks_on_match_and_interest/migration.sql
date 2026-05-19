-- Defensive cleanup: drop any orphan rows so the FK constraints will succeed.
DELETE FROM "match_interests"
WHERE "from_user_id" NOT IN (SELECT id FROM "users")
   OR "to_user_id"   NOT IN (SELECT id FROM "users");

DELETE FROM "matches"
WHERE "user_a_id" NOT IN (SELECT id FROM "users")
   OR "user_b_id" NOT IN (SELECT id FROM "users");

-- Match.userA / userB
ALTER TABLE "matches"
  ADD CONSTRAINT "matches_user_a_id_fkey"
  FOREIGN KEY ("user_a_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "matches"
  ADD CONSTRAINT "matches_user_b_id_fkey"
  FOREIGN KEY ("user_b_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MatchInterest.fromUser / toUser
ALTER TABLE "match_interests"
  ADD CONSTRAINT "match_interests_from_user_id_fkey"
  FOREIGN KEY ("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "match_interests"
  ADD CONSTRAINT "match_interests_to_user_id_fkey"
  FOREIGN KEY ("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
