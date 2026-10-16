import { Prisma } from '../../generated/prisma/client.js';

export const AI_PRICING_VERSION = 'openai-2026-10-16';
// USD per million tokens. Snapshot on every request; never reprice history.
// https://developers.openai.com/api/docs/models/gpt-4o-mini
const mini = { input: '0.15', cached: '0.075', output: '0.60' };
const prices: Record<string, typeof mini> = {
  'gpt-4o-mini': mini,
  'gpt-4o-mini-2024-07-18': mini,
};

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
function token(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 2147483647
  );
}
export function aiResponseUsage(body: unknown) {
  const response = object(body);
  const usage = object(response.usage);
  const input = usage.input_tokens,
    output = usage.output_tokens;
  const cached = object(usage.input_tokens_details).cached_tokens;
  const tokens =
    token(input) && token(output) && token(cached) && cached <= input
      ? { inputTokens: input, cachedTokens: cached, outputTokens: output }
      : null;
  const model = typeof response.model === 'string' ? response.model : null;
  const tier =
    typeof response.service_tier === 'string' ? response.service_tier : null;
  const price =
    model && Object.hasOwn(prices, model) && tier === 'default'
      ? prices[model]
      : null;
  const cost =
    tokens && price
      ? {
          inputRate: new Prisma.Decimal(price.input),
          cachedRate: new Prisma.Decimal(price.cached),
          outputRate: new Prisma.Decimal(price.output),
          costUsd: new Prisma.Decimal(tokens.inputTokens - tokens.cachedTokens)
            .mul(price.input)
            .add(new Prisma.Decimal(tokens.cachedTokens).mul(price.cached))
            .add(new Prisma.Decimal(tokens.outputTokens).mul(price.output))
            .div(1000000),
          pricingVersion: AI_PRICING_VERSION,
        }
      : null;
  return {
    model: model?.slice(0, 100),
    responseId:
      typeof response.id === 'string' ? response.id.slice(0, 100) : null,
    serviceTier: tier?.slice(0, 30) ?? null,
    completed: response.status === 'completed',
    tokens,
    cost,
  };
}
