import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { adminPage } from './admin-views.js';
import type {
  AdminPageQuery,
  AnnouncementDto,
  UpdateAnnouncementDto,
} from './dto/admin.dto.js';

@Injectable()
export class AdminAnnouncementsService {
  constructor(private readonly prisma: PrismaService) {}

  async active() {
    const now = new Date();
    const items = await this.prisma.systemAnnouncement.findMany({
      where: {
        published: true,
        displayFrom: { lte: now },
        displayUntil: { gt: now },
      },
      orderBy: [{ displayFrom: 'desc' }, { id: 'asc' }],
      select: {
        id: true,
        version: true,
        title: true,
        message: true,
        kind: true,
        displayFrom: true,
        displayUntil: true,
        maintenanceFrom: true,
        maintenanceUntil: true,
      },
    });
    return { items, serverTime: now };
  }

  async list(query: AdminPageQuery) {
    const [items, total] = await this.prisma.$transaction(
      [
        this.prisma.systemAnnouncement.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.prisma.systemAnnouncement.count(),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return adminPage(items, total, query);
  }

  async history(id: string) {
    const item = await this.prisma.systemAnnouncement.findUnique({
      where: { id },
    });
    if (!item) throw new NotFoundException({ code: 'ANNOUNCEMENT_NOT_FOUND' });
    return {
      item,
      actions: await this.prisma.adminAction.findMany({
        where: { entityId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 50,
        include: {
          actor: {
            select: { id: true, profile: { select: { displayName: true } } },
          },
        },
      }),
    };
  }

  async create(actorId: string, dto: AnnouncementDto) {
    const data = this.validate(dto);
    return this.prisma.$transaction(async (tx) => {
      const item = await tx.systemAnnouncement.create({
        data: { ...data, authorId: actorId },
      });
      await this.audit(
        tx,
        actorId,
        item.id,
        'ANNOUNCEMENT_CREATED',
        this.snapshot(dto, item.version),
      );
      return item;
    });
  }

  async update(actorId: string, id: string, dto: UpdateAnnouncementDto) {
    const data = this.validate(dto);
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.systemAnnouncement.updateMany({
        where: { id, version: dto.version, published: false },
        data: { ...data, version: { increment: 1 } },
      });
      if (!changed.count) await this.conflict(tx, id);
      await this.audit(
        tx,
        actorId,
        id,
        'ANNOUNCEMENT_UPDATED',
        this.snapshot(dto, dto.version + 1),
      );
      return tx.systemAnnouncement.findUniqueOrThrow({ where: { id } });
    });
  }

  async publish(
    actorId: string,
    id: string,
    version: number,
    published: boolean,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.systemAnnouncement.updateMany({
        where: {
          id,
          version,
          published: !published,
          ...(published ? { displayUntil: { gt: new Date() } } : {}),
        },
        data: { published, version: { increment: 1 } },
      });
      if (!changed.count) await this.conflict(tx, id);
      await this.audit(
        tx,
        actorId,
        id,
        published ? 'ANNOUNCEMENT_PUBLISHED' : 'ANNOUNCEMENT_WITHDRAWN',
        { version: version + 1, published },
      );
      return tx.systemAnnouncement.findUniqueOrThrow({ where: { id } });
    });
  }

  private validate(dto: AnnouncementDto) {
    const displayFrom = new Date(dto.displayFrom),
      displayUntil = new Date(dto.displayUntil);
    const maintenanceFrom = dto.maintenanceFrom
      ? new Date(dto.maintenanceFrom)
      : null;
    const maintenanceUntil = dto.maintenanceUntil
      ? new Date(dto.maintenanceUntil)
      : null;
    if (
      displayFrom >= displayUntil ||
      (dto.kind === 'MAINTENANCE' &&
        (!maintenanceFrom ||
          !maintenanceUntil ||
          maintenanceFrom >= maintenanceUntil ||
          displayFrom > maintenanceFrom ||
          displayUntil < maintenanceUntil)) ||
      (dto.kind === 'GENERAL' && (maintenanceFrom || maintenanceUntil))
    ) {
      throw new BadRequestException({
        code: 'ANNOUNCEMENT_TIME_INVALID',
        message: 'Lịch hiển thị phải bao trùm toàn bộ thời gian bảo trì',
      });
    }
    return {
      title: dto.title,
      message: dto.message,
      kind: dto.kind,
      displayFrom,
      displayUntil,
      maintenanceFrom,
      maintenanceUntil,
    };
  }

  private async conflict(
    tx: Prisma.TransactionClient,
    id: string,
  ): Promise<never> {
    if (!(await tx.systemAnnouncement.count({ where: { id } })))
      throw new NotFoundException({ code: 'ANNOUNCEMENT_NOT_FOUND' });
    throw new ConflictException({
      code: 'ADMIN_VERSION_CONFLICT',
      message: 'Thông báo đã thay đổi, đang phát hoặc đã hết hạn; hãy tải lại',
    });
  }

  private audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    entityId: string,
    action: string,
    snapshot: Prisma.InputJsonObject,
  ) {
    return tx.adminAction.create({
      data: { actorId, entityId, action, snapshot },
    });
  }

  private snapshot(dto: AnnouncementDto, version: number) {
    return {
      title: dto.title,
      message: dto.message,
      kind: dto.kind,
      displayFrom: dto.displayFrom,
      displayUntil: dto.displayUntil,
      maintenanceFrom: dto.maintenanceFrom ?? null,
      maintenanceUntil: dto.maintenanceUntil ?? null,
      version,
    };
  }
}
