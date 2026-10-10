import { Injectable } from '@nestjs/common';
import type { HouseAnnouncementDto, HouseInfoDto } from './dto/houses.dto.js';
import { HouseDetailsService } from './house-details.service.js';
import { HouseInvitesService } from './house-invites.service.js';
import { HouseMembershipsService } from './house-memberships.service.js';
import { HouseAnnouncementsService } from './house-announcements.service.js';

@Injectable()
export class HousesService {
  constructor(
    private readonly details: HouseDetailsService,
    private readonly invites: HouseInvitesService,
    private readonly memberships: HouseMembershipsService,
    private readonly announcements: HouseAnnouncementsService,
  ) {}

  list(userId: string) {
    return this.details.list(userId);
  }

  myInvites(userId: string) {
    return this.invites.myInvites(userId);
  }

  create(userId: string, input: HouseInfoDto) {
    return this.memberships.create(userId, input);
  }

  get(userId: string, id: string) {
    return this.details.get(userId, id);
  }

  update(userId: string, id: string, input: HouseInfoDto) {
    return this.details.update(userId, id, input);
  }

  inviteCandidates(userId: string, id: string) {
    return this.invites.inviteCandidates(userId, id);
  }

  invite(userId: string, id: string, targetId: string) {
    return this.invites.invite(userId, id, targetId);
  }

  revoke(userId: string, id: string, inviteId: string) {
    return this.invites.revoke(userId, id, inviteId);
  }

  accept(userId: string, inviteId: string) {
    return this.invites.accept(userId, inviteId);
  }

  transfer(userId: string, id: string, targetId: string) {
    return this.memberships.transfer(userId, id, targetId);
  }

  leave(userId: string, id: string) {
    return this.memberships.leave(userId, id);
  }

  announce(userId: string, id: string, input: HouseAnnouncementDto) {
    return this.announcements.announce(userId, id, input);
  }

  removeAnnouncement(userId: string, id: string, announcementId: string) {
    return this.announcements.removeAnnouncement(userId, id, announcementId);
  }
}
