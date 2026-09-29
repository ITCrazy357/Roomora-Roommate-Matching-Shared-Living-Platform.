import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service.js';
import type {
  Prisma,
  NotificationType,
} from '../../generated/prisma/client.js';
import { MailService } from '../auth/mail.service.js';
import type { NotificationQuery } from './communications.dto.js';

@Injectable()
export class NotificationsService implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(NotificationsService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly config: ConfigService,
  ) {}

  // Called inside the business transaction: data and notifications commit together.
  async create(
    tx: Prisma.TransactionClient,
    userId: string,
    type: NotificationType,
    title: string,
    href: string,
    emailRequired = false,
  ) {
    await tx.notification.create({
      data: { userId, type, title, href, emailRequired },
    });
    await this.signal(tx, [userId]);
  }
  async signal(tx: Prisma.TransactionClient, userIds: string[]) {
    await tx.$queryRaw`SELECT pg_notify('roomora_updates', ${JSON.stringify(userIds)})::text`;
  }
  async list(userId: string, query: NotificationQuery) {
    const where = {
      userId,
      type: query.type,
      ...(query.tab === 'unread' ? { readAt: null } : {}),
    };
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        select: {
          id: true,
          type: true,
          title: true,
          href: true,
          readAt: true,
          createdAt: true,
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);
    return {
      items,
      total,
      unread,
      page: query.page,
      pages: Math.ceil(total / query.limit),
    };
  }
  async read(userId: string, id?: string) {
    if (
      id &&
      !(await this.prisma.notification.findFirst({
        where: { id, userId },
        select: { id: true },
      }))
    )
      throw new NotFoundException();
    return this.prisma.$transaction(async (tx) => {
      await tx.notification.updateMany({
        where: { userId, id, readAt: null },
        data: { readAt: new Date() },
      });
      await this.signal(tx, [userId]);
      return { read: true };
    });
  }
  onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test') return;
    if (this.config.get('SMTP_HOST'))
      this.timer = setInterval(() => {
        void this.deliver();
      }, 10000);
    this.timer?.unref();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }

  async deliver() {
    if (!this.config.get('SMTP_HOST')) return;
    if (this.running) return;
    this.running = true;
    try {
      // Claim with a five-minute lease so another instance cannot send this batch.
      const ids = await this.prisma.$transaction(async (tx) => {
        const rows = await tx.$queryRaw<
          { id: string }[]
        >`SELECT id FROM notifications WHERE email_required = true AND email_sent_at IS NULL AND email_next_at <= NOW() AND email_attempts < 5 ORDER BY email_next_at LIMIT 5 FOR UPDATE SKIP LOCKED`;
        await tx.notification.updateMany({
          where: { id: { in: rows.map((row) => row.id) } },
          data: {
            emailAttempts: { increment: 1 },
            emailNextAt: new Date(Date.now() + 5 * 60000),
          },
        });
        return rows.map((row) => row.id);
      });
      for (const id of ids) {
        const item = await this.prisma.notification.findUnique({
          where: { id },
          include: { user: { select: { email: true } } },
        });
        if (!item) continue;
        try {
          await this.mail.sendNotification(
            item.user.email,
            item.title,
            `${this.config.getOrThrow<string>('FRONTEND_ORIGIN')}${item.href}`,
          );
          await this.prisma.notification.updateMany({
            where: { id },
            data: { emailSentAt: new Date() },
          });
        } catch {
          this.logger.warn(
            `Notification email failed; attempt ${item.emailAttempts}/5`,
          );
        }
      }
    } catch {
      this.logger.warn('Cannot process notification emails');
    } finally {
      this.running = false;
    }
  }
}
