-- CreateEnum
CREATE TYPE "CostSharingMode" AS ENUM ('EQUAL', 'WEIGHTED');

-- CreateEnum
CREATE TYPE "CostSharingKind" AS ENUM ('MONTHLY', 'DEFAULT');

-- CreateEnum
CREATE TYPE "CostSharingStatus" AS ENUM ('OPEN', 'AGREED', 'FALLBACK', 'UNRESOLVED', 'NEEDS_REVIEW');

-- CreateEnum
CREATE TYPE "CostSharingPhase" AS ENUM ('PREFERENCE', 'PROPOSAL');

-- CreateEnum
CREATE TYPE "CostSharingChoice" AS ENUM ('EQUAL', 'WEIGHTED', 'AGREE', 'REJECT');

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "sharing_period_id" UUID,
ADD COLUMN     "sharing_snapshot" JSONB;

-- CreateTable
CREATE TABLE "cost_sharing_settings" (
    "house_id" UUID NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "deadline_day" INTEGER NOT NULL DEFAULT 7,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_sharing_settings_pkey" PRIMARY KEY ("house_id","category")
);

-- CreateTable
CREATE TABLE "cost_sharing_periods" (
    "id" UUID NOT NULL,
    "house_id" UUID NOT NULL,
    "category" "ExpenseCategory" NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "kind" "CostSharingKind" NOT NULL,
    "status" "CostSharingStatus" NOT NULL DEFAULT 'OPEN',
    "deadline_at" TIMESTAMPTZ(3) NOT NULL,
    "current_round" INTEGER NOT NULL DEFAULT 1,
    "result_mode" "CostSharingMode",
    "result_shares" JSONB,
    "result_member_hash" CHAR(64),
    "fallback_snapshot" JSONB,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_sharing_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_sharing_rounds" (
    "id" UUID NOT NULL,
    "period_id" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "phase" "CostSharingPhase" NOT NULL,
    "status" VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    "resolved_at" TIMESTAMP(3),
    "member_hash" CHAR(64) NOT NULL,
    "members" JSONB NOT NULL,
    "mode" "CostSharingMode",
    "shares" JSONB,
    "reason" VARCHAR(1000) NOT NULL DEFAULT '',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_sharing_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cost_sharing_votes" (
    "round_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "choice" "CostSharingChoice" NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cost_sharing_votes_pkey" PRIMARY KEY ("round_id","user_id")
);

-- CreateTable
CREATE TABLE "cost_sharing_vote_events" (
    "id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "choice" "CostSharingChoice" NOT NULL,
    "version" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cost_sharing_vote_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cost_sharing_periods_house_id_month_category_kind_idx" ON "cost_sharing_periods"("house_id", "month", "category", "kind");

-- CreateIndex
CREATE INDEX "cost_sharing_periods_kind_status_deadline_at_idx" ON "cost_sharing_periods"("kind", "status", "deadline_at");

-- CreateIndex
CREATE UNIQUE INDEX "cost_sharing_periods_house_id_id_key" ON "cost_sharing_periods"("house_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "cost_sharing_rounds_period_id_number_key" ON "cost_sharing_rounds"("period_id", "number");

-- CreateIndex
CREATE UNIQUE INDEX "cost_sharing_vote_events_round_id_user_id_version_key" ON "cost_sharing_vote_events"("round_id", "user_id", "version");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_house_id_sharing_period_id_fkey" FOREIGN KEY ("house_id", "sharing_period_id") REFERENCES "cost_sharing_periods"("house_id", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_sharing_settings" ADD CONSTRAINT "cost_sharing_settings_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_sharing_periods" ADD CONSTRAINT "cost_sharing_periods_house_id_fkey" FOREIGN KEY ("house_id") REFERENCES "houses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_sharing_rounds" ADD CONSTRAINT "cost_sharing_rounds_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "cost_sharing_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_sharing_votes" ADD CONSTRAINT "cost_sharing_votes_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "cost_sharing_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cost_sharing_vote_events" ADD CONSTRAINT "cost_sharing_vote_events_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "cost_sharing_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One monthly decision per house/category; DEFAULT discussions keep independent history.
CREATE UNIQUE INDEX "one_monthly_cost_sharing_period" ON "cost_sharing_periods"("house_id", "category", "month") WHERE "kind" = 'MONTHLY';
CREATE UNIQUE INDEX "one_open_default_cost_sharing_period" ON "cost_sharing_periods"("house_id", "category") WHERE "kind" = 'DEFAULT' AND "status" = 'OPEN';
ALTER TABLE "cost_sharing_settings" ADD CONSTRAINT "cost_sharing_deadline_day_valid" CHECK ("deadline_day" BETWEEN 1 AND 31);
ALTER TABLE "cost_sharing_periods" ADD CONSTRAINT "cost_sharing_month_valid" CHECK ("month" ~ '^(20[0-9]{2}|2100)-(0[1-9]|1[0-2])$');
ALTER TABLE "cost_sharing_rounds" ADD CONSTRAINT "cost_sharing_round_status_valid" CHECK ("status" IN ('OPEN', 'AGREED', 'REJECTED', 'SUPERSEDED', 'UNRESOLVED', 'FALLBACK'));
ALTER TABLE "cost_sharing_votes" ADD CONSTRAINT "cost_sharing_vote_version_valid" CHECK ("version" > 0);
