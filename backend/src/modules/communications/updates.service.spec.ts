import { ConfigService } from '@nestjs/config';
import type { PrismaService } from '../../database/prisma.service.js';
import { UpdatesService } from './updates.service.js';

describe('SSE recovery and session revocation', () => {
  afterEach(() => vi.useRealTimers());

  it('refreshes data once per minute while checking the session every twenty seconds', async () => {
    vi.useFakeTimers();
    const session = { findFirst: vi.fn().mockResolvedValue({ id: 'session' }) };
    const service = new UpdatesService(new ConfigService(), {
      session,
    } as unknown as PrismaService);
    const types: string[] = [];
    const subscription = service
      .stream({
        userId: 'user',
        sessionId: 'session',
        email: 'test@example.test',
        role: 'USER',
      })
      .subscribe((event) => types.push(event.type!));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(types).toEqual(['sync', 'heartbeat', 'heartbeat', 'sync']);
    expect(session.findFirst).toHaveBeenCalledTimes(4);
    subscription.unsubscribe();
    await service.onModuleDestroy();
  });

  it('expires a revoked session on the next heartbeat instead of waiting for data refresh', async () => {
    vi.useFakeTimers();
    const session = {
      findFirst: vi
        .fn()
        .mockResolvedValueOnce({ id: 'session' })
        .mockResolvedValue(null),
    };
    const service = new UpdatesService(new ConfigService(), {
      session,
    } as unknown as PrismaService);
    const types: string[] = [];
    let complete = false;
    service
      .stream({
        userId: 'user',
        sessionId: 'session',
        email: 'test@example.test',
        role: 'USER',
      })
      .subscribe({
        next: (event) => types.push(event.type!),
        complete: () => {
          complete = true;
        },
      });
    await vi.advanceTimersByTimeAsync(40_000);
    expect(types).toEqual(['sync', 'expired']);
    expect(complete).toBe(true);
    expect(session.findFirst).toHaveBeenCalledTimes(2);
    await service.onModuleDestroy();
  });
});
