import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationsService } from '../communications/notifications.service.js';
import type { HouseAnnouncementDto, HouseInfoDto } from './houses.dto.js';

@Injectable()
export class HousesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  list(userId: string) {
    return this.prisma.house.findMany({
      where: { closedAt: null, members: { some: { userId, leftAt: null } } },
      select: {
        id: true,
        name: true,
        address: true,
        ownerId: true,
        updatedAt: true,
        _count: { select: { members: { where: { leftAt: null } } } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async myInvites(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) this.unavailable();
    return this.prisma.houseInvite.findMany({
      where: {
        email: user.email.toLowerCase(),
        status: 'PENDING',
        expiresAt: { gt: new Date() },
        house: { closedAt: null },
      },
      select: {
        id: true,
        houseId: true,
        expiresAt: true,
        house: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(userId: string, input: HouseInfoDto) {
    const house = await this.prisma.$transaction(async (tx) => {
      await this.requireNoActiveHouse(tx, userId);
      const created = await tx.house.create({
        data: {
          name: input.name,
          address: input.address,
          description: input.description,
          rules: input.rules,
          ownerId: userId,
          members: { create: { userId } },
        },
      });
      await tx.houseEvent.create({
        data: { houseId: created.id, userId, actorId: userId, type: 'CREATED' },
      });
      return created;
    });
    return this.get(userId, house.id);
  }

  async get(userId: string, id: string) {
    const house = await this.prisma.house.findFirst({
      where: {
        id,
        closedAt: null,
        members: { some: { userId, leftAt: null } },
      },
      include: {
        members: {
          where: { leftAt: null },
          select: {
            userId: true,
            joinedAt: true,
            user: {
              select: {
                profile: { select: { displayName: true, avatarUrl: true } },
              },
            },
          },
          orderBy: { joinedAt: 'asc' },
        },
        announcements: {
          select: {
            id: true,
            authorId: true,
            text: true,
            pinned: true,
            createdAt: true,
            author: { select: { profile: { select: { displayName: true } } } },
          },
          orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
          take: 30,
        },
        events: {
          select: {
            id: true,
            userId: true,
            actorId: true,
            type: true,
            createdAt: true,
            user: { select: { profile: { select: { displayName: true } } } },
          },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        invites: {
          where: { status: 'PENDING', expiresAt: { gt: new Date() } },
          select: { id: true, email: true, expiresAt: true },
        },
      },
    });
    if (!house) this.unavailable();
    const inviteUsers =
      house.ownerId === userId && house.invites.length
        ? await this.prisma.user.findMany({
            where: {
              email: { in: house.invites.map((invite) => invite.email) },
            },
            select: {
              email: true,
              profile: { select: { displayName: true } },
            },
          })
        : [];
    const inviteNames = new Map(
      inviteUsers.map((user) => [
        user.email,
        user.profile?.displayName ?? 'Thành viên Roomora',
      ]),
    );
    return {
      id: house.id,
      name: house.name,
      address: house.address,
      description: house.description,
      rules: house.rules,
      ownerId: house.ownerId,
      createdAt: house.createdAt,
      updatedAt: house.updatedAt,
      members: house.members.map((member) => ({
        userId: member.userId,
        joinedAt: member.joinedAt,
        displayName: member.user.profile?.displayName ?? 'Thành viên Roomora',
        avatarUrl: member.user.profile?.avatarUrl ?? null,
      })),
      announcements: house.announcements.map((item) => ({
        id: item.id,
        authorId: item.authorId,
        authorName: item.author.profile?.displayName ?? 'Thành viên Roomora',
        text: item.text,
        pinned: item.pinned,
        createdAt: item.createdAt,
      })),
      events: house.events.map((item) => ({
        id: item.id,
        userId: item.userId,
        actorId: item.actorId,
        type: item.type,
        displayName: item.user.profile?.displayName ?? 'Thành viên Roomora',
        createdAt: item.createdAt,
      })),
      invites:
        house.ownerId === userId
          ? house.invites.map((invite) => ({
              id: invite.id,
              expiresAt: invite.expiresAt,
              label: inviteNames.get(invite.email) ?? invite.email,
            }))
          : [],
    };
  }

  async update(userId: string, id: string, input: HouseInfoDto) {
    const result = await this.prisma.house.updateMany({
      where: {
        id,
        closedAt: null,
        ownerId: userId,
        members: { some: { userId, leftAt: null } },
      },
      data: {
        name: input.name,
        address: input.address,
        description: input.description,
        rules: input.rules,
      },
    });
    if (!result.count) this.unavailable();
    return this.get(userId, id);
  }

  async inviteCandidates(userId: string, id: string) {
    const house = await this.prisma.house.findFirst({
      where: {
        id,
        closedAt: null,
        ownerId: userId,
        members: { some: { userId, leftAt: null } },
      },
      select: {
        members: { where: { leftAt: null }, select: { userId: true } },
        invites: {
          where: { status: 'PENDING', expiresAt: { gt: new Date() } },
          select: { email: true },
        },
      },
    });
    if (!house) this.unavailable();
    const connections = await this.prisma.connection.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ senderId: userId }, { receiverId: userId }],
      },
      select: {
        senderId: true,
        sender: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true, avatarUrl: true } },
          },
        },
        receiver: {
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const memberIds = new Set(house.members.map((member) => member.userId));
    const invitedEmails = new Set(house.invites.map((invite) => invite.email));
    return connections.map((connection) => {
      const person =
        connection.senderId === userId
          ? connection.receiver
          : connection.sender;
      return {
        userId: person.id,
        displayName: person.profile?.displayName ?? 'Thành viên Roomora',
        avatarUrl: person.profile?.avatarUrl ?? null,
        status: memberIds.has(person.id)
          ? 'MEMBER'
          : invitedEmails.has(person.email.toLowerCase())
            ? 'INVITED'
            : 'AVAILABLE',
      };
    });
  }

  async invite(userId: string, id: string, targetId: string) {
    if (userId === targetId)
      throw new BadRequestException({ code: 'HOUSE_SELF_INVITE' });
    await this.prisma.$transaction(async (tx) => {
      await this.lockHouse(tx, id, userId);
      const house = await tx.house.findUniqueOrThrow({
        where: { id },
        select: { ownerId: true, name: true },
      });
      if (house.ownerId !== userId) this.unavailable();
      const connection = await tx.connection.findFirst({
        where: {
          status: 'ACCEPTED',
          OR: [
            { senderId: userId, receiverId: targetId },
            { senderId: targetId, receiverId: userId },
          ],
        },
        select: { id: true },
      });
      if (!connection)
        throw new BadRequestException({ code: 'HOUSE_NOT_CONNECTED' });
      const target = await tx.user.findUnique({
        where: { id: targetId },
        select: { email: true },
      });
      if (!target) this.unavailable();
      const email = target.email.toLowerCase();
      if (
        await tx.houseMember.findFirst({
          where: { houseId: id, userId: targetId, leftAt: null },
        })
      )
        throw new ConflictException({ code: 'HOUSE_ALREADY_MEMBER' });
      const current = await tx.houseInvite.findUnique({
        where: { houseId_email: { houseId: id, email } },
      });
      if (current?.status === 'PENDING' && current.expiresAt > new Date())
        throw new ConflictException({ code: 'HOUSE_INVITE_EXISTS' });
      const count = await tx.houseInvite.count({
        where: {
          houseId: id,
          status: 'PENDING',
          expiresAt: { gt: new Date() },
        },
      });
      if (count >= 30)
        throw new ConflictException({ code: 'HOUSE_INVITE_LIMIT' });
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60_000);
      await tx.houseInvite.upsert({
        where: { houseId_email: { houseId: id, email } },
        create: { houseId: id, email, expiresAt },
        update: { status: 'PENDING', expiresAt },
      });
      await tx.houseEvent.create({
        data: {
          houseId: id,
          userId: targetId,
          actorId: userId,
          type: 'INVITED',
        },
      });
      await this.notifications.create(
        tx,
        targetId,
        'HOUSE',
        `Bạn được mời vào ${house.name}`,
        '/nha-chung',
        true,
      );
    });
    void this.notifications.deliver();
    return this.get(userId, id);
  }

  async revoke(userId: string, id: string, inviteId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockHouse(tx, id, userId);
      await this.requireOwner(tx, id, userId);
      const invite = await tx.houseInvite.findFirst({
        where: { id: inviteId, houseId: id, status: 'PENDING' },
      });
      if (!invite) this.unavailable();
      const result = await tx.houseInvite.updateMany({
        where: { id: inviteId, status: 'PENDING' },
        data: { status: 'REVOKED' },
      });
      if (!result.count)
        throw new ConflictException({ code: 'HOUSE_INVITE_CHANGED' });
      const target = await tx.user.findUnique({
        where: { email: invite.email },
        select: { id: true },
      });
      if (target)
        await tx.houseEvent.create({
          data: {
            houseId: id,
            userId: target.id,
            actorId: userId,
            type: 'INVITE_REVOKED',
          },
        });
    });
    return this.get(userId, id);
  }

  async accept(userId: string, inviteId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true },
    });
    if (!user?.emailVerifiedAt)
      throw new BadRequestException({ code: 'EMAIL_NOT_VERIFIED' });
    const invite = await this.prisma.houseInvite.findFirst({
      where: {
        id: inviteId,
        email: user.email.toLowerCase(),
        status: 'PENDING',
        expiresAt: { gt: new Date() },
      },
      select: { houseId: true },
    });
    if (!invite) this.unavailable();
    await this.prisma.$transaction(async (tx) => {
      await this.requireNoActiveHouse(tx, userId);
      const activeHouse = await tx.house.updateMany({
        where: { id: invite.houseId, closedAt: null },
        data: { updatedAt: new Date() },
      });
      if (!activeHouse.count) this.unavailable();
      const result = await tx.houseInvite.updateMany({
        where: {
          id: inviteId,
          email: user.email.toLowerCase(),
          status: 'PENDING',
          expiresAt: { gt: new Date() },
        },
        data: { status: 'ACCEPTED' },
      });
      if (!result.count)
        throw new ConflictException({ code: 'HOUSE_INVITE_CHANGED' });
      await tx.houseMember.upsert({
        where: { houseId_userId: { houseId: invite.houseId, userId } },
        create: { houseId: invite.houseId, userId },
        update: { joinedAt: new Date(), leftAt: null },
      });
      await tx.houseEvent.create({
        data: {
          houseId: invite.houseId,
          userId,
          actorId: userId,
          type: 'JOINED',
        },
      });
      const house = await tx.house.findUniqueOrThrow({
        where: { id: invite.houseId },
        select: { ownerId: true, name: true },
      });
      await this.notifications.create(
        tx,
        house.ownerId,
        'HOUSE',
        `Có thành viên mới trong ${house.name}`,
        `/nha-chung/${invite.houseId}`,
      );
    });
    return this.get(userId, invite.houseId);
  }

  async transfer(userId: string, id: string, targetId: string) {
    if (userId === targetId)
      throw new BadRequestException({ code: 'HOUSE_SAME_OWNER' });
    await this.prisma.$transaction(async (tx) => {
      await this.lockHouse(tx, id, userId);
      await this.requireOwner(tx, id, userId);
      const target = await tx.houseMember.findUnique({
        where: { houseId_userId: { houseId: id, userId: targetId } },
      });
      if (!target || target.leftAt)
        throw new BadRequestException({ code: 'HOUSE_TARGET_NOT_MEMBER' });
      await tx.house.update({ where: { id }, data: { ownerId: targetId } });
      await tx.houseEvent.create({
        data: {
          houseId: id,
          userId: targetId,
          actorId: userId,
          type: 'OWNER_TRANSFERRED',
        },
      });
      await this.notifications.create(
        tx,
        targetId,
        'HOUSE',
        'Bạn đã trở thành trưởng nhà',
        `/nha-chung/${id}`,
      );
    });
    return this.get(userId, id);
  }

  async leave(userId: string, id: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockHouse(tx, id, userId);
      const house = await tx.house.findUniqueOrThrow({
        where: { id },
        select: { ownerId: true },
      });
      if (house.ownerId === userId) {
        const memberCount = await tx.houseMember.count({
          where: { houseId: id, leftAt: null },
        });
        if (memberCount > 1)
          throw new ConflictException({ code: 'HOUSE_TRANSFER_FIRST' });
        await tx.house.update({
          where: { id },
          data: { closedAt: new Date() },
        });
        await tx.houseInvite.updateMany({
          where: { houseId: id, status: 'PENDING' },
          data: { status: 'REVOKED' },
        });
      }
      const result = await tx.houseMember.updateMany({
        where: { houseId: id, userId, leftAt: null },
        data: { leftAt: new Date() },
      });
      if (!result.count) this.unavailable();
      await tx.houseEvent.create({
        data: { houseId: id, userId, actorId: userId, type: 'LEFT' },
      });
    });
    return { left: true };
  }

  async announce(userId: string, id: string, input: HouseAnnouncementDto) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockHouse(tx, id, userId);
      if (input.pinned) await this.requireOwner(tx, id, userId);
      await tx.houseAnnouncement.create({
        data: {
          houseId: id,
          authorId: userId,
          text: input.text,
          pinned: input.pinned,
        },
      });
    });
    return this.get(userId, id);
  }

  async removeAnnouncement(userId: string, id: string, announcementId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockHouse(tx, id, userId);
      const item = await tx.houseAnnouncement.findFirst({
        where: { id: announcementId, houseId: id },
      });
      if (!item) this.unavailable();
      if (item.authorId !== userId) await this.requireOwner(tx, id, userId);
      await tx.houseAnnouncement.delete({ where: { id: announcementId } });
    });
    return this.get(userId, id);
  }

  private async lockHouse(
    tx: Prisma.TransactionClient,
    id: string,
    userId: string,
  ) {
    const result = await tx.house.updateMany({
      where: {
        id,
        closedAt: null,
        members: { some: { userId, leftAt: null } },
      },
      data: { updatedAt: new Date() },
    });
    if (!result.count) this.unavailable();
  }

  private async requireNoActiveHouse(
    tx: Prisma.TransactionClient,
    userId: string,
  ) {
    await tx.$queryRaw`SELECT id FROM users WHERE id = ${userId}::uuid FOR UPDATE`;
    const membership = await tx.houseMember.findFirst({
      where: { userId, leftAt: null },
      select: { houseId: true },
    });
    if (membership)
      throw new ConflictException({ code: 'HOUSE_ALREADY_JOINED' });
  }

  private async requireOwner(
    db: Prisma.TransactionClient | PrismaService,
    id: string,
    userId: string,
  ) {
    const house = await db.house.findFirst({
      where: {
        id,
        closedAt: null,
        ownerId: userId,
        members: { some: { userId, leftAt: null } },
      },
      select: { id: true },
    });
    if (!house) this.unavailable();
  }

  private unavailable(): never {
    throw new NotFoundException({ code: 'HOUSE_NOT_FOUND' });
  }
}
