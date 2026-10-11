-- Activity is separate from session last_seen_at: SSE and polling are not user interaction.
ALTER TABLE "users" ADD COLUMN "last_active_at" TIMESTAMP(3);
ALTER TABLE "sessions" ADD COLUMN "last_active_at" TIMESTAMP(3);
