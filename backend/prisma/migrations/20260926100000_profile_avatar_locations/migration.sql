-- Additive only: existing profiles and legacy desired-area labels are preserved.
ALTER TABLE "profiles"
ADD COLUMN "avatar_public_id" VARCHAR(255),
ADD COLUMN "desired_locations" JSONB NOT NULL DEFAULT '[]';
