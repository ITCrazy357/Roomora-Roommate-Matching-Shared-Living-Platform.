-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "debt_reminder_id" UUID;

-- CreateTable
CREATE TABLE "debt_reminders" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "participant_id" UUID NOT NULL,
    "debt_since_at" TIMESTAMP(3),
    "last_reminder_at" TIMESTAMP(3),
    "next_reminder_at" TIMESTAMP(3),
    "paused_until" TIMESTAMP(3),
    "unpaid_amount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "debt_reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repayment_promises" (
    "house_id" UUID NOT NULL,
    "payer_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,
    "pay_on" DATE NOT NULL,
    "remind_after" TIMESTAMP(3) NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repayment_promises_pkey" PRIMARY KEY ("house_id","payer_id","recipient_id")
);

-- CreateIndex
CREATE INDEX "debt_reminders_next_reminder_at_idx" ON "debt_reminders"("next_reminder_at");

-- CreateIndex
CREATE UNIQUE INDEX "debt_reminders_house_id_participant_id_key" ON "debt_reminders"("house_id", "participant_id");

-- CreateIndex
CREATE INDEX "notifications_debt_reminder_id_idx" ON "notifications"("debt_reminder_id");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_debt_reminder_id_fkey" FOREIGN KEY ("debt_reminder_id") REFERENCES "debt_reminders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_reminders" ADD CONSTRAINT "debt_reminders_house_id_participant_id_fkey" FOREIGN KEY ("house_id", "participant_id") REFERENCES "house_participants"("house_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayment_promises" ADD CONSTRAINT "repayment_promises_house_id_payer_id_fkey" FOREIGN KEY ("house_id", "payer_id") REFERENCES "house_participants"("house_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repayment_promises" ADD CONSTRAINT "repayment_promises_house_id_recipient_id_fkey" FOREIGN KEY ("house_id", "recipient_id") REFERENCES "house_participants"("house_id", "id") ON DELETE CASCADE ON UPDATE CASCADE;
