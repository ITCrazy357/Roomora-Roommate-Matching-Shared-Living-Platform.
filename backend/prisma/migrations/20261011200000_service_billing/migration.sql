-- CreateEnum
CREATE TYPE "ServiceOrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'EXPIRED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SERVICE';

-- AlterTable
ALTER TABLE "listings" ADD COLUMN     "boost_until" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "service_orders" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "plan_code" VARCHAR(50) NOT NULL,
    "plan_name" VARCHAR(150) NOT NULL,
    "amount" INTEGER NOT NULL,
    "duration_days" INTEGER NOT NULL,
    "buyer_name" VARCHAR(100) NOT NULL,
    "buyer_email" VARCHAR(320) NOT NULL,
    "listing_title" VARCHAR(150) NOT NULL,
    "status" "ServiceOrderStatus" NOT NULL DEFAULT 'PENDING',
    "provider" VARCHAR(30) NOT NULL DEFAULT 'MOMO_SANDBOX',
    "provider_trans_id" VARCHAR(30),
    "pay_url" VARCHAR(2000),
    "checkout_lease_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "paid_at" TIMESTAMP(3),
    "result_code" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "service_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listing_boosts" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "listing_id" UUID NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "listing_boosts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_refund_requests" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "reason" VARCHAR(1000) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_refund_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "service_payment_events" (
    "id" UUID NOT NULL,
    "order_id" UUID NOT NULL,
    "signature" VARCHAR(64) NOT NULL,
    "result_code" INTEGER NOT NULL,
    "trans_id" VARCHAR(30) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "service_payment_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "service_orders_provider_trans_id_key" ON "service_orders"("provider_trans_id");

-- CreateIndex
CREATE INDEX "service_orders_user_id_created_at_id_idx" ON "service_orders"("user_id", "created_at", "id");

-- CreateIndex
CREATE INDEX "service_orders_status_expires_at_idx" ON "service_orders"("status", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "service_orders_user_id_client_id_key" ON "service_orders"("user_id", "client_id");

-- CreateIndex
CREATE UNIQUE INDEX "listing_boosts_order_id_key" ON "listing_boosts"("order_id");

-- CreateIndex
CREATE INDEX "listing_boosts_listing_id_ends_at_idx" ON "listing_boosts"("listing_id", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "service_refund_requests_order_id_key" ON "service_refund_requests"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "service_payment_events_signature_key" ON "service_payment_events"("signature");

-- CreateIndex
CREATE INDEX "service_payment_events_order_id_received_at_idx" ON "service_payment_events"("order_id", "received_at");

-- CreateIndex
CREATE INDEX "listings_status_boost_until_idx" ON "listings"("status", "boost_until");

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_orders" ADD CONSTRAINT "service_orders_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_boosts" ADD CONSTRAINT "listing_boosts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "listing_boosts" ADD CONSTRAINT "listing_boosts_listing_id_fkey" FOREIGN KEY ("listing_id") REFERENCES "listings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_refund_requests" ADD CONSTRAINT "service_refund_requests_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "service_payment_events" ADD CONSTRAINT "service_payment_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "service_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
