CREATE INDEX CONCURRENTLY "profiles_public_search_trgm_idx"
ON "profiles" USING GIN ("display_name" gin_trgm_ops, "bio" gin_trgm_ops)
WHERE "visibility" = 'PUBLIC';
