import {
  Injectable,
  Logger,
  type OnModuleInit,
  type OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { CostSharingPeriodsService } from './cost-sharing-periods.service.js';

@Injectable()
export class CostSharingSchedulerService
  implements OnModuleInit, OnModuleDestroy
{
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private readonly logger = new Logger(CostSharingSchedulerService.name);
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly periods: CostSharingPeriodsService,
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
      // Keyset pagination prevents busy/old houses from starving later houses.
      let cursor: string | undefined;
      for (;;) {
        const houses = await this.prisma.house.findMany({
          where: {
            id: houseId ?? (cursor ? { gt: cursor } : undefined),
            closedAt: null,
            OR: [
              { costSharingSettings: { some: { enabled: true } } },
              { costSharingPeriods: { some: { status: 'OPEN' } } },
            ],
          },
          select: { id: true },
          orderBy: { id: 'asc' },
          take: 100,
        });
        if (!houses.length) break;
        for (const house of houses)
          await this.prisma.$transaction(
            async (tx) => {
              await this.access.lock(tx, house.id);
              const current = await tx.house.findUnique({
                where: { id: house.id },
                select: { closedAt: true },
              });
              if (current && !current.closedAt)
                await this.periods.sync(tx, house.id, now);
            },
            { timeout: 15000 },
          );
        if (houseId || houses.length < 100) break;
        cursor = houses.at(-1)!.id;
      }
    } catch (error) {
      this.logger.error(
        'Cannot update monthly cost-sharing periods',
        error instanceof Error ? error.message : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
