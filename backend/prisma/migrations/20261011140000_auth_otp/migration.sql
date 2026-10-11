ALTER TYPE "AuthTokenType" ADD VALUE 'PASSWORD_RESET_GRANT';

CREATE TABLE "auth_otps" (
  "id" UUID NOT NULL,
  "challenge_id" UUID NOT NULL,
  "email" VARCHAR(320) NOT NULL,
  "type" "AuthTokenType" NOT NULL,
  "user_id" UUID,
  "code_hash" CHAR(64) NOT NULL,
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "expires_at" TIMESTAMP(3) NOT NULL,
  "consumed_at" TIMESTAMP(3),
  "last_sent_at" TIMESTAMP(3) NOT NULL,
  "send_window_at" TIMESTAMP(3) NOT NULL,
  "send_count" INTEGER NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "auth_otps_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "auth_otps_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "auth_otps_attempts_check" CHECK ("attempts" BETWEEN 0 AND 5),
  CONSTRAINT "auth_otps_send_count_check" CHECK ("send_count" > 0),
  CONSTRAINT "auth_otps_type_check" CHECK ("type" IN ('EMAIL_VERIFICATION', 'PASSWORD_RESET'))
);
CREATE UNIQUE INDEX "auth_otps_challenge_id_key" ON "auth_otps"("challenge_id");
CREATE UNIQUE INDEX "auth_otps_email_type_key" ON "auth_otps"("email", "type");
CREATE INDEX "auth_otps_expires_at_idx" ON "auth_otps"("expires_at");

-- Old email links must no longer grant verification or password reset.
UPDATE "auth_tokens" SET "consumed_at" = CURRENT_TIMESTAMP WHERE "consumed_at" IS NULL;
