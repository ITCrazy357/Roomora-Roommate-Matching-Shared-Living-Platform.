-- Keep this single concurrent statement outside an explicit transaction.
CREATE INDEX CONCURRENTLY "service_orders_reconcile_queue_idx"
ON "service_orders" ("reconcile_after" ASC NULLS FIRST, "created_at", "id")
WHERE "provider" = 'PAYOS'
  AND "status" IN ('PENDING', 'EXPIRED', 'CANCELLED')
  AND "provider_link_id" IS NOT NULL;
