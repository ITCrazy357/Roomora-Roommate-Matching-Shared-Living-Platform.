-- Run against the isolated fixture database. EXPLAIN ANALYZE executes these reads.
EXPLAIN (ANALYZE, BUFFERS)
SELECT l.id FROM listings l JOIN users u ON u.id = l.owner_id
WHERE l.status = 'PUBLISHED' AND l.deleted_at IS NULL AND u.locked_at IS NULL
  AND (l.boost_until IS NULL OR l.boost_until <= NOW() OR l.is_full)
ORDER BY l.published_at DESC, l.id DESC LIMIT 12;

EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM listings l JOIN users u ON u.id = l.owner_id
WHERE l.status = 'PUBLISHED' AND l.deleted_at IS NULL AND u.locked_at IS NULL;

EXPLAIN (ANALYZE, BUFFERS)
SELECT id FROM notifications
WHERE email_required = true AND email_sent_at IS NULL
  AND email_next_at <= NOW() AND email_attempts < 5
ORDER BY email_next_at LIMIT 5;
