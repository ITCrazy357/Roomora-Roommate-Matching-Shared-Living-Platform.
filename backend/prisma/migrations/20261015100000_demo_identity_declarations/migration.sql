CREATE TYPE "IdentityDeclarationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TABLE "identity_declarations" (
  "user_id" UUID NOT NULL,
  "encrypted_data" BYTEA NOT NULL,
  "document_last4" CHAR(4) NOT NULL,
  "status" "IdentityDeclarationStatus" NOT NULL DEFAULT 'PENDING',
  "version" INTEGER NOT NULL DEFAULT 1,
  "submitted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  "reviewed_at" TIMESTAMP(3),
  "reviewer_id" UUID,
  "review_note" VARCHAR(1000),
  CONSTRAINT "identity_declarations_pkey" PRIMARY KEY ("user_id"),
  CONSTRAINT "identity_declarations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "identity_declarations_reviewer_id_fkey" FOREIGN KEY ("reviewer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "identity_declarations_status_submitted_at_idx" ON "identity_declarations"("status", "submitted_at");
