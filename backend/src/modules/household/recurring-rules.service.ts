import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { vietnamDate } from '../expenses/expense-promises.service.js';
import { personSelect, participantView } from '../expenses/expense-views.js';
import {
  HouseholdAccessService,
  contentHash,
  dateOnly,
} from './household-access.service.js';
import { firstMonthlyDate, nextMonthlyDate } from './recurring-dates.js';
import type {
  RecurringRuleDto,
  UpdateRecurringRuleDto,
  RecurringEnabledDto,
} from './dto/household.dto.js';

const include = { payer: { select: personSelect } } as const;
function view(
  row: Prisma.RecurringExpenseGetPayload<{ include: typeof include }>,
) {
  const { contentHash: _hash, payer, ...data } = row;
  return { ...data, payer: participantView(payer) };
}

@Injectable()
export class RecurringRulesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly rules: HouseholdAccessService,
  ) {}
  private data(dto: RecurringRuleDto) {
    const nextOn = firstMonthlyDate(dto.firstOn, dto.dayOfMonth);
    return {
      title: dto.title,
      description: dto.description,
      category: dto.category,
      amount: dto.amount,
      payerId: dto.payerId,
      participantIds: [...dto.participantIds].sort(),
      dayOfMonth: dto.dayOfMonth,
      nextOn,
    };
  }
  private validateDate(nextOn: Date) {
    const today = dateOnly(vietnamDate(new Date()));
    if (nextOn < today || nextOn.getTime() > today.getTime() + 366 * 86400000)
      throw new BadRequestException({ code: 'RECURRING_DATE_INVALID' });
  }
  async list(userId: string, houseId: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.active(tx, userId, houseId);
      const rows = await tx.recurringExpense.findMany({
        where: { houseId },
        include,
        orderBy: [{ enabled: 'desc' }, { nextOn: 'asc' }, { id: 'asc' }],
      });
      return rows.map(view);
    });
  }
  async create(userId: string, houseId: string, dto: RecurringRuleDto) {
    const data = this.data(dto),
      hash = contentHash(data);
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      await this.access.active(tx, userId, houseId);
      const previous = await tx.recurringExpense.findUnique({
        where: {
          houseId_createdById_clientId: {
            houseId,
            createdById: userId,
            clientId: dto.clientId,
          },
        },
        include,
      });
      if (previous) {
        if (previous.contentHash !== hash)
          throw new ConflictException({ code: 'HOUSEHOLD_RETRY_CHANGED' });
        return view(previous);
      }
      this.validateDate(data.nextOn);
      if ((await tx.recurringExpense.count({ where: { houseId } })) >= 100)
        throw new BadRequestException({ code: 'RECURRING_LIMIT' });
      await this.rules.people(tx, houseId, [
        dto.payerId,
        ...dto.participantIds,
      ]);
      const row = await tx.recurringExpense.create({
        data: {
          ...data,
          houseId,
          createdById: userId,
          clientId: dto.clientId,
          contentHash: hash,
        },
        include,
      });
      await this.rules.signal(tx, houseId);
      return view(row);
    });
  }
  async get(tx: Prisma.TransactionClient, houseId: string, id: string) {
    const row = await tx.recurringExpense.findFirst({
      where: { id, houseId },
      include,
    });
    if (!row) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND' });
    return row;
  }
  async update(
    userId: string,
    houseId: string,
    id: string,
    dto: UpdateRecurringRuleDto,
  ) {
    const data = this.data(dto);
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId),
        row = await this.get(tx, houseId, id);
      this.rules.editable(userId, house.ownerId, row.createdById);
      this.rules.version(row.version, dto.version);
      this.validateDate(data.nextOn);
      await this.rules.people(tx, houseId, [
        dto.payerId,
        ...dto.participantIds,
      ]);
      const updated = await tx.recurringExpense.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
        include,
      });
      await this.rules.signal(tx, houseId);
      return view(updated);
    });
  }
  async enabled(
    userId: string,
    houseId: string,
    id: string,
    dto: RecurringEnabledDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId),
        row = await this.get(tx, houseId, id);
      this.rules.editable(userId, house.ownerId, row.createdById);
      if (row.enabled === dto.enabled) return view(row);
      this.rules.version(row.version, dto.version);
      let nextOn = row.nextOn;
      if (dto.enabled) {
        await this.rules.people(tx, houseId, [
          row.payerId,
          ...row.participantIds,
        ]);
        const today = dateOnly(vietnamDate(new Date()));
        while (nextOn < today) nextOn = nextMonthlyDate(nextOn, row.dayOfMonth);
      }
      const updated = await tx.recurringExpense.update({
        where: { id },
        data: { enabled: dto.enabled, nextOn, version: { increment: 1 } },
        include,
      });
      await this.rules.signal(tx, houseId);
      return view(updated);
    });
  }
}
