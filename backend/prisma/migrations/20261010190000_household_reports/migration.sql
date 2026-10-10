-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('RENT', 'ELECTRICITY', 'WATER', 'INTERNET', 'GROCERIES', 'HOUSEHOLD', 'OTHER');

-- CreateEnum
CREATE TYPE "HouseActivityKind" AS ENUM ('CHORE', 'SHOPPING');

-- CreateEnum
CREATE TYPE "HouseActivityStatus" AS ENUM ('OPEN', 'DONE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RecurringDraftStatus" AS ENUM ('PENDING', 'CONFIRMED', 'SKIPPED');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "spent_on" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing expenses retain their original Vietnamese calendar date.
UPDATE "expenses" SET "spent_on" = ("created_at" + INTERVAL '7 hours')::date;

-- CreateTable
CREATE TABLE "house_activities" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "kind" "HouseActivityKind" NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "note" VARCHAR(2000) NOT NULL DEFAULT '',
    "quantity" VARCHAR(100) NOT NULL DEFAULT '',
    "due_on" DATE,
    "assignee_id" UUID,
    "created_by_id" UUID NOT NULL,
    "completed_by_id" UUID,
    "completed_at" TIMESTAMP(3),
    "status" "HouseActivityStatus" NOT NULL DEFAULT 'OPEN',
    "version" INTEGER NOT NULL DEFAULT 1,
    "client_id" UUID NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "house_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_expenses" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "content_hash" VARCHAR(64) NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" VARCHAR(2000) NOT NULL DEFAULT '',
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "amount" INTEGER,
    "payer_id" UUID NOT NULL,
    "participant_ids" UUID[],
    "day_of_month" INTEGER NOT NULL,
    "next_on" DATE NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_expense_drafts" (
    "id" UUID NOT NULL,
    "rule_id" UUID NOT NULL,
    "due_on" DATE NOT NULL,
    "title" VARCHAR(150) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "amount" INTEGER,
    "payer_id" UUID NOT NULL,
    "participant_ids" UUID[],
    "status" "RecurringDraftStatus" NOT NULL DEFAULT 'PENDING',
    "version" INTEGER NOT NULL DEFAULT 1,
    "expense_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recurring_expense_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "house_activities_house_id_kind_status_due_on_idx" ON "house_activities"("house_id", "kind", "status", "due_on");

-- CreateIndex
CREATE UNIQUE INDEX "house_activities_house_id_created_by_id_client_id_key" ON "house_activities"("house_id", "created_by_id", "client_id");

-- CreateIndex
CREATE INDEX "recurring_expenses_enabled_next_on_idx" ON "recurring_expenses"("enabled", "next_on");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_expenses_house_id_created_by_id_client_id_key" ON "recurring_expenses"("house_id", "created_by_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_expense_drafts_expense_id_key" ON "recurring_expense_drafts"("expense_id");

-- CreateIndex
CREATE INDEX "recurring_expense_drafts_rule_id_status_due_on_idx" ON "recurring_expense_drafts"("rule_id", "status", "due_on");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_expense_drafts_rule_id_due_on_key" ON "recurring_expense_drafts"("rule_id", "due_on");

-- CreateIndex
CREATE INDEX "expenses_house_id_spent_on_category_idx" ON "expenses"("house_id", "spent_on", "category");

-- AddForeignKey
ALTER TABLE "house_activities" ADD CONSTRAINT "house_activities_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_activities" ADD CONSTRAINT "house_activities_house_id_assignee_id_fkey" FOREIGN KEY ("house_id", "assignee_id") REFERENCES "house_participants"("house_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_activities" ADD CONSTRAINT "house_activities_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "house_activities" ADD CONSTRAINT "house_activities_completed_by_id_fkey" FOREIGN KEY ("completed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_house_id_payer_id_fkey" FOREIGN KEY ("house_id", "payer_id") REFERENCES "house_participants"("house_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expense_drafts" ADD CONSTRAINT "recurring_expense_drafts_rule_id_fkey" FOREIGN KEY ("rule_id") REFERENCES "recurring_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expense_drafts" ADD CONSTRAINT "recurring_expense_drafts_expense_id_fkey" FOREIGN KEY ("expense_id") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_rule_values_check"
CHECK ("day_of_month" BETWEEN 1 AND 31 AND ("amount" IS NULL OR "amount" BETWEEN 1 AND 2000000000) AND "participant_ids" IS NOT NULL AND cardinality("participant_ids") BETWEEN 1 AND 100);
ALTER TABLE "recurring_expense_drafts" ADD CONSTRAINT "recurring_draft_values_check"
CHECK (("amount" IS NULL OR "amount" BETWEEN 1 AND 2000000000) AND "participant_ids" IS NOT NULL AND cardinality("participant_ids") BETWEEN 1 AND 100);
ALTER TABLE "house_activities" ADD CONSTRAINT "chore_assignment_check"
CHECK ("kind" <> 'CHORE' OR ("assignee_id" IS NOT NULL AND "due_on" IS NOT NULL));
