import { Module } from '@nestjs/common';
import { LocationsController } from './locations.controller.js';
import { LocationsService } from './locations.service.js';
import { LocationMapsService } from './location-maps.service.js';
import { LocationMapsController } from './location-maps.controller.js';

@Module({
  controllers: [LocationsController, LocationMapsController],
  providers: [LocationsService, LocationMapsService],
  exports: [LocationsService],
})
export class LocationsModule {}
