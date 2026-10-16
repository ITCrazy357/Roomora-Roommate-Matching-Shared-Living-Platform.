CREATE TYPE "AiRequestStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');
CREATE TABLE ai_requests (
  id UUID PRIMARY KEY,
  feature VARCHAR(64) NOT NULL,
  model VARCHAR(100) NOT NULL,
  response_id VARCHAR(100),
  service_tier VARCHAR(30),
  status "AiRequestStatus" NOT NULL DEFAULT 'PENDING',
  input_tokens INTEGER,
  cached_tokens INTEGER,
  output_tokens INTEGER,
  input_rate DECIMAL(14,6),
  cached_rate DECIMAL(14,6),
  output_rate DECIMAL(14,6),
  cost_usd DECIMAL(20,12),
  pricing_version VARCHAR(30),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TIMESTAMP(3),
  CONSTRAINT ai_request_tokens CHECK (
    (input_tokens IS NULL AND cached_tokens IS NULL AND output_tokens IS NULL)
    OR (input_tokens IS NOT NULL AND cached_tokens IS NOT NULL AND output_tokens IS NOT NULL
      AND input_tokens >= 0 AND cached_tokens >= 0 AND cached_tokens <= input_tokens AND output_tokens >= 0)
  ),
  CONSTRAINT ai_request_cost CHECK (
    (cost_usd IS NULL AND input_rate IS NULL AND cached_rate IS NULL AND output_rate IS NULL AND pricing_version IS NULL)
    OR (cost_usd IS NOT NULL AND cost_usd >= 0 AND input_tokens IS NOT NULL
      AND input_rate IS NOT NULL AND input_rate >= 0 AND cached_rate IS NOT NULL AND cached_rate >= 0
      AND output_rate IS NOT NULL AND output_rate >= 0 AND pricing_version IS NOT NULL)
  )
);
CREATE INDEX ai_requests_created_at_idx ON ai_requests(created_at);
