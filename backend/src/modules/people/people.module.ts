import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { LocationsModule } from '../locations/locations.module.js';
import {
  ConnectionsController,
  PeopleController,
  UserSafetyController,
} from './people.controller.js';
import { PeopleService } from './people.service.js';
import { CommunicationsModule } from '../communications/communications.module.js';

@Module({
  imports: [PrismaModule, AuthModule, LocationsModule, CommunicationsModule],
  controllers: [PeopleController, ConnectionsController, UserSafetyController],
  providers: [PeopleService],
})
export class PeopleModule {}
