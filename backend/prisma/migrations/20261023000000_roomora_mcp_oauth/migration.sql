-- CreateTable
CREATE TABLE "mcp_clients" (
    "id" UUID NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_authorizations" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "redirect_uri" VARCHAR(2048) NOT NULL,
    "state" VARCHAR(1024),
    "code_challenge" VARCHAR(43) NOT NULL,
    "code_hash" CHAR(64),
    "resource" VARCHAR(2048) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "approved_at" TIMESTAMP(3),
    "consumed_at" TIMESTAMP(3),
    "user_id" UUID,
    "session_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_grants" (
    "id" UUID NOT NULL,
    "client_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "access_hash" CHAR(64) NOT NULL,
    "resource" VARCHAR(2048) NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "refresh_expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_grants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mcp_refresh_tokens" (
    "hash" CHAR(64) NOT NULL,
    "grant_id" UUID NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mcp_refresh_tokens_pkey" PRIMARY KEY ("hash")
);

-- CreateIndex
CREATE UNIQUE INDEX "mcp_authorizations_code_hash_key" ON "mcp_authorizations"("code_hash");

-- CreateIndex
CREATE INDEX "mcp_authorizations_expires_at_idx" ON "mcp_authorizations"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "mcp_grants_access_hash_key" ON "mcp_grants"("access_hash");

-- CreateIndex
CREATE INDEX "mcp_grants_user_id_revoked_at_refresh_expires_at_idx" ON "mcp_grants"("user_id", "revoked_at", "refresh_expires_at");

-- CreateIndex
CREATE INDEX "mcp_refresh_tokens_grant_id_idx" ON "mcp_refresh_tokens"("grant_id");

-- AddForeignKey
ALTER TABLE "mcp_authorizations" ADD CONSTRAINT "mcp_authorizations_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "mcp_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_authorizations" ADD CONSTRAINT "mcp_authorizations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_authorizations" ADD CONSTRAINT "mcp_authorizations_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_grants" ADD CONSTRAINT "mcp_grants_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "mcp_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_grants" ADD CONSTRAINT "mcp_grants_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_grants" ADD CONSTRAINT "mcp_grants_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mcp_refresh_tokens" ADD CONSTRAINT "mcp_refresh_tokens_grant_id_fkey" FOREIGN KEY ("grant_id") REFERENCES "mcp_grants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

