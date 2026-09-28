import { ConfigService } from '@nestjs/config';
import { NotificationsService } from './notifications.service.js';
import type { PrismaService } from '../../database/prisma.service.js';
import type { MailService } from '../auth/mail.service.js';

describe('Notification email delivery', () => {
  function fixture() {
    const transaction = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'notice' }]),
      notification: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    };
    const prisma = {
      $transaction: vi.fn(async (work) => work(transaction)),
      notification: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'notice',
          user: { email: 'recipient@example.test' },
          title: 'Lịch xem phòng đã được xác nhận',
          href: '/tin-nhan/conversation',
          emailAttempts: 1,
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    };
    const mail = { sendNotification: vi.fn().mockResolvedValue(undefined) };
    const service = new NotificationsService(
      prisma as unknown as PrismaService,
      mail as unknown as MailService,
      new ConfigService({ FRONTEND_ORIGIN: 'http://localhost:3000' }),
    );
    return { service, prisma, transaction, mail };
  }
  it('claims a leased batch and marks delivery only after SMTP succeeds', async () => {
    const { service, prisma, transaction, mail } = fixture();
    await service.deliver();
    expect(transaction.notification.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          emailAttempts: { increment: 1 },
          emailNextAt: expect.any(Date),
        }),
      }),
    );
    expect(mail.sendNotification).toHaveBeenCalledWith(
      'recipient@example.test',
      'Lịch xem phòng đã được xác nhận',
      'http://localhost:3000/tin-nhan/conversation',
    );
    expect(prisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: 'notice' },
      data: { emailSentAt: expect.any(Date) },
    });
  });
  it('keeps failed email pending for a later retry', async () => {
    const { service, prisma, mail } = fixture();
    mail.sendNotification.mockRejectedValue(new Error('SMTP unavailable'));
    await service.deliver();
    expect(prisma.notification.updateMany).not.toHaveBeenCalled();
  });
  it('does not start two overlapping deliveries on the same instance', async () => {
    const { service, prisma, mail } = fixture();
    let done!: () => void;
    mail.sendNotification.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          done = resolve;
        }),
    );
    const first = service.deliver();
    await vi.waitFor(() =>
      expect(mail.sendNotification).toHaveBeenCalledOnce(),
    );
    await service.deliver();
    expect(prisma.$transaction).toHaveBeenCalledOnce();
    done();
    await first;
  });
});
