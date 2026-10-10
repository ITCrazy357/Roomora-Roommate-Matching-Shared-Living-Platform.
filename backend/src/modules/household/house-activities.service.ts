import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type {
  HouseActivityKind,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { HouseAccessService } from '../houses/house-access.service.js';
import { personSelect, participantView } from '../expenses/expense-views.js';
import { vietnamDate } from '../expenses/expense-promises.service.js';
import {
  HouseholdAccessService,
  contentHash,
  dateOnly,
} from './household-access.service.js';
import type {
  ActivityDto,
  UpdateActivityDto,
  ActivityQueryDto,
  ActivityStatusDto,
} from './dto/household.dto.js';

const include = {
  assignee: { select: personSelect },
  completedBy: { select: { profile: { select: { displayName: true } } } },
} as const;
function view(
  row: Prisma.HouseActivityGetPayload<{ include: typeof include }>,
) {
  const { contentHash: _hash, assignee, completedBy, ...data } = row;
  return {
    ...data,
    assignee: assignee ? participantView(assignee) : null,
    completedByName: completedBy?.profile?.displayName ?? null,
  };
}

@Injectable()
export class HouseActivitiesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: HouseAccessService,
    private readonly rules: HouseholdAccessService,
  ) {}

  private data(kind: HouseActivityKind, dto: ActivityDto) {
    if (kind === 'CHORE' && (!dto.assigneeId || !dto.dueOn))
      throw new BadRequestException({ code: 'CHORE_ASSIGNMENT_REQUIRED' });
    return {
      kind,
      title: dto.title,
      note: dto.note,
      quantity: kind === 'SHOPPING' ? dto.quantity : '',
      assigneeId: dto.assigneeId ?? null,
      dueOn: dto.dueOn ? dateOnly(dto.dueOn) : null,
    };
  }
  async list(
    userId: string,
    houseId: string,
    kind: HouseActivityKind,
    query: ActivityQueryDto,
  ) {
    return this.prisma.$transaction(
      async (tx) => {
        await this.access.active(tx, userId, houseId);
        const where = { houseId, kind, status: query.status };
        const items = await tx.houseActivity.findMany({
          where,
          include,
          orderBy: [
            { status: 'asc' },
            { dueOn: { sort: 'asc', nulls: 'last' } },
            { createdAt: 'desc' },
            { id: 'asc' },
          ],
          take: query.limit,
          skip: (query.page - 1) * query.limit,
        });
        const total = await tx.houseActivity.count({ where });
        const counts = await tx.houseActivity.groupBy({
          by: ['status'],
          where: { houseId, kind },
          _count: true,
        });
        const overdue = await tx.houseActivity.count({
          where: {
            houseId,
            kind,
            status: 'OPEN',
            dueOn: { lt: dateOnly(vietnamDate(new Date())) },
          },
        });
        return {
          items: items.map(view),
          total,
          summary: {
            open: counts.find((row) => row.status === 'OPEN')?._count ?? 0,
            done: counts.find((row) => row.status === 'DONE')?._count ?? 0,
            cancelled:
              counts.find((row) => row.status === 'CANCELLED')?._count ?? 0,
            overdue,
          },
          page: query.page,
          pages: Math.ceil(total / query.limit),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async create(
    userId: string,
    houseId: string,
    kind: HouseActivityKind,
    dto: ActivityDto,
  ) {
    const data = this.data(kind, dto),
      hash = contentHash(data);
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId);
      const existing = await tx.houseActivity.findUnique({
        where: {
          houseId_createdById_clientId: {
            houseId,
            createdById: userId,
            clientId: dto.clientId,
          },
        },
        include,
      });
      if (existing) {
        if (existing.contentHash !== hash)
          throw new ConflictException({ code: 'HOUSEHOLD_RETRY_CHANGED' });
        return view(existing);
      }
      const people = await this.rules.people(
        tx,
        houseId,
        data.assigneeId ? [data.assigneeId] : [],
      );
      const row = await tx.houseActivity.create({
        data: {
          ...data,
          houseId,
          createdById: userId,
          clientId: dto.clientId,
          contentHash: hash,
        },
        include,
      });
      if (data.assigneeId) {
        const recipient = people[0].userId ?? house.ownerId;
        await this.rules.notify(
          tx,
          recipient,
          `${kind === 'CHORE' ? 'Việc nhà' : 'Mua chung'}: ${dto.title}`,
          houseId,
        );
      }
      await this.rules.signal(tx, houseId);
      return view(row);
    });
  }
  private async get(
    tx: Prisma.TransactionClient,
    houseId: string,
    kind: HouseActivityKind,
    id: string,
  ) {
    const row = await tx.houseActivity.findFirst({
      where: { id, houseId, kind },
      include,
    });
    if (!row) throw new NotFoundException({ code: 'HOUSEHOLD_NOT_FOUND' });
    return row;
  }
  async update(
    userId: string,
    houseId: string,
    kind: HouseActivityKind,
    id: string,
    dto: UpdateActivityDto,
  ) {
    const data = this.data(kind, dto);
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId),
        row = await this.get(tx, houseId, kind, id);
      this.rules.editable(userId, house.ownerId, row.createdById);
      this.rules.version(row.version, dto.version);
      if (row.status !== 'OPEN')
        throw new ConflictException({ code: 'HOUSEHOLD_CLOSED' });
      const people = await this.rules.people(
        tx,
        houseId,
        data.assigneeId ? [data.assigneeId] : [],
      );
      const updated = await tx.houseActivity.update({
        where: { id },
        data: { ...data, version: { increment: 1 } },
        include,
      });
      if (
        data.assigneeId &&
        (row.assigneeId !== data.assigneeId ||
          row.dueOn?.getTime() !== data.dueOn?.getTime())
      )
        await this.rules.notify(
          tx,
          people[0].userId ?? house.ownerId,
          `Đã cập nhật phân công: ${dto.title}`,
          houseId,
        );
      await this.rules.signal(tx, houseId);
      return view(updated);
    });
  }
  async status(
    userId: string,
    houseId: string,
    kind: HouseActivityKind,
    id: string,
    dto: ActivityStatusDto,
  ) {
    return this.prisma.$transaction(async (tx) => {
      await this.access.lock(tx, houseId);
      const house = await this.access.active(tx, userId, houseId),
        row = await this.get(tx, houseId, kind, id);
      const editor = userId === house.ownerId || userId === row.createdById;
      const performer =
        row.assignee?.userId === userId ||
        (kind === 'SHOPPING' && !row.assigneeId);
      if (!(dto.status === 'CANCELLED' ? editor : editor || performer))
        throw new ForbiddenException({ code: 'HOUSEHOLD_FORBIDDEN' });
      if (row.status === dto.status) return view(row);
      this.rules.version(row.version, dto.version);
      if (row.status === 'CANCELLED' && !editor)
        throw new ForbiddenException({ code: 'HOUSEHOLD_FORBIDDEN' });
      const updated = await tx.houseActivity.update({
        where: { id },
        data: {
          status: dto.status,
          completedById: dto.status === 'DONE' ? userId : null,
          completedAt: dto.status === 'DONE' ? new Date() : null,
          version: { increment: 1 },
        },
        include,
      });
      await this.rules.signal(tx, houseId);
      return view(updated);
    });
  }
}
