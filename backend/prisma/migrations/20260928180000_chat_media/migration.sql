BEGIN;

CREATE TYPE "MessageAttachmentKind" AS ENUM ('IMAGE', 'AUDIO');

ALTER TABLE "messages"
ADD COLUMN "content_hash" VARCHAR(64) NOT NULL DEFAULT '';

CREATE TABLE "message_attachments" (
    "id" UUID NOT NULL,
    "message_id" UUID NOT NULL,
    "kind" "MessageAttachmentKind" NOT NULL,
    "mime_type" VARCHAR(50) NOT NULL,
    "byte_size" INTEGER NOT NULL,
    "position" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "data" BYTEA NOT NULL,
    CONSTRAINT "message_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "message_attachments_message_id_position_idx"
ON "message_attachments"("message_id", "position");

ALTER TABLE "message_attachments"
ADD CONSTRAINT "message_attachments_message_id_fkey"
FOREIGN KEY ("message_id") REFERENCES "messages"("id") ON DELETE CASCADE ON UPDATE CASCADE;

COMMIT;
