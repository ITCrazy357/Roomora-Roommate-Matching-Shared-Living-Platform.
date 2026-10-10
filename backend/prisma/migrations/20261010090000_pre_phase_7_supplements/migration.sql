ALTER TABLE "messages"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "edited_at" TIMESTAMP(3),
  ADD COLUMN "deleted_at" TIMESTAMP(3);

ALTER TABLE "listings" ADD COLUMN "desired_residents" INTEGER;
ALTER TABLE "listings" ADD CONSTRAINT "listings_desired_residents_range"
  CHECK ("desired_residents" BETWEEN 1 AND 20);

ALTER TYPE "Amenity" ADD VALUE 'HOT_WATER';
