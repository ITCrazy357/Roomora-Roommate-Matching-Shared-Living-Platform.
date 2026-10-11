import { ConfigService } from '@nestjs/config';
import { LocationMapsService } from './location-maps.service.js';

describe('Location map provider proxy', () => {
  const config = new ConfigService({
    GEOAPIFY_API_KEY: 'private-map-test-key',
  });
  let service: LocationMapsService;
  beforeEach(() => {
    service = new LocationMapsService(config);
  });
  afterEach(() => vi.restoreAllMocks());

  it('filters search to Vietnam and returns only display names and coordinates', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            {
              formatted: 'Cầu Giấy, Hà Nội',
              lat: 21.03,
              lon: 105.8,
              apiKey: 'not-public',
              other: 'ignored',
            },
            { formatted: 'Outside Vietnam', lat: 30, lon: 110 },
          ],
        }),
      ),
    );
    expect(await service.search('Cầu Giấy')).toEqual([
      { name: 'Cầu Giấy, Hà Nội', latitude: 21.03, longitude: 105.8 },
    ]);
    const url = fetch.mock.calls[0][0] as URL;
    expect(url.searchParams.get('filter')).toBe('countrycode:vn');
    expect(url.searchParams.get('apiKey')).toBe('private-map-test-key');
  });

  it('serves cached tiles and never returns the provider key', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockImplementation(
      async () =>
        new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { 'Content-Type': 'image/png' },
        }),
    );
    expect(await service.tile(6, 50, 29, false)).toEqual(
      Buffer.from([137, 80, 78, 71]),
    );
    await service.tile(6, 50, 29, false);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid tile coordinates before calling the provider', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    await expect(service.tile(6, 64, 0, false)).rejects.toMatchObject({
      status: 400,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('hides upstream errors and configuration secrets', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(
      new Error('URL contains private-map-test-key'),
    );
    await expect(service.search('Hà Nội')).rejects.toMatchObject({
      response: { code: 'MAP_UNAVAILABLE' },
    });
    expect(new LocationMapsService(new ConfigService()).available()).toBe(
      false,
    );
  });
});
