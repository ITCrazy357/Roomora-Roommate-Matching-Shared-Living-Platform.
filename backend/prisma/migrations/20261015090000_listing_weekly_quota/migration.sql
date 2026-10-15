CREATE TABLE "listing_submissions" (
    "listing_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "listing_submissions_pkey" PRIMARY KEY ("listing_id"),
    CONSTRAINT "listing_submissions_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "listing_submissions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "listing_submissions_user_id_created_at_idx" ON "listing_submissions"("user_id", "created_at");

-- Preserve the earliest evidence still available. Old edits cleared submitted_at;
-- a review timestamp is only a fallback, not a recovered submission timestamp.
INSERT INTO "listing_submissions" ("listing_id", "user_id", "created_at")
SELECT l."id", l."owner_id", LEAST(l."submitted_at", l."published_at", r."reviewed_at")
FROM "listings" l
LEFT JOIN (
    SELECT "listing_id", MIN("created_at") AS "reviewed_at"
    FROM "listing_reviews" GROUP BY "listing_id"
) r ON r."listing_id" = l."id"
WHERE l."type" IN ('ROOM_WANTED', 'ROOMMATE')
  AND COALESCE(l."submitted_at", l."published_at", r."reviewed_at") IS NOT NULL;
