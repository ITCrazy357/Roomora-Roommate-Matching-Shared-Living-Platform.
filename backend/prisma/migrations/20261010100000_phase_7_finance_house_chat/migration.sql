BEGIN;
CREATE TYPE "ExpenseSplitMode" AS ENUM ('EQUAL', 'CUSTOM');
CREATE TABLE "house_participants" (
  "house_id" UUID NOT NULL REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "id" UUID NOT NULL,
  "user_id" UUID REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "display_name" VARCHAR(120) NOT NULL,
  "left_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("house_id", "id"),
  UNIQUE ("house_id", "user_id")
);
-- Preserve historical identities, including any older financial rows.
INSERT INTO "house_participants" ("house_id", "id", "user_id", "display_name", "left_at")
SELECT identities.house_id, identities.user_id, identities.user_id,
       COALESCE(p.display_name, 'Thành viên Roomora'), m.left_at
FROM (
  SELECT house_id, user_id FROM house_members
  UNION SELECT house_id, payer_id FROM expenses
  UNION SELECT e.house_id, s.user_id FROM expense_splits s JOIN expenses e ON e.id = s.expense_id
  UNION SELECT house_id, payer_id FROM debt_payments
  UNION SELECT house_id, recipient_id FROM debt_payments
) identities
LEFT JOIN profiles p ON p.user_id = identities.user_id
LEFT JOIN house_members m ON m.house_id = identities.house_id AND m.user_id = identities.user_id;

ALTER TABLE "expenses"
  ADD COLUMN "client_id" VARCHAR(100),
  ADD COLUMN "content_hash" VARCHAR(64) NOT NULL DEFAULT '',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "split_mode" "ExpenseSplitMode" NOT NULL DEFAULT 'CUSTOM';
UPDATE "expenses" SET "client_id" = "id"::text;
ALTER TABLE "expenses" ALTER COLUMN "client_id" SET NOT NULL;
CREATE UNIQUE INDEX "expenses_house_id_created_by_id_client_id_key" ON "expenses"("house_id", "created_by_id", "client_id");
ALTER TABLE "expenses" DROP CONSTRAINT "expenses_payer_id_fkey";
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_house_id_payer_id_fkey"
  FOREIGN KEY ("house_id", "payer_id") REFERENCES "house_participants"("house_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_amount_positive" CHECK (amount > 0);

ALTER TABLE "expense_splits" ADD COLUMN "house_id" UUID;
UPDATE "expense_splits" s SET "house_id" = e.house_id FROM "expenses" e WHERE e.id = s.expense_id;
ALTER TABLE "expense_splits" ALTER COLUMN "house_id" SET NOT NULL;
ALTER TABLE "expense_splits" DROP CONSTRAINT "expense_splits_user_id_fkey";
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_house_id_user_id_fkey"
  FOREIGN KEY ("house_id", "user_id") REFERENCES "house_participants"("house_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_amount_nonnegative" CHECK (amount >= 0);

ALTER TABLE "debt_payments"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "created_by_id" UUID,
  ADD COLUMN "confirmed_by_id" UUID,
  ADD COLUMN "content_hash" VARCHAR(64) NOT NULL DEFAULT '';
UPDATE "debt_payments" SET "created_by_id" = "payer_id",
  "confirmed_by_id" = CASE WHEN status = 'CONFIRMED' THEN recipient_id END;
ALTER TABLE "debt_payments" ALTER COLUMN "created_by_id" SET NOT NULL;
ALTER TABLE "debt_payments" DROP CONSTRAINT "debt_payments_payer_id_fkey";
ALTER TABLE "debt_payments" DROP CONSTRAINT "debt_payments_recipient_id_fkey";
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_house_id_payer_id_fkey"
  FOREIGN KEY ("house_id", "payer_id") REFERENCES "house_participants"("house_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_house_id_recipient_id_fkey"
  FOREIGN KEY ("house_id", "recipient_id") REFERENCES "house_participants"("house_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_confirmed_by_id_fkey"
  FOREIGN KEY ("confirmed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_amount_positive" CHECK (amount > 0 AND payer_id <> recipient_id);

ALTER TABLE "expense_adjustments"
  ADD COLUMN "action" VARCHAR(30) NOT NULL DEFAULT 'EDIT',
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "old_snapshot" JSONB,
  ADD COLUMN "new_snapshot" JSONB;
CREATE TABLE "expense_receipts" (
  "expense_id" UUID PRIMARY KEY REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "data" BYTEA NOT NULL,
  "mime_type" VARCHAR(50) NOT NULL DEFAULT 'image/jpeg'
);
ALTER TABLE "houses" ADD COLUMN "last_message_number" INTEGER NOT NULL DEFAULT 0;
CREATE TABLE "house_messages" (
  "id" UUID PRIMARY KEY,
  "house_id" UUID NOT NULL REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "sender_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "client_id" UUID NOT NULL,
  "number" INTEGER NOT NULL,
  "text" VARCHAR(2000) NOT NULL,
  "content_hash" VARCHAR(64) NOT NULL,
  "version" INTEGER NOT NULL DEFAULT 1,
  "edited_at" TIMESTAMP(3),
  "deleted_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("house_id", "number"),
  UNIQUE ("house_id", "sender_id", "client_id")
);
CREATE INDEX "house_messages_sender_id_created_at_idx" ON "house_messages"("sender_id", "created_at");
COMMIT;
