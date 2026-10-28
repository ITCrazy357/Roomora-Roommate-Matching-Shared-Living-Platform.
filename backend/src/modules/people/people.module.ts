import { Module } from '@nestjs/common';
import { PrismaModule } from '../../database/prisma.module.js';
import { AuthModule } from '../auth/auth.module.js';
import { LocationsModule } from '../locations/locations.module.js';
import { CommunicationsModule } from '../communications/communications.module.js';
import { PeopleDiscoveryService } from './people-discovery.service.js';
import { PeopleConnectionsService } from './people-connections.service.js';
import { PeopleSafetyService } from './people-safety.service.js';
import { PeopleViewsService } from './people-views.service.js';
import { PeopleAccessService } from './people-access.service.js';
import {
  ConnectionsController,
  PeopleController,
  UserSafetyController,
} from './people.controller.js';
import { PeopleService } from './people.service.js';
import { PublicSearchRateGuard } from '../../common/public-search-rate.guard.js';

@Module({
  imports: [PrismaModule, AuthModule, LocationsModule, CommunicationsModule],
  controllers: [PeopleController, ConnectionsController, UserSafetyController],
  providers: [
    PeopleService,
    PeopleDiscoveryService,
    PeopleConnectionsService,
    PeopleSafetyService,
    PeopleViewsService,
    PeopleAccessService,
    PublicSearchRateGuard,
  ],
  exports: [PeopleDiscoveryService],
})
export class PeopleModule {}
