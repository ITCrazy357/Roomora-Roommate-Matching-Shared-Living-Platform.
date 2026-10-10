import {
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { vietnamDate } from '../expenses/expense-promises.service.js';
import {
  HouseholdAccessService,
  dateOnly,
} from './household-access.service.js';
import { nextMonthlyDate } from './recurring-dates.js';

@Injectable()
export class RecurringSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(RecurringSchedulerService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly rules: HouseholdAccessService,
    private readonly config: ConfigService,
  ) {}
  onModuleInit() {
    if (this.config.get('NODE_ENV') === 'test') return;
    this.timer = setInterval(() => {
      void this.run();
    }, 60000);
    this.timer.unref();
    void this.run();
  }
  onModuleDestroy() {
    clearInterval(this.timer);
  }
  async run(now = new Date(), houseId?: string) {
    if (this.running) return;
    this.running = true;
    try {
      const today = dateOnly(vietnamDate(now));
      const due = await this.prisma.recurringExpense.findMany({
        where: {
          houseId,
          enabled: true,
          nextOn: { lte: today },
          house: { closedAt: null },
        },
        select: { id: true, houseId: true },
        orderBy: [{ nextOn: 'asc' }, { id: 'asc' }],
        take: 100,
      });
      for (const item of due) {
        await this.prisma.$transaction(
          async (tx) => {
            await this.access.lock(tx, item.houseId);
            const rule = await tx.recurringExpense.findUniqueOrThrow({
              where: { id: item.id },
              include: {
                house: { select: { ownerId: true, closedAt: true } },
                payer: { select: { userId: true, leftAt: true } },
              },
            });
            if (!rule.enabled || rule.house.closedAt || rule.nextOn > today)
              return;
            let nextOn = rule.nextOn;
            // Catch up after downtime in bounded batches, keeping one draft per period.
            for (let count = 0; count < 12 && nextOn <= today; count++) {
              const previous = await tx.recurringExpenseDraft.findUnique({
                where: { ruleId_dueOn: { ruleId: rule.id, dueOn: nextOn } },
                select: { id: true },
              });
              if (!previous) {
                await tx.recurringExpenseDraft.create({
                  data: {
                    ruleId: rule.id,
                    dueOn: nextOn,
                    title: rule.title,
                    description: rule.description,
                    category: rule.category,
                    amount: rule.amount,
                    payerId: rule.payerId,
                    participantIds: rule.participantIds,
                  },
                });
                const member =
                  rule.payer.userId && !rule.payer.leftAt
                    ? await tx.houseMember.findFirst({
                        where: {
                          houseId: rule.houseId,
                          userId: rule.payer.userId,
                          leftAt: null,
                        },
                        select: { userId: true },
                      })
                    : null;
                await this.rules.notify(
                  tx,
                  member?.userId ?? rule.house.ownerId,
                  `Cần xác nhận khoản định kỳ: ${rule.title} (${nextOn.toISOString().slice(0, 10)})`,
                  rule.houseId,
                );
              }
              nextOn = nextMonthlyDate(nextOn, rule.dayOfMonth);
            }
            await tx.recurringExpense.update({
              where: { id: rule.id },
              data: { nextOn, version: { increment: 1 } },
            });
            await this.rules.signal(tx, rule.houseId);
          },
          { timeout: 15000 },
        );
      }
    } catch (error) {
      this.logger.error(
        'Recurring drafts could not be generated',
        error instanceof Error ? error.message : 'Unknown error',
      );
    } finally {
      this.running = false;
    }
  }
}
