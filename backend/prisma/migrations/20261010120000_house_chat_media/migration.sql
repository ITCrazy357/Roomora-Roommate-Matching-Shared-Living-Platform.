CREATE TABLE "house_message_attachments" (
  "id" UUID NOT NULL,
  "message_id" UUID NOT NULL,
  "kind" "MessageAttachmentKind" NOT NULL,
  "mime_type" VARCHAR(50) NOT NULL,
  "byte_size" INTEGER NOT NULL,
  "position" INTEGER NOT NULL,
  "width" INTEGER,
  "height" INTEGER,
  "data" BYTEA NOT NULL,
  CONSTRAINT "house_message_attachments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "house_message_attachments_message_id_fkey" FOREIGN KEY ("message_id")
    REFERENCES "house_messages"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "house_message_attachments_message_id_position_idx"
  ON "house_message_attachments"("message_id", "position");
