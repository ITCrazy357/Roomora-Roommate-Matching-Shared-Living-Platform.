-- One statement, outside an explicit transaction, to keep writes available.
CREATE INDEX CONCURRENTLY "listings_public_search_trgm_idx"
ON "listings" USING GIN (
  "title" gin_trgm_ops, "description" gin_trgm_ops,
  "province_name" gin_trgm_ops, "ward_name" gin_trgm_ops
)
WHERE "status" = 'PUBLISHED' AND "deleted_at" IS NULL;
