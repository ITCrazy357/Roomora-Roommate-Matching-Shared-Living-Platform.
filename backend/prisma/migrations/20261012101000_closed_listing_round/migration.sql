-- Closed listings already started their next round in the preceding migration.
-- End their previous promotion without altering payment/benefit history.
UPDATE listings SET boost_until = NULL WHERE status = 'CLOSED';
UPDATE service_orders SET status = 'EXPIRED', pay_url = NULL
WHERE status = 'PENDING' AND listing_id IN (
  SELECT id FROM listings WHERE status = 'CLOSED'
);
