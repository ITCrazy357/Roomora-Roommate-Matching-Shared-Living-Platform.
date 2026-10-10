-- CreateEnum
CREATE TYPE "ExpenseStatus" AS ENUM ('ACTIVE', 'SETTLED', 'ADJUSTMENT_REQUIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'BANK_TRANSFER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED');

-- DropForeignKey
ALTER TABLE "connection_attempts" DROP CONSTRAINT "connection_attempts_sender_id_fkey";

-- DropForeignKey
ALTER TABLE "connections" DROP CONSTRAINT "connections_receiver_id_fkey";

-- DropForeignKey
ALTER TABLE "connections" DROP CONSTRAINT "connections_sender_id_fkey";

-- DropForeignKey
ALTER TABLE "house_announcements" DROP CONSTRAINT "house_announcements_author_id_fkey";

-- DropForeignKey
ALTER TABLE "house_announcements" DROP CONSTRAINT "house_announcements_house_id_fkey";

-- DropForeignKey
ALTER TABLE "house_events" DROP CONSTRAINT "house_events_actor_id_fkey";

-- DropForeignKey
ALTER TABLE "house_events" DROP CONSTRAINT "house_events_house_id_fkey";

-- DropForeignKey
ALTER TABLE "house_events" DROP CONSTRAINT "house_events_user_id_fkey";

-- DropForeignKey
ALTER TABLE "house_invites" DROP CONSTRAINT "house_invites_house_id_fkey";

-- DropForeignKey
ALTER TABLE "house_members" DROP CONSTRAINT "house_members_house_id_fkey";

-- DropForeignKey
ALTER TABLE "house_members" DROP CONSTRAINT "house_members_user_id_fkey";

-- DropForeignKey
ALTER TABLE "houses" DROP CONSTRAINT "houses_owner_id_fkey";

-- DropForeignKey
ALTER TABLE "user_blocks" DROP CONSTRAINT "user_blocks_blocker_id_fkey";

-- DropForeignKey
ALTER TABLE "user_blocks" DROP CONSTRAINT "user_blocks_target_id_fkey";

-- DropForeignKey
ALTER TABLE "user_reports" DROP CONSTRAINT "user_reports_reporter_id_fkey";

-- DropForeignKey
ALTER TABLE "user_reports" DROP CONSTRAINT "user_reports_target_id_fkey";

-- CreateTable
CREATE TABLE "expenses" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "payer_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" VARCHAR(2000),
    "amount" INTEGER NOT NULL,
    "receipt_url" VARCHAR(2048),
    "status" "ExpenseStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_splits" (
    "id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "expense_splits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_payments" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "payer_id" UUID NOT NULL,
    "recipient_id" UUID NOT NULL,
    "client_id" VARCHAR(100) NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "note" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "debt_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_adjustments" (
    "id" UUID NOT NULL,
    "expense_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "old_amount" INTEGER NOT NULL,
    "new_amount" INTEGER NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expenses_house_id_created_at_idx" ON "expenses"("house_id", "created_at");

-- CreateIndex
CREATE INDEX "expenses_payer_id_idx" ON "expenses"("payer_id");

-- CreateIndex
CREATE INDEX "expenses_created_by_id_idx" ON "expenses"("created_by_id");

-- CreateIndex
CREATE INDEX "expense_splits_user_id_idx" ON "expense_splits"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "expense_splits_expense_id_user_id_key" ON "expense_splits"("expense_id", "user_id");

-- CreateIndex
CREATE INDEX "debt_payments_house_id_created_at_idx" ON "debt_payments"("house_id", "created_at");

-- CreateIndex
CREATE INDEX "debt_payments_payer_id_status_idx" ON "debt_payments"("payer_id", "status");

-- CreateIndex
CREATE INDEX "debt_payments_recipient_id_status_idx" ON "debt_payments"("recipient_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "debt_payments_house_id_payer_id_client_id_key" ON "debt_payments"("house_id", "payer_id", "client_id");

-- CreateIndex
CREATE INDEX "expense_adjustments_expense_id_created_at_idx" ON "expense_adjustments"("expense_id", "created_at");

-- AddForeignKey
ALTER TABLE "houses" ADD CONSTRAINT "houses_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_members" ADD CONSTRAINT "house_members_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_members" ADD CONSTRAINT "house_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_invites" ADD CONSTRAINT "house_invites_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_events" ADD CONSTRAINT "house_events_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_events" ADD CONSTRAINT "house_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_events" ADD CONSTRAINT "house_events_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_announcements" ADD CONSTRAINT "house_announcements_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_announcements" ADD CONSTRAINT "house_announcements_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connections" ADD CONSTRAINT "connections_receiver_id_fkey" FOREIGN KEY ("receiver_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "connection_attempts" ADD CONSTRAINT "connection_attempts_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_blocker_id_fkey" FOREIGN KEY ("blocker_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_blocks" ADD CONSTRAINT "user_blocks_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_reporter_id_fkey" FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_target_id_fkey" FOREIGN KEY ("target_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_splits" ADD CONSTRAINT "expense_splits_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_payer_id_fkey" FOREIGN KEY ("payer_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_adjustments" ADD CONSTRAINT "expense_adjustments_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_adjustments" ADD CONSTRAINT "expense_adjustments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
