import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module.js';

describe('Location map HTTP proxy', () => {
  let app: INestApplication;
  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = fixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    app.get(ConfigService).set('GEOAPIFY_API_KEY', 'private-http-test-map-key');
    await app.listen(0, '127.0.0.1');
  });
  afterEach(() => vi.restoreAllMocks());
  afterAll(async () => app?.close());

  it('exposes availability without keys', async () => {
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/v1/locations/map/config')
          .expect(200)
      ).body,
    ).toEqual({ available: true });
  });
  it('validates search input before calling the provider', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    for (const query of [
      {},
      { q: 'a' },
      { q: 'a'.repeat(201) },
      { q: 'Hà Nội', apiKey: 'injected' },
    ]) {
      await request(app.getHttpServer())
        .get('/api/v1/locations/map/search')
        .query(query)
        .expect(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it('returns only safe search results and serves PNG tiles', async () => {
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            results: [{ formatted: 'Hà Nội', lat: 21.03, lon: 105.8 }],
          }),
        ),
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([137, 80, 78, 71]), {
          headers: { 'Content-Type': 'image/png' },
        }),
      );
    expect(
      (
        await request(app.getHttpServer())
          .get('/api/v1/locations/map/search')
          .query({ q: 'Hà Nội' })
          .expect(200)
      ).body,
    ).toEqual([{ name: 'Hà Nội', latitude: 21.03, longitude: 105.8 }]);
    const tile = await request(app.getHttpServer())
      .get('/api/v1/locations/map/tiles/6/50/29')
      .expect(200)
      .expect('Content-Type', 'image/png');
    expect(tile.body).toEqual(Buffer.from([137, 80, 78, 71]));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('rejects malformed or out-of-range tiles without a provider request', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch');
    for (const path of [
      'word/0/0',
      '21/0/0',
      '6/64/0',
      '6/0/-1',
      '6/50/29?retina=oops',
    ]) {
      await request(app.getHttpServer())
        .get('/api/v1/locations/map/tiles/' + path)
        .expect(400);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
});
