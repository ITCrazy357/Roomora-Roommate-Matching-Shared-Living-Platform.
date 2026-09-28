BEGIN;

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('CONNECTION', 'MESSAGE', 'APPOINTMENT');

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "connection_id" UUID NOT NULL,
    "last_number" INTEGER NOT NULL DEFAULT 0,
    "sender_read" INTEGER NOT NULL DEFAULT 0,
    "receiver_read" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "text" VARCHAR(2000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "proposer_id" UUID NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "place" VARCHAR(300) NOT NULL,
    "note" VARCHAR(1000) NOT NULL DEFAULT '',
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointment_changes" (
    "id" UUID NOT NULL,
    "appointment_id" UUID NOT NULL,
    "actor_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "status" "AppointmentStatus" NOT NULL,
    "starts_at" TIMESTAMPTZ(3) NOT NULL,
    "place" VARCHAR(300) NOT NULL,
    "note" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointment_changes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "href" VARCHAR(200) NOT NULL,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "email_required" BOOLEAN NOT NULL DEFAULT false,
    "email_sent_at" TIMESTAMP(3),
    "email_attempts" INTEGER NOT NULL DEFAULT 0,
    "email_next_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "conversations_connection_id_key" ON "conversations"("connection_id");

-- CreateIndex
CREATE INDEX "messages_sender_id_created_at_idx" ON "messages"("sender_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_number_key" ON "messages"("conversation_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "messages_conversation_id_sender_id_client_id_key" ON "messages"("conversation_id", "sender_id", "client_id");

-- CreateIndex
CREATE INDEX "appointments_conversation_id_starts_at_idx" ON "appointments"("conversation_id", "starts_at");

-- CreateIndex
CREATE INDEX "appointments_listing_id_status_starts_at_idx" ON "appointments"("listing_id", "status", "starts_at");

-- CreateIndex
CREATE UNIQUE INDEX "appointment_changes_appointment_id_version_key" ON "appointment_changes"("appointment_id", "version");

-- CreateIndex
CREATE INDEX "notifications_user_id_read_at_created_at_idx" ON "notifications"("user_id", "read_at", "created_at");

-- CreateIndex
CREATE INDEX "notifications_email_required_email_sent_at_email_next_at_idx" ON "notifications"("email_required", "email_sent_at", "email_next_at");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_connection_id_fkey" FOREIGN KEY ("connection_id") REFERENCES "connections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "appointment_changes" ADD CONSTRAINT "appointment_changes_appointment_id_fkey" FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "conversations" ADD CONSTRAINT "conversation_read_numbers" CHECK (sender_read >= 0 AND receiver_read >= 0 AND last_number >= sender_read AND last_number >= receiver_read);
ALTER TABLE "messages" ADD CONSTRAINT "message_content" CHECK (number > 0 AND char_length(btrim(text)) > 0);
ALTER TABLE "appointments" ADD CONSTRAINT "appointment_version" CHECK (version > 0);

-- Existing accepted pairs can continue directly in their inbox.
INSERT INTO conversations (id, connection_id, created_at, updated_at)
SELECT id, id, NOW(), NOW() FROM connections WHERE status = 'ACCEPTED';

COMMIT;
