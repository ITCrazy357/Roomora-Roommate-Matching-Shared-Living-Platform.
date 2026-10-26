-- Nullable scheduling metadata keeps existing orders eligible without a backfill.
ALTER TABLE "service_orders" ADD COLUMN "reconcile_after" TIMESTAMP(3);
