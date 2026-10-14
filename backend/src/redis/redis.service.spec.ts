import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service.js';
import { RateLimitService } from './rate-limit.service.js';

const { client } = vi.hoisted(() => {
  const client = {
    isReady: true,
    isOpen: true,
    on: vi.fn(),
    connect: vi.fn(),
    destroy: vi.fn(),
    eval: vi.fn(),
    get: vi.fn(),
    ping: vi.fn(),
    withCommandOptions: vi.fn(),
  };
  client.withCommandOptions.mockReturnValue(client);
  return { client };
});
vi.mock('redis', () => ({ createClient: () => client }));

describe('Redis response deadlines', () => {
  let redis: RedisService;
  beforeEach(async () => {
    vi.useFakeTimers();
    client.connect.mockResolvedValue(client);
    for (const command of [client.eval, client.get, client.ping])
      command.mockImplementation(() => new Promise(() => {}));
    redis = new RedisService(
      new ConfigService({ REDIS_URL: 'redis://localhost:6379' }),
    );
    await redis.onModuleInit();
  });
  afterEach(() => {
    redis.onModuleDestroy();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('returns 503 when a sent rate-limit command never gets a response', async () => {
    const response = expect(
      new RateLimitService(redis).check('stalled', 10, 60000),
    ).rejects.toMatchObject({ status: 503 });
    await vi.advanceTimersByTimeAsync(1000);
    await response;
  });

  it('bounds cache reads, cache writes and readiness checks after commands are sent', async () => {
    const results = Promise.all([
      redis.getTile('path'),
      redis.setTile('path', Buffer.from('tile')),
      redis.status(),
    ]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await results).toEqual([undefined, undefined, 'down']);
  });

  it('bounds initial connection attempts and destroys an unfinished connection', async () => {
    client.connect.mockImplementationOnce(() => new Promise(() => {}));
    const response = expect(redis.onModuleInit()).rejects.toThrow(
      'Cannot connect to configured Redis',
    );
    await vi.advanceTimersByTimeAsync(4000);
    await response;
    expect(client.destroy).toHaveBeenCalled();
  });
});
