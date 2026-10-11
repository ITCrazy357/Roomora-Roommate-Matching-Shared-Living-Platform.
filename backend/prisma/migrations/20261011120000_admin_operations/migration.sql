-- CreateEnum
CREATE TYPE "AnnouncementKind" AS ENUM ('GENERAL', 'MAINTENANCE');

-- AlterTable
ALTER TABLE "user_reports" ADD COLUMN     "handled_at" TIMESTAMP(3),
ADD COLUMN     "handling_note" VARCHAR(1000),
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "lock_reason" VARCHAR(1000),
ADD COLUMN     "locked_at" TIMESTAMP(3),
ADD COLUMN     "moderation_version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "system_announcements" (
    "id" UUID NOT NULL,
    "author_id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "message" VARCHAR(1000) NOT NULL,
    "kind" "AnnouncementKind" NOT NULL DEFAULT 'GENERAL',
    "display_from" TIMESTAMP(3) NOT NULL,
    "display_until" TIMESTAMP(3) NOT NULL,
    "maintenance_from" TIMESTAMP(3),
    "maintenance_until" TIMESTAMP(3),
    "published" BOOLEAN NOT NULL DEFAULT false,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_announcements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_actions" (
    "id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "entity_id" UUID NOT NULL,
    "reason" VARCHAR(1000),
    "snapshot" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "system_announcements_published_display_until_display_from_idx" ON "system_announcements"("published", "display_until", "display_from");

-- CreateIndex
CREATE INDEX "admin_actions_entity_id_created_at_idx" ON "admin_actions"("entity_id", "created_at");

-- CreateIndex
CREATE INDEX "users_role_locked_at_created_at_idx" ON "users"("role", "locked_at", "created_at");

-- AddForeignKey
ALTER TABLE "system_announcements" ADD CONSTRAINT "system_announcements_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "admin_actions" ADD CONSTRAINT "admin_actions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Keep invariants enforced even for writes outside the HTTP API.
ALTER TABLE "system_announcements" ADD CONSTRAINT "system_announcements_valid_schedule"
CHECK ("display_from" < "display_until" AND
  (("kind" = 'GENERAL' AND "maintenance_from" IS NULL AND "maintenance_until" IS NULL) OR
   ("kind" = 'MAINTENANCE' AND "maintenance_from" IS NOT NULL AND "maintenance_until" IS NOT NULL
    AND "display_from" <= "maintenance_from" AND "maintenance_from" < "maintenance_until"
    AND "maintenance_until" <= "display_until")));
ALTER TABLE "system_announcements" ADD CONSTRAINT "system_announcements_positive_version" CHECK ("version" > 0);
ALTER TABLE "users" ADD CONSTRAINT "users_valid_lock"
CHECK (("locked_at" IS NULL AND "lock_reason" IS NULL) OR
       ("locked_at" IS NOT NULL AND "lock_reason" IS NOT NULL AND length(trim("lock_reason")) >= 5));
