-- Monthly totals can exceed the limit of an individual expense (INTEGER).
ALTER TABLE ai_house_summaries ALTER COLUMN total TYPE BIGINT;
