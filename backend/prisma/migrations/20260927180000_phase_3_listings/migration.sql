-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('USER', 'ADMIN');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('DRAFT', 'PENDING', 'PUBLISHED', 'REJECTED', 'CLOSED');

-- CreateEnum
CREATE TYPE "Amenity" AS ENUM ('FURNISHED', 'AIR_CONDITIONER', 'WASHING_MACHINE', 'PARKING', 'WIFI', 'KITCHEN', 'BALCONY', 'PRIVATE_BATHROOM');

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "role" "UserRole" NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE "listings" (
    "id" UUID NOT NULL,
    "owner_id" UUID NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "title" VARCHAR(150) NOT NULL DEFAULT '',
    "description" VARCHAR(5000) NOT NULL DEFAULT '',
    "rent" INTEGER,
    "deposit" INTEGER NOT NULL DEFAULT 0,
    "electricity_cost" INTEGER NOT NULL DEFAULT 0,
    "water_cost" INTEGER NOT NULL DEFAULT 0,
    "internet_cost" INTEGER NOT NULL DEFAULT 0,
    "other_cost" INTEGER NOT NULL DEFAULT 0,
    "cost_note" VARCHAR(500) NOT NULL DEFAULT '',
    "area" INTEGER,
    "available_slots" INTEGER NOT NULL DEFAULT 1,
    "current_residents" INTEGER NOT NULL DEFAULT 0,
    "available_from" DATE,
    "province_code" VARCHAR(2),
    "province_name" VARCHAR(100),
    "ward_code" VARCHAR(5),
    "ward_name" VARCHAR(100),
    "private_address" VARCHAR(300) NOT NULL DEFAULT '',
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "amenities" "Amenity"[] DEFAULT ARRAY[]::"Amenity"[],
    "roommate_note" VARCHAR(1000) NOT NULL DEFAULT '',
    "smoking_preference" "SmokingPreference",
    "pet_preference" "PetPreference",
    "quiet_level" "QuietLevel",
    "rejection_reason" VARCHAR(1000),
    "submitted_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_photos" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "url" VARCHAR(2048) NOT NULL,
    "public_id" VARCHAR(255) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "listing_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_listings" (
    "user_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "saved_listings_pkey" PRIMARY KEY ("user_id","listing_id")
);

-- CreateTable
CREATE TABLE "listing_reviews" (
    "id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "decision" "ListingStatus" NOT NULL,
    "reason" VARCHAR(1000),
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listing_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "listings_status_published_at_id_idx" ON "listings"("status", "published_at", "id");

-- CreateIndex
CREATE INDEX "listings_status_province_code_ward_code_rent_idx" ON "listings"("status", "province_code", "ward_code", "rent");

-- CreateIndex
CREATE INDEX "listings_owner_id_updated_at_idx" ON "listings"("owner_id", "updated_at");

-- CreateIndex
CREATE INDEX "listings_amenities_idx" ON "listings" USING GIN ("amenities");

-- CreateIndex
CREATE UNIQUE INDEX "listing_photos_public_id_key" ON "listing_photos"("public_id");

-- CreateIndex
CREATE INDEX "listing_photos_listing_id_position_idx" ON "listing_photos"("listing_id", "position");

-- CreateIndex
CREATE INDEX "saved_listings_user_id_created_at_idx" ON "saved_listings"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "listing_reviews_listing_id_created_at_idx" ON "listing_reviews"("listing_id", "created_at");

-- AddForeignKey
ALTER TABLE "listings" ADD CONSTRAINT "listings_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_photos" ADD CONSTRAINT "listing_photos_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_listings" ADD CONSTRAINT "saved_listings_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_reviews" ADD CONSTRAINT "listing_reviews_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_reviews" ADD CONSTRAINT "listing_reviews_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep amounts and coarse map coordinates valid even outside the HTTP API.
ALTER TABLE "listings" ADD CONSTRAINT "listing_values_valid" CHECK (
  ("rent" IS NULL OR "rent" BETWEEN 1 AND 100000000)
  AND "deposit" BETWEEN 0 AND 100000000
  AND "electricity_cost" BETWEEN 0 AND 100000000
  AND "water_cost" BETWEEN 0 AND 100000000
  AND "internet_cost" BETWEEN 0 AND 100000000
  AND "other_cost" BETWEEN 0 AND 100000000
  AND ("area" IS NULL OR "area" BETWEEN 1 AND 10000)
  AND "available_slots" BETWEEN 1 AND 20
  AND "current_residents" BETWEEN 0 AND 20
  AND "version" > 0
  AND (("latitude" IS NULL AND "longitude" IS NULL)
    OR ("latitude" IS NOT NULL AND "longitude" IS NOT NULL
      AND "latitude" BETWEEN 8 AND 24 AND "longitude" BETWEEN 102 AND 110))
);
ALTER TABLE "listing_reviews" ADD CONSTRAINT "listing_review_decision_valid"
  CHECK ("decision" IN ('PUBLISHED', 'REJECTED') AND ("decision" <> 'REJECTED' OR length(trim("reason")) > 0));
