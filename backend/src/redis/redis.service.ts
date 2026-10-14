import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, type RedisClientType } from 'redis';
import { createHash } from 'node:crypto';

// Check, increment and expiry run together, including concurrent API instances.
const consumeScript = `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= tonumber(ARGV[1]) then return 0 end
count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[2]) end
return 1
`;

// Bound shared tile storage as well as TTL; cache pressure must not evict counters.
const cacheScript = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
redis.call('ZREMRANGEBYSCORE', KEYS[2], '-inf', now)
redis.call('SET', KEYS[1], ARGV[1], 'PX', ARGV[2])
redis.call('ZADD', KEYS[2], now + tonumber(ARGV[2]), KEYS[1])
while redis.call('ZCARD', KEYS[2]) > 128 do
  local oldest = redis.call('ZRANGE', KEYS[2], 0, 0)[1]
  redis.call('DEL', oldest)
  redis.call('ZREM', KEYS[2], oldest)
end
redis.call('PEXPIRE', KEYS[2], ARGV[2])
return 1
`;

@Injectable()
export class RedisService implements OnModuleInit, OnModuleDestroy {
  private client?: RedisClientType;
  private readonly logger = new Logger(RedisService.name);
  private lastWarning = 0;

  constructor(private readonly config: ConfigService) {}

  get enabled() {
    return Boolean(this.config.get<string>('REDIS_URL'));
  }

  private key(namespace: string, value: string) {
    const prefix = this.config.get<string>('REDIS_KEY_PREFIX', 'roomora');
    // Hash raw IP/email/user identifiers; never put them in keys or logs.
    const hash = createHash('sha256').update(value).digest('hex');
    return `${prefix}:${namespace}:${hash}`;
  }

  async onModuleInit() {
    if (!this.enabled) {
      this.logger.warn('Redis disabled; rate limits use local process memory');
      return;
    }
    const client = createClient({
      url: this.config.getOrThrow<string>('REDIS_URL'),
      disableOfflineQueue: true,
      commandsQueueMaxLength: 1000,
      pingInterval: 5000,
      socket: {
        connectTimeout: 1000,
        socketTimeout: 10000,
        reconnectStrategy: (retries) =>
          Math.min(100 * 2 ** Math.min(retries, 5), 3000),
      },
    });
    this.client = client;
    client.on('error', () => this.warn());
    try {
      await this.deadline(client.connect(), 4000);
      this.logger.log('Redis connected');
    } catch {
      if (client.isOpen) client.destroy();
      throw new Error('Cannot connect to configured Redis');
    }
  }

  private warn() {
    if (Date.now() - this.lastWarning < 30000) return;
    this.lastWarning = Date.now();
    this.logger.warn(
      'Redis unavailable; shared rate limits reject requests, cache is bypassed',
    );
  }

  private async deadline<T>(operation: Promise<T>, timeout = 1000): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Redis timeout')), timeout);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }

  private connection() {
    if (!this.client?.isReady) throw new Error('Redis unavailable');
    return this.client.withCommandOptions({
      abortSignal: AbortSignal.timeout(1000),
    });
  }

  async consume(key: string, limit: number, windowMs: number) {
    try {
      const allowed = await this.deadline(
        this.connection().eval(consumeScript, {
          keys: [this.key('rate', key)],
          arguments: [String(limit), String(windowMs)],
        }),
      );
      return allowed === 1;
    } catch (error) {
      this.warn();
      throw error;
    }
  }

  async getTile(path: string): Promise<Buffer | undefined> {
    if (!this.enabled) return;
    try {
      const value = await this.deadline(
        this.connection().get(this.key('{map-tiles}:v1', path)),
      );
      return value === null ? undefined : Buffer.from(value, 'base64');
    } catch {
      this.warn();
      return undefined;
    }
  }

  async setTile(path: string, data: Buffer) {
    // 128 entries * 512 KiB (before base64) keeps the shared cache below ~86 MiB.
    if (!this.enabled || data.length > 512 * 1024) return;
    try {
      const index = `${this.config.get<string>('REDIS_KEY_PREFIX', 'roomora')}:{map-tiles}:v1:index`;
      await this.deadline(
        this.connection().eval(cacheScript, {
          keys: [this.key('{map-tiles}:v1', path), index],
          arguments: [data.toString('base64'), '300000'],
        }),
      );
    } catch {
      this.warn();
    }
  }

  async status(): Promise<'disabled' | 'up' | 'down'> {
    if (!this.enabled) return 'disabled';
    try {
      return (await this.deadline(this.connection().ping())) === 'PONG'
        ? 'up'
        : 'down';
    } catch {
      return 'down';
    }
  }

  onModuleDestroy() {
    if (this.client?.isOpen) this.client.destroy();
  }
}
