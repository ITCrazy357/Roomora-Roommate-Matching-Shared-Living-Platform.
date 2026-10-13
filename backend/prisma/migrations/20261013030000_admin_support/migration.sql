ALTER TABLE "users" ADD COLUMN "closed_at" TIMESTAMP(3);
ALTER TABLE "auth_otps" DROP CONSTRAINT "auth_otps_type_check";
ALTER TABLE "auth_otps" ADD CONSTRAINT "auth_otps_type_check"
  CHECK ("type" IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET', 'ACCOUNT_CLOSURE'));
ALTER TABLE "users" ADD CONSTRAINT "closed_account_locked" CHECK ("closed_at" IS NULL OR "locked_at" IS NOT NULL);

ALTER TABLE "user_reports" ADD COLUMN "listing_id" UUID,
  ADD COLUMN "listing_snapshot" JSONB;
ALTER TABLE "user_reports" ADD CONSTRAINT "user_reports_listing_id_fkey"
  FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
DROP INDEX "user_reports_reporter_id_target_id_key";
CREATE UNIQUE INDEX "user_reports_account_unique" ON "user_reports"("reporter_id", "target_id") WHERE "listing_id" IS NULL;
CREATE UNIQUE INDEX "user_reports_listing_unique" ON "user_reports"("reporter_id", "listing_id") WHERE "listing_id" IS NOT NULL;
CREATE INDEX "user_reports_reporter_id_target_id_idx" ON "user_reports"("reporter_id", "target_id");
CREATE INDEX "user_reports_listing_id_idx" ON "user_reports"("listing_id");

CREATE TYPE "SupportStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED');
CREATE TABLE "support_tickets" (
  "id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "order_id" UUID,
  "subject" VARCHAR(150) NOT NULL,
  "status" "SupportStatus" NOT NULL DEFAULT 'OPEN',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "support_tickets_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "support_tickets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "support_tickets_user_id_created_at_id_idx" ON "support_tickets"("user_id", "created_at", "id");
CREATE INDEX "support_tickets_status_updated_at_id_idx" ON "support_tickets"("status", "updated_at", "id");
CREATE TABLE "support_messages" (
  "id" UUID NOT NULL,
  "ticket_id" UUID NOT NULL,
  "author_id" UUID NOT NULL,
  "from_admin" BOOLEAN NOT NULL DEFAULT false,
  "body" VARCHAR(2000) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "support_messages_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "support_messages_ticket_id_created_at_id_idx" ON "support_messages"("ticket_id", "created_at", "id");
