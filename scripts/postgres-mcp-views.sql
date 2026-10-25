-- Development diagnostics only. These views deliberately omit personal rows,
-- authentication material, provider payloads and migration logs.
CREATE SCHEMA mcp_inspect;
REVOKE ALL ON SCHEMA mcp_inspect FROM PUBLIC;

CREATE VIEW mcp_inspect.table_inventory AS
SELECT n.nspname AS schema_name, c.relname AS table_name,
       c.reltuples::bigint AS estimated_rows,
       pg_catalog.pg_total_relation_size(c.oid) AS total_bytes
FROM pg_catalog.pg_class c
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p');

CREATE VIEW mcp_inspect.column_inventory AS
SELECT n.nspname AS schema_name, c.relname AS table_name, a.attname AS column_name,
       pg_catalog.format_type(a.atttypid, a.atttypmod) AS data_type, a.attnotnull AS not_null
FROM pg_catalog.pg_attribute a
JOIN pg_catalog.pg_class c ON c.oid = a.attrelid
JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  AND a.attnum > 0 AND NOT a.attisdropped;

CREATE VIEW mcp_inspect.index_inventory AS
SELECT schemaname AS schema_name, tablename AS table_name, indexname AS index_name, indexdef AS definition
FROM pg_catalog.pg_indexes WHERE schemaname = 'public';

CREATE VIEW mcp_inspect.migration_status AS
SELECT migration_name, started_at, finished_at, rolled_back_at, applied_steps_count
FROM public._prisma_migrations;

CREATE VIEW mcp_inspect.listing_counts AS
SELECT type, status, count(*) AS total FROM public.listings GROUP BY type, status;

CREATE VIEW mcp_inspect.expense_counts AS
SELECT category, status, count(*) AS total, sum(amount)::bigint AS total_amount
FROM public.expenses GROUP BY category, status;

CREATE VIEW mcp_inspect.service_order_counts AS
SELECT provider, status, count(*) AS total, sum(amount)::bigint AS total_amount
FROM public.service_orders GROUP BY provider, status;

GRANT USAGE ON SCHEMA mcp_inspect TO roomora_mcp_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA mcp_inspect TO roomora_mcp_readonly;
-- Do not grant access to public tables or future objects automatically.
