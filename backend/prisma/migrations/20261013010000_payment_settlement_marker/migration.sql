ALTER TABLE "debt_payments" ADD COLUMN "settled_at" TIMESTAMP(3);

-- Settlement requires no pending payments. Keep confirmed transfers from closed
-- rounds in history; they must not appear as advances in the new round.
WITH last_settlement AS (
  SELECT house_id, MAX(closed_at) AS closed_at
  FROM (
    SELECT e.house_id, a.created_at AS closed_at
    FROM expense_adjustments a
    JOIN expenses e ON e.id = a.expense_id
    WHERE a.action = 'SETTLE'
    UNION ALL
    SELECT house_id, settled_at AS closed_at
    FROM expense_corrections
    WHERE settled_at IS NOT NULL
  ) AS rounds
  GROUP BY house_id
)
UPDATE debt_payments p
SET settled_at = s.closed_at
FROM last_settlement s
WHERE p.house_id = s.house_id
  AND p.status = 'CONFIRMED'
  AND p.created_at <= s.closed_at;
