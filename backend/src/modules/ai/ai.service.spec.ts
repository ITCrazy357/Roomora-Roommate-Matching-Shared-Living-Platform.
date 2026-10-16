import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { AiProviderService } from './ai-provider.service.js';
import { AiUsageService } from '../ai-usage/ai-usage.service.js';
import type { AiCreditsService } from '../ai-credits/ai-credits.service.js';
import { AiListingsService } from './ai-listings.service.js';
import { AiReceiptsService } from './ai-receipts.service.js';
import { AiInsightsService } from './ai-insights.service.js';
import { AiDescriptionDto } from './dto/ai.dto.js';
import { LocationsService } from '../locations/locations.service.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { HouseAccessService } from '../houses/house-access.service.js';
import type { HouseReportsService } from '../household/house-reports.service.js';
import type { PeopleDiscoveryService } from '../people/people-discovery.service.js';

const complete = (value: unknown) => ({
  ok: true,
  json: async () => ({
    status: 'completed',
    output: [
      { content: [{ type: 'output_text', text: JSON.stringify(value) }] },
    ],
  }),
});
const costs = new AiUsageService({
  aiRequest: {
    create: async () => ({ id: 'request-test' }),
    update: async () => ({}),
  },
} as unknown as PrismaService);
describe('AI provider boundaries', () => {
  const reserve = vi.fn();
  const completed = vi.fn(),
    release = vi.fn();
  const db = {
    reserve,
    complete: completed,
    release,
  } as unknown as AiCreditsService;
  const configured = () =>
    new AiProviderService(
      new ConfigService({ OPENAI_API_KEY: 'test-only' }),
      db,
      costs,
    );
  beforeEach(() => {
    reserve.mockReset().mockResolvedValue({ id: 'reservation' });
    completed.mockReset().mockResolvedValue(undefined);
    release.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllGlobals());
  it('keeps missing configuration usable without spending quota', async () => {
    await expect(
      new AiProviderService(
        new ConfigService({ OPENAI_API_KEY: '' }),
        db,
        costs,
      ).generate('u', 't', '', {}, {}),
    ).rejects.toMatchObject({ response: { code: 'AI_UNAVAILABLE' } });
    expect(reserve).not.toHaveBeenCalled();
  });
  it('does not call the provider when quota is exhausted', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    reserve.mockRejectedValue({ response: { code: 'AI_LIMIT_REACHED' } });
    await expect(
      configured().generate('u', 't', '', {}, {}),
    ).rejects.toMatchObject({ response: { code: 'AI_LIMIT_REACHED' } });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('uses structured output without storage or tools', async () => {
    const fetcher = vi.fn().mockResolvedValue(complete({ ids: ['one'] }));
    vi.stubGlobal('fetch', fetcher);
    expect(
      await configured().generate(
        'u',
        'test',
        'Rules',
        { total: 3 },
        { type: 'object' },
      ),
    ).toEqual({ ids: ['one'] });
    const body = JSON.parse(fetcher.mock.calls[0][1].body as string);
    expect(body.store).toBe(false);
    expect(body.service_tier).toBe('auto');
    expect(body.tools).toBeUndefined();
    expect(body.text.format.strict).toBe(true);
    expect(fetcher.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
  it.each([
    { ok: false },
    { ok: true, json: async () => ({ status: 'incomplete' }) },
    {
      ok: true,
      json: async () => ({
        status: 'completed',
        output: [{ content: [{ type: 'refusal' }] }],
      }),
    },
    {
      ok: true,
      json: async () => ({
        status: 'completed',
        output: [{ content: [{ type: 'output_text', text: 'broken' }] }],
      }),
    },
  ])('rejects provider failures or invalid output', async (reply) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(reply));
    await expect(
      configured().generate('u', 't', '', {}, {}),
    ).rejects.toMatchObject({ response: { code: 'AI_UNAVAILABLE' } });
  });
  it('releases concurrency slots after a timeout', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('timeout'));
    vi.stubGlobal('fetch', fetcher);
    const provider = configured();
    for (let i = 0; i < 5; i++)
      await expect(
        provider.generate('u', 't', '', {}, {}),
      ).rejects.toMatchObject({ response: { code: 'AI_UNAVAILABLE' } });
    expect(fetcher).toHaveBeenCalledTimes(5);
    expect(release).toHaveBeenCalledTimes(5);
    expect(completed).not.toHaveBeenCalled();
  });
  it('returns a reserved credit when business output validation fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(complete({ spentOn: 'invalid' })),
    );
    await expect(
      configured().generate('u', 't', '', {}, {}, undefined, () => {
        throw new Error('invalid date');
      }),
    ).rejects.toMatchObject({ response: { code: 'AI_UNAVAILABLE' } });
    expect(release).toHaveBeenCalledTimes(1);
    expect(completed).not.toHaveBeenCalled();
  });
  it('rejects a simultaneous request by the same user', async () => {
    let finish!: (value: unknown) => void;
    vi.stubGlobal(
      'fetch',
      vi.fn(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      ),
    );
    const provider = configured();
    const first = provider.generate('u', 't', '', {}, {});
    await vi.waitFor(() => expect(finish).toBeDefined());
    await expect(provider.generate('u', 't', '', {}, {})).rejects.toMatchObject(
      { response: { code: 'AI_BUSY' } },
    );
    finish(complete({ text: 'done' }));
    await first;
  });
});

describe('AI business proposals', () => {
  const generate = vi.fn();
  function respond(value: unknown) {
    generate.mockImplementation(async (...args: unknown[]) => {
      const decode = args[6] as ((raw: unknown) => unknown) | undefined;
      return decode ? decode(value) : value;
    });
  }
  const provider = { generate } as unknown as AiProviderService;
  const listings = new AiListingsService(provider, new LocationsService());
  beforeEach(() => generate.mockReset());
  it.each(['ROOMMATE', 'ROOM_WANTED', 'ROOM_RENTAL'] as const)(
    'describes %s using only appropriate public facts',
    async (type) => {
      respond({
        description: 'Mô tả từ dữ liệu công khai.',
      });
      const dto = Object.assign(new AiDescriptionDto(), {
        type,
        hasRoom: false,
        title: 'Nhu cầu chỗ ở',
        privateAddress: 'private-secret',
        latitude: 16.01,
        longitude: 108.01,
        area: 22,
        deposit: 900000,
        currentResidents: 2,
        availableFrom: '2026-11-01',
      });
      await listings.description('u', dto);
      const input = generate.mock.calls[0][3];
      expect(JSON.stringify(input)).not.toContain('private-secret');
      expect(input.latitude).toBeUndefined();
      if (type !== 'ROOM_RENTAL') {
        expect(input.deposit).toBeUndefined();
        expect(input.currentResidents).toBeUndefined();
        expect(input.availableFrom).toBeUndefined();
      }
      if (type === 'ROOMMATE') expect(input.desiredArea).toBeNull();
    },
  );
  it('rejects empty facts before reserving quota', async () => {
    await expect(
      listings.description('u', new AiDescriptionDto()),
    ).rejects.toMatchObject({ response: { code: 'AI_FACTS_REQUIRED' } });
    expect(generate).not.toHaveBeenCalled();
  });
  const filters = {
    type: 'ROOM_RENTAL',
    provinceCode: null,
    minRent: null,
    maxRent: 3000000,
    amenities: ['WIFI'],
    unsupported: ['Không hỗ trợ khoảng cách.'],
  };
  it('returns supported filters and explains unsupported requirements', async () => {
    respond(filters);
    expect(
      await listings.search('u', {
        query: 'Phòng dưới 3 triệu có wifi gần biển',
      }),
    ).toMatchObject({
      filters: { maxRent: 3000000, amenities: ['WIFI'] },
      unsupported: filters.unsupported,
    });
  });
  it.each([
    { maxRent: -1 },
    { maxRent: 1.2 },
    { minRent: 4000000 },
    { provinceCode: 'xx' },
    { type: 'ADMIN' },
    { amenities: ['FREE_RENT'] },
    { amenities: ['WIFI', 'WIFI'] },
    { unsupported: [false] },
  ])('rejects invalid search output: %j', async (bad) => {
    respond({ ...filters, ...bad });
    await expect(
      listings.search('u', { query: 'Nhu cầu tìm phòng' }),
    ).rejects.toMatchObject({ response: { code: 'AI_UNAVAILABLE' } });
  });
  it('rejects access to a house before processing an image', async () => {
    const access = {
      active: vi.fn().mockRejectedValue(new Error('denied')),
    } as unknown as HouseAccessService;
    await expect(
      new AiReceiptsService({} as PrismaService, access, provider).read(
        'u',
        'h',
      ),
    ).rejects.toThrow('denied');
    expect(generate).not.toHaveBeenCalled();
  });
  it('rejects invalid image bytes without calling AI', async () => {
    const access = { active: vi.fn() } as unknown as HouseAccessService;
    const file = { buffer: Buffer.from('not an image') } as Express.Multer.File;
    await expect(
      new AiReceiptsService({} as PrismaService, access, provider).read(
        'u',
        'h',
        file,
      ),
    ).rejects.toMatchObject({ response: { code: 'RECEIPT_INVALID' } });
    expect(generate).not.toHaveBeenCalled();
  });
  it.each(['2026-02-30', '2026-13-01', 'Rau va trai cay, Thit va ca'])(
    'rejects impossible receipt dates: %s',
    async (spentOn) => {
      const access = { active: vi.fn() } as unknown as HouseAccessService;
      const file = {
        buffer: await sharp({
          create: { width: 20, height: 20, channels: 3, background: 'white' },
        })
          .png()
          .toBuffer(),
      } as Express.Multer.File;
      respond({
        title: 'Điện',
        amount: 300000,
        category: 'ELECTRICITY',
        spentOn,
        warnings: [],
      });
      await expect(
        new AiReceiptsService({} as PrismaService, access, provider).read(
          'u',
          'h',
          file,
        ),
      ).rejects.toMatchObject({ response: { code: 'AI_UNAVAILABLE' } });
    },
  );
  it('preserves missing receipt fields and adds a review warning', async () => {
    const access = { active: vi.fn() } as unknown as HouseAccessService;
    const file = {
      buffer: await sharp({
        create: { width: 20, height: 20, channels: 3, background: 'white' },
      })
        .png()
        .toBuffer(),
    } as Express.Multer.File;
    respond({
      title: null,
      amount: null,
      category: null,
      spentOn: null,
      warnings: [],
    });
    const result = await new AiReceiptsService(
      {} as PrismaService,
      access,
      provider,
    ).read('u', 'h', file);
    expect(result.amount).toBeNull();
    expect(result.warnings).toHaveLength(1);
    expect(result).not.toHaveProperty('paidAmount');
  });
  it('uses original matching reasons, score and unknown criteria only', async () => {
    const match = {
      score: 60,
      assessed: 2,
      total: 6,
      reasons: [
        {
          key: 'budget',
          label: 'Ngân sách',
          explanation: 'Chưa đủ thông tin công khai.',
        },
      ],
    };
    const people = {
      getPerson: vi.fn().mockResolvedValue({ match, bio: 'PRIVATE' }),
    } as unknown as PeopleDiscoveryService;
    respond({ ids: ['budget'], score: 100, text: 'FAKE' });
    const result = await new AiInsightsService(
      people,
      {} as HouseReportsService,
      provider,
    ).matching('u', 't');
    expect(result.score).toBe(60);
    expect(result.highlights).toEqual([
      'Ngân sách: Chưa đủ thông tin công khai.',
    ]);
    expect(JSON.stringify(generate.mock.calls[0][3])).not.toContain('PRIVATE');
  });
  it('summarizes original totals including negative corrections without names', async () => {
    const reports = {
      get: vi.fn().mockResolvedValue({
        total: -20,
        count: 1,
        generatedAt: new Date(),
        categories: [
          { category: 'WATER', label: 'Nước', amount: -20, count: 1 },
        ],
        members: [{ displayName: 'PRIVATE' }],
      }),
    } as unknown as HouseReportsService;
    respond({ ids: ['WATER', 'total'] });
    const result = await new AiInsightsService(
      {} as PeopleDiscoveryService,
      reports,
      provider,
    ).summary('u', 'h', '2026-10');
    expect(result.total).toBe(-20);
    expect(result.highlights[0]).toContain('-20');
    expect(JSON.stringify(generate.mock.calls[0][3])).not.toContain('PRIVATE');
  });
  it.each([{ ids: ['fake'] }, { ids: ['budget', 'budget'] }, { ids: [] }])(
    'rejects unsupported insight IDs %j',
    async ({ ids }) => {
      const people = {
        getPerson: vi.fn().mockResolvedValue({
          match: {
            reasons: [{ key: 'budget', label: 'Ngân sách', explanation: 'A' }],
          },
        }),
      } as unknown as PeopleDiscoveryService;
      respond({ ids });
      await expect(
        new AiInsightsService(
          people,
          {} as HouseReportsService,
          provider,
        ).matching('u', 't'),
      ).rejects.toMatchObject({ response: { code: 'AI_UNAVAILABLE' } });
    },
  );
});
