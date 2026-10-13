CREATE TABLE "ai_usage" (
  "user_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "month" VARCHAR(7) NOT NULL,
  "count" INTEGER NOT NULL DEFAULT 0 CHECK ("count" >= 0),
  PRIMARY KEY ("user_id", "month")
);
