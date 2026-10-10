import { Injectable } from '@nestjs/common';
import type {
  ConnectionQuery,
  PeopleQuery,
  ReportUserDto,
  SendConnectionDto,
} from '../people/dto/people.dto.js';
import { PeopleDiscoveryService } from './people-discovery.service.js';
import { PeopleConnectionsService } from './people-connections.service.js';
import { PeopleSafetyService } from './people-safety.service.js';

@Injectable()
export class PeopleService {
  constructor(
    private readonly discovery: PeopleDiscoveryService,
    private readonly connections: PeopleConnectionsService,
    private readonly safety: PeopleSafetyService,
  ) {}

  search(query: PeopleQuery, viewerId?: string) {
    return this.discovery.search(query, viewerId);
  }

  getPerson(targetId: string, viewerId?: string) {
    return this.discovery.getPerson(targetId, viewerId);
  }

  send(userId: string, dto: SendConnectionDto) {
    return this.connections.send(userId, dto);
  }

  respond(
    userId: string,
    id: string,
    version: number,
    action: 'accept' | 'decline' | 'cancel',
  ) {
    return this.connections.respond(userId, id, version, action);
  }

  disconnect(userId: string, id: string, version: number) {
    return this.connections.disconnect(userId, id, version);
  }

  listConnections(userId: string, query: ConnectionQuery) {
    return this.connections.listConnections(userId, query);
  }

  block(userId: string, targetId: string) {
    return this.safety.block(userId, targetId);
  }

  unblock(userId: string, targetId: string) {
    return this.safety.unblock(userId, targetId);
  }

  report(userId: string, targetId: string, dto: ReportUserDto) {
    return this.safety.report(userId, targetId, dto);
  }
}
