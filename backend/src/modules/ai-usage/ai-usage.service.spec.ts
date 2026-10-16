import { ConfigService } from '@nestjs/config';
import { AiUsageService } from './ai-usage.service.js';
import { aiResponseUsage } from './ai-pricing.js';
import { AiProviderService } from '../ai/ai-provider.service.js';
import type { AiCreditsService } from '../ai-credits/ai-credits.service.js';
import type { PrismaService } from '../../database/prisma.service.js';

const response = () => ({
  id: 'resp_test',
  model: 'gpt-4o-mini-2024-07-18',
  service_tier: 'default',
  status: 'completed',
  usage: {
    input_tokens: 2000,
    output_tokens: 500,
    input_tokens_details: { cached_tokens: 1000 },
  },
  output: [
    { content: [{ type: 'output_text', text: '{"description":"Test"}' }] },
  ],
});
describe('AI cost accounting', () => {
  const create = vi.fn(),
    update = vi.fn();
  const usage = new AiUsageService({
    aiRequest: { create, update },
  } as unknown as PrismaService);
  beforeEach(() => {
    create.mockReset().mockResolvedValue({ id: 'request-test' });
    update.mockReset().mockResolvedValue({});
  });
  afterEach(() => vi.unstubAllGlobals());
  it('prices cached input once and snapshots exact decimal rates', () => {
    const result = aiResponseUsage(response());
    expect(result.cost?.costUsd.toString()).toBe('0.000525');
    expect(result.cost?.cachedRate.toString()).toBe('0.075');
    expect(result.tokens).toEqual({
      inputTokens: 2000,
      cachedTokens: 1000,
      outputTokens: 500,
    });
  });
  it.each(['unknown-model', 'gpt-4o-mini-unverified'])(
    'does not guess a price for %s',
    (model) => {
      expect(aiResponseUsage({ ...response(), model }).cost).toBeNull();
    },
  );
  it.each(['priority', 'flex', undefined])(
    'does not apply standard prices to tier %s',
    (service_tier) => {
      expect(aiResponseUsage({ ...response(), service_tier }).cost).toBeNull();
    },
  );
  it.each([
    undefined,
    { input_tokens: -1 },
    {
      input_tokens: 10,
      output_tokens: 1,
      input_tokens_details: { cached_tokens: 11 },
    },
    { input_tokens: 10, output_tokens: 1 },
    {
      input_tokens: 10.5,
      output_tokens: 1,
      input_tokens_details: { cached_tokens: 0 },
    },
  ])('keeps missing or invalid usage unpriced rather than zero', (tokens) => {
    const result = aiResponseUsage({ ...response(), usage: tokens });
    expect(result.tokens).toBeNull();
    expect(result.cost).toBeNull();
  });
  it('logs a provider reply before the consumer can reject its output', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(response()))),
    );
    const credits = {
      reserve: vi.fn().mockResolvedValue({ id: 'credit' }),
      complete: vi.fn(),
      release: vi.fn(),
    };
    const provider = new AiProviderService(
      new ConfigService({ OPENAI_API_KEY: 'test-only' }),
      credits as unknown as AiCreditsService,
      usage,
    );
    await expect(
      provider.generate(
        'user',
        'listing_description',
        'private prompt',
        { secret: 'private' },
        {},
        undefined,
        () => {
          throw new Error('Invalid business output');
        },
      ),
    ).rejects.toBeDefined();
    expect(update.mock.calls[0][0].data.costUsd.toString()).toBe('0.000525');
    expect(credits.release).toHaveBeenCalled();
    expect(credits.complete).not.toHaveBeenCalled();
    expect(JSON.stringify(create.mock.calls)).not.toContain('private');
    expect(JSON.stringify(update.mock.calls)).not.toContain('private');
  });
  it('keeps billable tokens for incomplete responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ ...response(), status: 'incomplete' })),
        ),
    );
    await usage.request('support_faq', 'gpt-4o-mini', {});
    expect(update.mock.calls[0][0].data.status).toBe('FAILED');
    expect(update.mock.calls[0][0].data.costUsd.toString()).toBe('0.000525');
  });
  it('records timeouts as failed with unknown cost', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timeout')));
    await expect(
      usage.request('support_faq', 'gpt-4o-mini', {}),
    ).rejects.toThrow('timeout');
    expect(update.mock.calls[0][0].data.status).toBe('FAILED');
    expect(update.mock.calls[0][0].data.costUsd).toBeUndefined();
  });
  it('does not call OpenAI when the initial log cannot be persisted', async () => {
    create.mockRejectedValue(new Error('database down'));
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    await expect(
      usage.request('support_faq', 'gpt-4o-mini', {}),
    ).rejects.toThrow('database down');
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('keeps the original reply usable if the final log update fails', async () => {
    update.mockRejectedValue(new Error('database down'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify(response()))),
    );
    expect((await usage.request('support_faq', 'gpt-4o-mini', {})).ok).toBe(
      true,
    );
  });
});
