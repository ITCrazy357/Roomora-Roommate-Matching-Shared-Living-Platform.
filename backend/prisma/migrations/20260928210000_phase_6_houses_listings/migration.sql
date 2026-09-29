CREATE TYPE "ListingType" AS ENUM ('ROOMMATE', 'ROOM_RENTAL', 'ROOM_WANTED');
CREATE TYPE "HouseInviteStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');
CREATE TYPE "HouseEventType" AS ENUM ('CREATED', 'INVITED', 'JOINED', 'LEFT', 'OWNER_TRANSFERRED', 'INVITE_REVOKED');
ALTER TYPE "NotificationType" ADD VALUE 'HOUSE';

ALTER TABLE "listings" ADD COLUMN "type" "ListingType" NOT NULL DEFAULT 'ROOMMATE';
ALTER TABLE "listings" ADD COLUMN "is_full" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX "listings_status_type_published_at_id_idx" ON "listings"("status", "type", "published_at", "id");

CREATE TABLE "houses" (
  "id" UUID NOT NULL,
  "owner_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "name" VARCHAR(120) NOT NULL,
  "address" VARCHAR(300) NOT NULL DEFAULT '',
  "description" VARCHAR(1000) NOT NULL DEFAULT '',
  "rules" VARCHAR(3000) NOT NULL DEFAULT '',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "houses_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "houses_owner_id_idx" ON "houses"("owner_id");

CREATE TABLE "house_members" (
  "house_id" UUID NOT NULL REFERENCES "houses"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "left_at" TIMESTAMP(3),
  CONSTRAINT "house_members_pkey" PRIMARY KEY ("house_id", "user_id")
);
CREATE INDEX "house_members_user_id_left_at_idx" ON "house_members"("user_id", "left_at");

CREATE TABLE "house_invites" (
  "id" UUID NOT NULL,
  "house_id" UUID NOT NULL REFERENCES "houses"("id") ON DELETE CASCADE,
  "email" VARCHAR(320) NOT NULL,
  "status" "HouseInviteStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "house_invites_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "house_invites_house_id_email_key" ON "house_invites"("house_id", "email");
CREATE INDEX "house_invites_email_status_expires_at_idx" ON "house_invites"("email", "status", "expires_at");

CREATE TABLE "house_events" (
  "id" UUID NOT NULL,
  "house_id" UUID NOT NULL REFERENCES "houses"("id") ON DELETE CASCADE,
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "actor_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "type" "HouseEventType" NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "house_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "house_events_house_id_created_at_idx" ON "house_events"("house_id", "created_at");

CREATE TABLE "house_announcements" (
  "id" UUID NOT NULL,
  "house_id" UUID NOT NULL REFERENCES "houses"("id") ON DELETE CASCADE,
  "author_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "text" VARCHAR(2000) NOT NULL,
  "pinned" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "house_announcements_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "house_announcements_house_id_created_at_idx" ON "house_announcements"("house_id", "created_at");
