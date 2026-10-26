// Read-only release checks. LIMIT 0 resolves columns without reading user data.
export const coreSchemaReadinessQuery = `
SELECT count(*) = 0 AS core_ready FROM (
  SELECT u.id, p.user_id, l.id AS listing_id
  FROM public.users u, public.profiles p, public.listings l LIMIT 0
) probe`;

export const schemaReadinessQuery = `
SELECT
  (SELECT count(*) = 0 FROM (
    SELECT u.password_hash, p.budget_min, p.budget_max, l.status, o.reconcile_after
    FROM users u, profiles p, listings l, service_orders o LIMIT 0
  ) probe)
  AND EXISTS (
    SELECT 1 FROM _prisma_migrations
    WHERE migration_name = '20261026120200_profile_search_index'
      AND finished_at IS NOT NULL AND rolled_back_at IS NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM _prisma_migrations
    WHERE finished_at IS NULL AND rolled_back_at IS NULL
  )
  AND (SELECT count(*) = 2 FROM pg_index i
    JOIN pg_class c ON c.oid = i.indexrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND i.indisvalid AND i.indisready
      AND c.relname IN ('listings_public_search_trgm_idx', 'profiles_public_search_trgm_idx'))
  AND EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND conname = 'profiles_budget_range_valid' AND convalidated)
  AS schema_ready`;
