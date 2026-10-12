BEGIN;
-- CreateEnum
CREATE TYPE "ServiceRefundStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ServiceRefundMethod" AS ENUM ('MANUAL_BANK', 'MOMO');

-- CreateEnum
CREATE TYPE "ServiceRefundSource" AS ENUM ('USER', 'SYSTEM');

-- AlterTable
ALTER TABLE "service_orders" ADD COLUMN     "payer_account" VARCHAR(50),
ADD COLUMN     "payer_bank_id" VARCHAR(50),
ADD COLUMN     "payer_bank_name" VARCHAR(100),
ADD COLUMN     "payer_name" VARCHAR(100),
ADD COLUMN     "refunded_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "service_refund_requests" ADD COLUMN     "account_name" VARCHAR(100),
ADD COLUMN     "account_number" VARCHAR(50),
ADD COLUMN     "amount" INTEGER,
ADD COLUMN     "approved_at" TIMESTAMP(3),
ADD COLUMN     "bank_id" VARCHAR(50),
ADD COLUMN     "bank_name" VARCHAR(100),
ADD COLUMN     "completed_at" TIMESTAMP(3),
ADD COLUMN     "decision_note" VARCHAR(1000),
ADD COLUMN     "different_account_reason" VARCHAR(1000),
ADD COLUMN     "gateway_lease_at" TIMESTAMP(3),
ADD COLUMN     "last_error" VARCHAR(1000),
ADD COLUMN     "method" "ServiceRefundMethod" NOT NULL DEFAULT 'MANUAL_BANK',
ADD COLUMN     "processing_at" TIMESTAMP(3),
ADD COLUMN     "refund_reference" VARCHAR(128),
ADD COLUMN     "source" "ServiceRefundSource" NOT NULL DEFAULT 'USER',
ADD COLUMN     "status" "ServiceRefundStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "transferred_at" TIMESTAMP(3),
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "verification_note" VARCHAR(1000),
ADD COLUMN     "verification_reference" VARCHAR(200),
ADD COLUMN     "verified_at" TIMESTAMP(3),
ADD COLUMN     "verified_by_id" UUID,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- Preserve all legacy requests. Amount and method come from their paid orders.
UPDATE service_refund_requests r SET amount = o.amount, updated_at = r.created_at,
method = CASE WHEN o.provider = 'MOMO_SANDBOX' THEN 'MOMO'::"ServiceRefundMethod" ELSE 'MANUAL_BANK'::"ServiceRefundMethod" END
FROM service_orders o WHERE r.order_id = o.id;
ALTER TABLE service_refund_requests ALTER COLUMN amount SET NOT NULL;
ALTER TABLE service_refund_requests ADD CONSTRAINT service_refund_amount_positive CHECK (amount > 0);
UPDATE service_refund_requests r SET source = 'SYSTEM'
WHERE (r.reason LIKE 'Thanh toán đến sau khi tin không còn đủ điều kiện đẩy.%'
  OR r.reason LIKE 'Tin đã thanh toán trong cùng đợt đăng.%')
AND NOT EXISTS (SELECT 1 FROM listing_boosts b WHERE b.order_id = r.order_id)
AND EXISTS (SELECT 1 FROM service_payment_events e WHERE e.order_id = r.order_id AND e.result_code = 0);

-- CreateTable
CREATE TABLE "service_refund_actions" (
    "id" UUID NOT NULL,
    "refund_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(50) NOT NULL,
    "from_status" "ServiceRefundStatus",
    "to_status" "ServiceRefundStatus" NOT NULL,
    "note" VARCHAR(1000) NOT NULL,
    "details" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_refund_actions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_refund_proofs" (
    "id" UUID NOT NULL,
    "refund_id" UUID NOT NULL,
    "uploaded_by_id" UUID NOT NULL,
    "data" BYTEA NOT NULL,
    "mime_type" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_refund_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "service_refund_actions_refund_id_created_at_id_idx" ON "service_refund_actions"("refund_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "service_refund_proofs_refund_id_created_at_idx" ON "service_refund_proofs"("refund_id", "created_at");

-- CreateIndex
CREATE INDEX "service_refund_requests_status_created_at_id_idx" ON "service_refund_requests"("status", "created_at", "id");

-- CreateIndex
CREATE UNIQUE INDEX "service_refund_requests_method_refund_reference_key" ON "service_refund_requests"("method", "refund_reference");

-- AddForeignKey
ALTER TABLE "service_refund_actions" ADD CONSTRAINT "service_refund_actions_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "service_refund_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_refund_actions" ADD CONSTRAINT "service_refund_actions_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_refund_proofs" ADD CONSTRAINT "service_refund_proofs_refund_id_fkey" FOREIGN KEY ("refund_id") REFERENCES "service_refund_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO service_refund_actions (id, refund_id, actor_id, action, to_status, note, details, created_at)
SELECT gen_random_uuid(), r.id, CASE WHEN r.source = 'USER' THEN o.user_id ELSE NULL END,
'LEGACY_IMPORTED', r.status, 'Giữ yêu cầu có sẵn; chưa ghi nhận phê duyệt hoặc hoàn tiền.',
jsonb_build_object('amount', r.amount, 'source', r.source, 'version', r.version), r.created_at
FROM service_refund_requests r JOIN service_orders o ON o.id = r.order_id;
COMMIT;
