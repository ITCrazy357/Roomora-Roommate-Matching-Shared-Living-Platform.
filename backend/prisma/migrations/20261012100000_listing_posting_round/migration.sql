ALTER TABLE "listings" ADD COLUMN "posting_round" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "service_orders" ADD COLUMN "posting_round" INTEGER NOT NULL DEFAULT 1;
UPDATE listings SET posting_round = 2 WHERE status = 'CLOSED';

-- Existing orders belong to the initial round. Preserve all payment history.
-- Expire redundant open links before enforcing one pending order per round.
WITH ranked AS (
  SELECT id, row_number() OVER (
    PARTITION BY listing_id, posting_round ORDER BY created_at, id
  ) AS position
  FROM service_orders WHERE status = 'PENDING'
)
UPDATE service_orders SET status = 'EXPIRED'
WHERE id IN (SELECT id FROM ranked WHERE position > 1);

CREATE INDEX "service_orders_listing_id_posting_round_status_idx"
ON "service_orders" ("listing_id", "posting_round", "status");
CREATE UNIQUE INDEX "service_orders_one_pending_per_round"
ON "service_orders" ("listing_id", "posting_round") WHERE status = 'PENDING';
