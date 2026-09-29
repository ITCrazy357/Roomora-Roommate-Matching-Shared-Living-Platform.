CREATE UNIQUE INDEX "house_members_one_active_house_per_user"
ON "house_members" ("user_id")
WHERE "left_at" IS NULL;
