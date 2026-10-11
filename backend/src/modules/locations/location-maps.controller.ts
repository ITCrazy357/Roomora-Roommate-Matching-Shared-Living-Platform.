import {
  Controller,
  Get,
  Header,
  Param,
  ParseIntPipe,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { Transform } from 'class-transformer';
import { IsString, Length, IsOptional, IsIn } from 'class-validator';
import { LocationMapsService } from './location-maps.service.js';

class SearchPlaceDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(2, 200)
  q!: string;
}

class TileQueryDto {
  @IsOptional()
  @IsIn(['0', '1'])
  retina?: string;
}

@Controller('locations/map')
export class LocationMapsController {
  constructor(private readonly maps: LocationMapsService) {}

  @Get('config')
  configuration() {
    return { available: this.maps.available() };
  }

  @Get('search')
  search(@Query() query: SearchPlaceDto) {
    return this.maps.search(query.q);
  }

  @Get('tiles/:z/:x/:y')
  @Header('Cache-Control', 'public, max-age=300')
  async tile(
    @Param('z', ParseIntPipe) z: number,
    @Param('x', ParseIntPipe) x: number,
    @Param('y', ParseIntPipe) y: number,
    @Query() query: TileQueryDto,
  ) {
    return new StreamableFile(
      await this.maps.tile(z, x, y, query.retina === '1'),
      { type: 'image/png' },
    );
  }
}
