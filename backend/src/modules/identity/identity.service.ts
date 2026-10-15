import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  IdentityDeclaration,
  Prisma,
} from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { adminPage, adminUserSelect } from '../admin/admin-views.js';
import { signalAdminChange } from '../admin/admin-signals.js';
import { IdentityCryptoService } from './identity-crypto.service.js';
import type {
  DeclareIdentityDto,
  IdentityAccessDto,
  IdentityQuery,
  ReviewIdentityDto,
} from './dto/identity.dto.js';

@Injectable()
export class IdentityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: IdentityCryptoService,
    private readonly config: ConfigService,
  ) {}

  summary(record: IdentityDeclaration) {
    return {
      userId: record.userId,
      mode: 'DEMO' as const,
      status: record.status,
      version: record.version,
      documentMasked: `********${record.documentLast4}`,
      submittedAt: record.submittedAt,
      reviewedAt: record.reviewedAt,
      reviewNote: record.reviewNote,
      providerResult: null,
      documentImagesStored: false,
      biometricDataStored: false,
    };
  }

  async status(userId: string) {
    const record = await this.prisma.identityDeclaration.findUnique({
      where: { userId },
    });
    return record ? this.summary(record) : null;
  }

  async mine(userId: string) {
    const record = await this.prisma.identityDeclaration.findUnique({
      where: { userId },
    });
    return record
      ? {
          ...this.summary(record),
          fields: this.crypto.decrypt(userId, record.encryptedData),
        }
      : null;
  }

  async declare(userId: string, dto: DeclareIdentityDto) {
    const birthDate = new Date(`${dto.birthDate}T00:00:00Z`);
    if (
      !Number.isFinite(birthDate.getTime()) ||
      birthDate.toISOString().slice(0, 10) !== dto.birthDate ||
      birthDate >= new Date() ||
      birthDate.getUTCFullYear() < 1900
    )
      throw new BadRequestException({ code: 'IDENTITY_BIRTH_DATE_INVALID' });
    const fields = {
      fullName: dto.fullName,
      birthDate: dto.birthDate,
      documentNumber: dto.documentNumber,
      phone: dto.phone,
      contactAddress: dto.contactAddress,
    };
    const encryptedData = this.crypto.encrypt(userId, fields);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
      await this.requireActive(tx, userId, false);
      const current = await tx.identityDeclaration.findUnique({
        where: { userId },
      });
      if ((current?.version ?? 0) !== dto.version) this.changed();
      await tx.identityDeclaration.upsert({
        where: { userId },
        create: {
          userId,
          encryptedData,
          documentLast4: dto.documentNumber.slice(-4),
        },
        update: {
          encryptedData,
          documentLast4: dto.documentNumber.slice(-4),
          version: { increment: 1 },
          status: 'PENDING',
          submittedAt: new Date(),
          reviewedAt: null,
          reviewerId: null,
          reviewNote: null,
        },
      });
      await signalAdminChange(tx, [userId]);
    });
    return this.mine(userId);
  }

  async requireDeclared(tx: Prisma.TransactionClient, userId: string) {
    if (
      this.config.get('IDENTITY_DECLARATION_REQUIRED') === false ||
      this.config.get('IDENTITY_DECLARATION_REQUIRED') === 'false'
    )
      return;
    const record = await tx.identityDeclaration.findUnique({
      where: { userId },
      select: { status: true },
    });
    if (!record || record.status === 'REJECTED')
      throw new ForbiddenException({
        code: 'IDENTITY_DECLARATION_REQUIRED',
        message: 'Cần khai báo đủ hồ sơ demo trước khi tiếp tục',
      });
  }

  async list(query: IdentityQuery) {
    const where: Prisma.IdentityDeclarationWhereInput = {
      status: query.status,
      user: {
        role: 'USER',
        ...(query.search
          ? {
              OR: [
                { email: { contains: query.search, mode: 'insensitive' } },
                {
                  profile: {
                    displayName: {
                      contains: query.search,
                      mode: 'insensitive',
                    },
                  },
                },
              ],
            }
          : {}),
      },
    };
    const [records, total] = await this.prisma.$transaction(
      [
        this.prisma.identityDeclaration.findMany({
          where,
          include: { user: { select: adminUserSelect } },
          orderBy: [{ submittedAt: 'desc' }, { userId: 'asc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.prisma.identityDeclaration.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return adminPage(
      records.map((record) => ({ ...this.summary(record), user: record.user })),
      total,
      query,
    );
  }

  async detail(actorId: string, userId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${actorId}::uuid FOR UPDATE`;
      await this.requireActive(tx, actorId, true);
      const record = await tx.identityDeclaration.findUnique({
        where: { userId },
        include: { user: { select: adminUserSelect } },
      });
      if (!record) throw new NotFoundException({ code: 'IDENTITY_NOT_FOUND' });
      await this.audit(
        tx,
        actorId,
        record,
        'IDENTITY_VIEWED',
        'Xem hồ sơ đã che thông tin',
      );
      return { ...this.summary(record), user: record.user };
    });
  }

  async reveal(actorId: string, userId: string, dto: IdentityAccessDto) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${actorId}::uuid FOR UPDATE`;
      await this.requireActive(tx, actorId, true);
      const record = await tx.identityDeclaration.findUnique({
        where: { userId },
      });
      if (!record) throw new NotFoundException({ code: 'IDENTITY_NOT_FOUND' });
      if (record.version !== dto.version) this.changed();
      const fields = this.crypto.decrypt(userId, record.encryptedData);
      await this.audit(tx, actorId, record, 'IDENTITY_REVEALED', dto.reason);
      return { version: record.version, fields };
    });
  }

  async review(actorId: string, userId: string, dto: ReviewIdentityDto) {
    return this.prisma.$transaction(async (tx) => {
      // Same ordering as the owner's resubmission and gated house/listing actions.
      const locked = [...new Set([actorId, userId])].sort();
      for (const id of locked)
        await tx.$queryRaw`SELECT id FROM users WHERE id = ${id}::uuid FOR UPDATE`;
      await this.requireActive(tx, actorId, true);
      const current = await tx.identityDeclaration.findUnique({
        where: { userId },
      });
      if (!current) throw new NotFoundException({ code: 'IDENTITY_NOT_FOUND' });
      if (current.version !== dto.version) this.changed();
      const record = await tx.identityDeclaration.update({
        where: { userId },
        data: {
          status: dto.status,
          version: { increment: 1 },
          reviewedAt: new Date(),
          reviewerId: actorId,
          reviewNote: dto.reason,
        },
      });
      await this.audit(
        tx,
        actorId,
        record,
        `IDENTITY_${dto.status}`,
        dto.reason,
      );
      await signalAdminChange(tx, [userId]);
      return this.summary(record);
    });
  }

  private async requireActive(
    tx: Prisma.TransactionClient,
    id: string,
    admin: boolean,
  ) {
    const user = await tx.user.findUnique({ where: { id } });
    if (
      !user ||
      user.lockedAt ||
      user.closedAt ||
      user.role !== (admin ? 'ADMIN' : 'USER')
    )
      throw new ForbiddenException({ code: 'IDENTITY_ACCESS_DENIED' });
  }

  private audit(
    tx: Prisma.TransactionClient,
    actorId: string,
    record: IdentityDeclaration,
    action: string,
    reason: string,
  ) {
    return tx.adminAction.create({
      data: {
        actorId,
        entityId: record.userId,
        action,
        reason,
        snapshot: {
          mode: 'DEMO',
          status: record.status,
          version: record.version,
        },
      },
    });
  }

  private changed(): never {
    throw new ConflictException({ code: 'IDENTITY_CHANGED' });
  }
}
