CREATE TYPE "ConnectionStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');
CREATE TYPE "UserReportReason" AS ENUM ('SPAM', 'HARASSMENT', 'SCAM', 'INAPPROPRIATE', 'OTHER');
CREATE TYPE "UserReportStatus" AS ENUM ('OPEN', 'RESOLVED', 'DISMISSED');

CREATE TABLE "connections" (
  "id" UUID NOT NULL,
  "pair_key" VARCHAR(73) NOT NULL,
  "sender_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "receiver_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" "ConnectionStatus" NOT NULL DEFAULT 'PENDING',
  "message" VARCHAR(500) NOT NULL DEFAULT '',
  "version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "connections_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "connections_different_users" CHECK ("sender_id" <> "receiver_id"),
  CONSTRAINT "connections_pair_key" CHECK ("pair_key" = LEAST("sender_id"::text, "receiver_id"::text) || ':' || GREATEST("sender_id"::text, "receiver_id"::text))
);
CREATE UNIQUE INDEX "connections_pair_key_key" ON "connections"("pair_key");
CREATE INDEX "connections_receiver_id_status_created_at_idx" ON "connections"("receiver_id", "status", "created_at");
CREATE INDEX "connections_sender_id_status_created_at_idx" ON "connections"("sender_id", "status", "created_at");

CREATE TABLE "connection_attempts" (
  "id" UUID NOT NULL,
  "sender_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "connection_attempts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "connection_attempts_sender_id_created_at_idx" ON "connection_attempts"("sender_id", "created_at");

CREATE TABLE "user_blocks" (
  "blocker_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "target_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_blocks_pkey" PRIMARY KEY ("blocker_id", "target_id"),
  CONSTRAINT "user_blocks_different_users" CHECK ("blocker_id" <> "target_id")
);
CREATE INDEX "user_blocks_target_id_blocker_id_idx" ON "user_blocks"("target_id", "blocker_id");

CREATE TABLE "user_reports" (
  "id" UUID NOT NULL,
  "reporter_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "target_id" UUID NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "reason" "UserReportReason" NOT NULL,
  "details" VARCHAR(1000) NOT NULL,
  "status" "UserReportStatus" NOT NULL DEFAULT 'OPEN',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "user_reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "user_reports_different_users" CHECK ("reporter_id" <> "target_id")
);
CREATE UNIQUE INDEX "user_reports_reporter_id_target_id_key" ON "user_reports"("reporter_id", "target_id");
CREATE INDEX "user_reports_reporter_id_created_at_idx" ON "user_reports"("reporter_id", "created_at");
CREATE INDEX "user_reports_status_created_at_idx" ON "user_reports"("status", "created_at");
CREATE INDEX "profiles_visibility_updated_at_user_id_idx" ON "profiles"("visibility", "updated_at", "user_id");
CREATE INDEX "profiles_desired_locations_idx" ON "profiles" USING GIN ("desired_locations");
