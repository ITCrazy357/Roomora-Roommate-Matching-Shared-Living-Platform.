import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service.js';
import type { HouseInfoDto } from './dto/houses.dto.js';
import { HouseMembershipAccessService } from './house-membership-access.service.js';
import {
  presenceSelect,
  presenceView,
} from '../communications/presence-views.js';

@Injectable()
export class HouseDetailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly membershipAccess: HouseMembershipAccessService,
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
                ...presenceSelect(),
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
    if (!house) this.membershipAccess.unavailable();
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
        presence: presenceView(member.user),
        role: member.userId === house.ownerId ? 'OWNER' : 'MEMBER',
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
    if (!result.count) this.membershipAccess.unavailable();
    return this.get(userId, id);
  }
}
