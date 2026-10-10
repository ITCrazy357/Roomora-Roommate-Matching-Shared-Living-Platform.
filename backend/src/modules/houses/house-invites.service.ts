import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import { NotificationsService } from '../communications/notifications.service.js';
import { HouseDetailsService } from './house-details.service.js';
import { HouseMembershipAccessService } from './house-membership-access.service.js';

@Injectable()
export class HouseInvitesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly details: HouseDetailsService,
    private readonly membershipAccess: HouseMembershipAccessService,
  ) {}

  async myInvites(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });
    if (!user) this.membershipAccess.unavailable();
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
    if (!house) this.membershipAccess.unavailable();
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
      await this.membershipAccess.lockHouse(tx, id, userId);
      const house = await tx.house.findUniqueOrThrow({
        where: { id },
        select: { ownerId: true, name: true },
      });
      if (house.ownerId !== userId) this.membershipAccess.unavailable();
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
      if (!target) this.membershipAccess.unavailable();
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
    return this.details.get(userId, id);
  }

  async revoke(userId: string, id: string, inviteId: string) {
    await this.prisma.$transaction(async (tx) => {
      await this.membershipAccess.lockHouse(tx, id, userId);
      await this.membershipAccess.requireOwner(tx, id, userId);
      const invite = await tx.houseInvite.findFirst({
        where: { id: inviteId, houseId: id, status: 'PENDING' },
      });
      if (!invite) this.membershipAccess.unavailable();
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
    return this.details.get(userId, id);
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
    if (!invite) this.membershipAccess.unavailable();
    await this.prisma.$transaction(async (tx) => {
      await this.membershipAccess.requireNoActiveHouse(tx, userId);
      const activeHouse = await tx.house.updateMany({
        where: { id: invite.houseId, closedAt: null },
        data: { updatedAt: new Date() },
      });
      if (!activeHouse.count) this.membershipAccess.unavailable();
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
      await this.membershipAccess.saveParticipant(tx, invite.houseId, userId);
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
    return this.details.get(userId, invite.houseId);
  }
}
