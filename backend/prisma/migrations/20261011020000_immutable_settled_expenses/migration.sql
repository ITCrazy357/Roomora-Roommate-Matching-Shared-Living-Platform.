-- Additive migration: existing expenses, receipts and payments remain unchanged.
CREATE TABLE "expense_corrections" (
  "id" UUID NOT NULL,
  "house_id" UUID NOT NULL,
  "expense_id" UUID NOT NULL,
  "created_by_id" UUID NOT NULL,
  "client_id" VARCHAR(100) NOT NULL,
  "content_hash" VARCHAR(64) NOT NULL,
  "version" INTEGER NOT NULL CHECK ("version" > 0),
  "reason" VARCHAR(1000) NOT NULL,
  "amount_delta" INTEGER NOT NULL,
  "old_snapshot" JSONB NOT NULL,
  "new_snapshot" JSONB NOT NULL,
  "recorded_on" DATE NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "settled_at" TIMESTAMP(3),
  CONSTRAINT "expense_corrections_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "expense_correction_shares" (
  "correction_id" UUID NOT NULL,
  "house_id" UUID NOT NULL,
  "participant_id" UUID NOT NULL,
  "paid_delta" INTEGER NOT NULL,
  "owed_delta" INTEGER NOT NULL,
  CONSTRAINT "expense_correction_shares_pkey" PRIMARY KEY ("correction_id", "participant_id")
);
CREATE INDEX "expense_corrections_house_id_recorded_on_idx" ON "expense_corrections"("house_id", "recorded_on");
CREATE UNIQUE INDEX "expense_corrections_expense_id_version_key" ON "expense_corrections"("expense_id", "version");
CREATE UNIQUE INDEX "expense_corrections_house_id_created_by_id_client_id_key" ON "expense_corrections"("house_id", "created_by_id", "client_id");
ALTER TABLE "expense_corrections" ADD CONSTRAINT "expense_corrections_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_corrections" ADD CONSTRAINT "expense_corrections_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_corrections" ADD CONSTRAINT "expense_corrections_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "expense_correction_shares" ADD CONSTRAINT "expense_correction_shares_correction_id_fkey" FOREIGN KEY ("correction_id") REFERENCES "expense_corrections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "expense_correction_shares" ADD CONSTRAINT "expense_correction_shares_house_id_participant_id_fkey" FOREIGN KEY ("house_id", "participant_id") REFERENCES "house_participants"("house_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
