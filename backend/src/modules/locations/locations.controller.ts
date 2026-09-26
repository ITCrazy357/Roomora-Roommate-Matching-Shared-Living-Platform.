import { Controller, Get, Header, Param } from '@nestjs/common';
import { LocationsService } from './locations.service.js';

@Controller('locations/provinces')
export class LocationsController {
  constructor(private readonly locations: LocationsService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=86400')
  provinces() {
    return this.locations.listProvinces();
  }

  @Get(':code/wards')
  @Header('Cache-Control', 'public, max-age=86400')
  wards(@Param('code') code: string) {
    return this.locations.listWards(code);
  }
}
