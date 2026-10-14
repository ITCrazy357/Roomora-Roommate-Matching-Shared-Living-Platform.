import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../../redis/redis.service.js';

interface Place {
  formatted?: string;
  lat?: number;
  lon?: number;
}

@Injectable()
export class LocationMapsService {
  // Bound the cache so browsing many places cannot grow server memory indefinitely.
  private readonly tiles = new Map<
    string,
    { data: Buffer; expiresAt: number }
  >();

  constructor(
    private readonly config: ConfigService,
    private readonly redis: RedisService,
  ) {}

  available() {
    return Boolean(this.config.get<string>('GEOAPIFY_API_KEY')?.trim());
  }

  private async request(url: URL) {
    const key = this.config.get<string>('GEOAPIFY_API_KEY')?.trim();
    if (!key)
      throw new ServiceUnavailableException({ code: 'MAP_NOT_CONFIGURED' });
    url.searchParams.set('apiKey', key);
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Map provider unavailable');
      return response;
    } catch {
      // Never forward the provider URL, which contains the private key.
      throw new ServiceUnavailableException({ code: 'MAP_UNAVAILABLE' });
    }
  }

  async search(query: string) {
    const url = new URL('https://api.geoapify.com/v1/geocode/search');
    url.searchParams.set('text', query);
    url.searchParams.set('filter', 'countrycode:vn');
    url.searchParams.set('format', 'json');
    url.searchParams.set('lang', 'vi');
    url.searchParams.set('limit', '5');
    try {
      const response = await this.request(url);
      const payload = (await response.json()) as { results?: Place[] };
      return (payload.results ?? [])
        .filter(
          (place) =>
            typeof place.formatted === 'string' &&
            typeof place.lat === 'number' &&
            place.lat >= 8 &&
            place.lat <= 24 &&
            typeof place.lon === 'number' &&
            place.lon >= 102 &&
            place.lon <= 110,
        )
        .map((place) => ({
          name: place.formatted!,
          latitude: place.lat!,
          longitude: place.lon!,
        }));
    } catch {
      throw new ServiceUnavailableException({ code: 'MAP_UNAVAILABLE' });
    }
  }

  async tile(z: number, x: number, y: number, retina: boolean) {
    if (z < 5 || z > 20 || x < 0 || y < 0 || x >= 2 ** z || y >= 2 ** z)
      throw new BadRequestException({ code: 'MAP_TILE_INVALID' });
    const path = `${z}/${x}/${y}${retina ? '@2x' : ''}.png`;
    const cached = this.tiles.get(path);
    if (cached && cached.expiresAt > Date.now()) return cached.data;
    const shared = await this.redis.getTile(path);
    if (shared) {
      // Do not extend the shared TTL in a local cache on another instance.
      return shared;
    }
    try {
      const response = await this.request(
        new URL(`https://maps.geoapify.com/v1/tile/osm-carto/${path}`),
      );
      if (!response.headers.get('content-type')?.startsWith('image/png'))
        throw new Error('Invalid tile');
      const data = Buffer.from(await response.arrayBuffer());
      if (data.length > 2 * 1024 * 1024) throw new Error('Tile too large');
      if (this.tiles.size >= 128)
        this.tiles.delete(this.tiles.keys().next().value!);
      this.tiles.set(path, { data, expiresAt: Date.now() + 300000 });
      await this.redis.setTile(path, data);
      return data;
    } catch {
      throw new ServiceUnavailableException({ code: 'MAP_UNAVAILABLE' });
    }
  }
}
