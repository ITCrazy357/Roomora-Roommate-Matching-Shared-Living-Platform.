import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  type MessageEvent,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'pg';
import {
  Observable,
  Subject,
  filter,
  map,
  merge,
  timer,
  concatMap,
  takeWhile,
  takeUntil,
} from 'rxjs';
import { PrismaService } from '../../database/prisma.service.js';
import type { AuthContext } from '../../common/request-context.js';
import type { Prisma } from '../../generated/prisma/client.js';

type TypingSignal = {
  kind: 'typing';
  userId: string;
  conversationId: string;
  typing: boolean;
};

@Injectable()
export class UpdatesService implements OnModuleInit, OnModuleDestroy {
  private client?: Client;
  private retry?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private readonly updates = new Subject<string[]>();
  private readonly typingUpdates = new Subject<TypingSignal>();
  private readonly shutdown = new Subject<void>();
  private readonly logger = new Logger(UpdatesService.name);
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}
  async onModuleInit() {
    await this.connect();
  }
  private async connect() {
    const client = new Client({
      connectionString: this.config.getOrThrow<string>('DATABASE_URL'),
      connectionTimeoutMillis: 5000,
    });
    this.client = client;
    client.on('notification', (event) => {
      if (event.channel !== 'roomora_updates' || !event.payload) return;
      try {
        const signal: unknown = JSON.parse(event.payload);
        if (
          Array.isArray(signal) &&
          signal.every((user) => typeof user === 'string')
        )
          this.updates.next(signal);
        else if (
          signal &&
          typeof signal === 'object' &&
          'kind' in signal &&
          signal.kind === 'typing' &&
          'userId' in signal &&
          typeof signal.userId === 'string' &&
          'conversationId' in signal &&
          typeof signal.conversationId === 'string' &&
          'typing' in signal &&
          typeof signal.typing === 'boolean'
        )
          this.typingUpdates.next(signal as TypingSignal);
      } catch {
        this.logger.warn('Invalid realtime signal');
      }
    });
    client.on('error', () => {
      void client.end().catch(() => {});
    });
    client.on('end', () => this.reconnect());
    try {
      await client.connect();
      await client.query('LISTEN roomora_updates');
    } catch {
      this.reconnect();
    }
  }
  private reconnect() {
    if (this.stopped || this.retry) return;
    this.logger.warn('Realtime listener reconnecting');
    this.retry = setTimeout(() => {
      this.retry = undefined;
      void this.connect();
    }, 3000);
    this.retry.unref();
  }
  stream(auth: AuthContext): Observable<MessageEvent> {
    // Events contain no private content; clients refresh through authorized APIs.
    // Periodic sync also repairs a missed NOTIFY after a listener restart.
    return merge(
      this.updates.pipe(
        filter((users) => users.includes(auth.userId)),
        map(() => ({ type: 'sync', data: {} })),
      ),
      timer(0, 20000).pipe(map(() => ({ type: 'sync', data: {} }))),
      this.typingUpdates.pipe(
        filter((signal) => signal.userId === auth.userId),
        map((signal) => ({
          type: 'typing',
          data: { conversationId: signal.conversationId, typing: signal.typing },
        })),
      ),
    ).pipe(
      concatMap(async (event) => {
        const session = await this.prisma.session.findFirst({
          where: {
            id: auth.sessionId,
            userId: auth.userId,
            revokedAt: null,
            expiresAt: { gt: new Date() },
          },
          select: { id: true },
        });
        return session ? event : { type: 'expired', data: {} };
      }),
      takeWhile((event) => event.type !== 'expired', true),
      map((event) => event as MessageEvent),
      takeUntil(this.shutdown),
    );
  }
  async typing(
    tx: Prisma.TransactionClient,
    userId: string,
    conversationId: string,
    typing: boolean,
  ) {
    const signal: TypingSignal = { kind: 'typing', userId, conversationId, typing };
    await tx.$queryRaw`SELECT pg_notify('roomora_updates', ${JSON.stringify(signal)})::text`;
  }
  async onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.retry);
    this.shutdown.next();
    this.shutdown.complete();
    this.updates.complete();
    this.typingUpdates.complete();
    await this.client?.end().catch(() => {});
  }
}
