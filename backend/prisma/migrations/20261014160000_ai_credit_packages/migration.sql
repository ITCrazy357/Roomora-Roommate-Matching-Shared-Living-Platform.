ALTER TABLE service_orders ALTER COLUMN listing_id DROP NOT NULL;
ALTER TABLE service_orders ADD COLUMN credit_amount INTEGER;
ALTER TABLE service_orders ADD CONSTRAINT service_order_ai_plan CHECK (
  (plan_code = 'AI_50_CREDITS' AND listing_id IS NULL AND credit_amount IS NOT DISTINCT FROM 50 AND amount = 59000 AND duration_days = 0)
  OR (plan_code <> 'AI_50_CREDITS' AND listing_id IS NOT NULL AND credit_amount IS NULL)
);
CREATE UNIQUE INDEX service_orders_one_pending_ai ON service_orders(user_id)
WHERE status = 'PENDING' AND plan_code = 'AI_50_CREDITS';
CREATE TABLE ai_wallets (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  free_used INTEGER NOT NULL DEFAULT 0 CHECK (free_used BETWEEN 0 AND 5)
);
INSERT INTO ai_wallets(user_id, free_used)
SELECT user_id, LEAST(SUM(count), 5)::integer FROM ai_usage GROUP BY user_id;
CREATE TABLE ai_credit_packs (
  order_id UUID PRIMARY KEY REFERENCES service_orders(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credits INTEGER NOT NULL CHECK (credits = 50),
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0 AND used <= credits),
  held BOOLEAN NOT NULL DEFAULT false,
  revoked_at TIMESTAMP(3), created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ai_credit_packs_user_id_revoked_at_created_at_idx ON ai_credit_packs(user_id, revoked_at, created_at);
CREATE TYPE "AiCreditUseStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TABLE ai_credit_uses (
  id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  pack_id UUID REFERENCES ai_credit_packs(order_id) ON DELETE CASCADE,
  status "AiCreditUseStatus" NOT NULL DEFAULT 'PENDING',
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ai_credit_uses_user_id_status_created_at_idx ON ai_credit_uses(user_id, status, created_at);
