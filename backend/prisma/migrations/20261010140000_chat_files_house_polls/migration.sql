-- AlterEnum
ALTER TYPE "MessageAttachmentKind" ADD VALUE 'FILE';

-- AlterTable
ALTER TABLE "house_message_attachments" ADD COLUMN     "file_name" VARCHAR(255);

-- AlterTable
ALTER TABLE "message_attachments" ADD COLUMN     "file_name" VARCHAR(255);

-- CreateTable
CREATE TABLE "house_polls" (
    "message_id" UUID NOT NULL,
    "question" VARCHAR(200) NOT NULL,
    "closed_at" TIMESTAMPTZ(3),

    CONSTRAINT "house_polls_pkey" PRIMARY KEY ("message_id")
);

-- CreateTable
CREATE TABLE "house_poll_options" (
    "id" UUID NOT NULL,
    "poll_id" UUID NOT NULL,
    "text" VARCHAR(120) NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "house_poll_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "house_poll_votes" (
    "poll_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "option_id" UUID NOT NULL,

    CONSTRAINT "house_poll_votes_pkey" PRIMARY KEY ("poll_id","user_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "house_poll_options_poll_id_id_key" ON "house_poll_options"("poll_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "house_poll_options_poll_id_position_key" ON "house_poll_options"("poll_id", "position");

-- CreateIndex
CREATE INDEX "house_poll_votes_poll_id_option_id_idx" ON "house_poll_votes"("poll_id", "option_id");

-- AddForeignKey
ALTER TABLE "house_polls" ADD CONSTRAINT "house_polls_message_id_fkey" FOREIGN KEY ("message_id") REFERENCES "house_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_poll_options" ADD CONSTRAINT "house_poll_options_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "house_polls"("message_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_poll_votes" ADD CONSTRAINT "house_poll_votes_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "house_polls"("message_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_poll_votes" ADD CONSTRAINT "house_poll_votes_poll_id_option_id_fkey" FOREIGN KEY ("poll_id", "option_id") REFERENCES "house_poll_options"("poll_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_poll_votes" ADD CONSTRAINT "house_poll_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
