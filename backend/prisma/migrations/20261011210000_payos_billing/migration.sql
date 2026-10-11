ALTER TABLE "service_orders"
  ADD COLUMN "provider_order_code" VARCHAR(16),
  ADD COLUMN "provider_link_id" VARCHAR(32),
  ALTER COLUMN "provider_trans_id" TYPE VARCHAR(128);

DROP INDEX "service_orders_provider_trans_id_key";
CREATE UNIQUE INDEX "service_orders_provider_order_code_key" ON "service_orders"("provider_order_code");
CREATE UNIQUE INDEX "service_orders_provider_provider_trans_id_key" ON "service_orders"("provider", "provider_trans_id");

ALTER TABLE "service_payment_events" ALTER COLUMN "trans_id" TYPE VARCHAR(128);
