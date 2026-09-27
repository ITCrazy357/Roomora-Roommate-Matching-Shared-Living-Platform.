BEGIN;

ALTER TABLE "users" ALTER COLUMN "password_hash" DROP NOT NULL;

CREATE TABLE "google_accounts" (
    "user_id" UUID NOT NULL,
    "google_id" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "google_accounts_pkey" PRIMARY KEY ("user_id"),
    CONSTRAINT "google_accounts_user_id_fkey" FOREIGN KEY ("user_id")
        REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "google_accounts_google_id_key" ON "google_accounts"("google_id");

CREATE TABLE "google_login_states" (
    "state_hash" CHAR(64) NOT NULL,
    "browser_token_hash" CHAR(64) NOT NULL,
    "nonce" VARCHAR(128) NOT NULL,
    "code_verifier" VARCHAR(128) NOT NULL,
    "link_session_id" UUID,
    "expires_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "google_login_states_pkey" PRIMARY KEY ("state_hash"),
    CONSTRAINT "google_login_states_link_session_id_fkey" FOREIGN KEY ("link_session_id")
        REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "google_login_states_expires_at_idx" ON "google_login_states"("expires_at");
CREATE INDEX "google_login_states_link_session_id_idx" ON "google_login_states"("link_session_id");

COMMIT;
