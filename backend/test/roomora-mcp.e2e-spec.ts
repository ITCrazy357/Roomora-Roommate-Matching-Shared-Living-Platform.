import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { randomBytes, createHash } from 'node:crypto';
import request from 'supertest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { hashToken, randomToken } from '../src/modules/auth/token.utils.js';
import { McpSettingsService } from '../src/modules/roomora-mcp/mcp-settings.service.js';
import { RateLimitService } from '../src/redis/rate-limit.service.js';
import { httpCors } from '../src/common/http-cors.js';

describe('Roomora OAuth and read-only MCP (HTTP/PostgreSQL/SDK)', () => {
  let app: INestApplication, prisma: PrismaService, resource: string;
  let clientId: string,
    otherClientId: string,
    userId: string,
    otherUserId: string,
    sessionId: string;
  let cookie: string, otherCookie: string, adminCookie: string;
  let publicId: string, draftId: string, hiddenId: string, deletedId: string;
  const origin = 'http://localhost:3000',
    base = '/api/v1/mcp',
    oauth = `${base}/oauth`;
  const redirect = 'http://127.0.0.1:19888/callback';
  const http = () => request(app.getHttpServer());
  const consent = (id: string, allow: boolean, withCookie = cookie) =>
    http()
      .post(`${base}/authorizations/${id}`)
      .set('Cookie', withCookie)
      .set('Origin', origin)
      .send({ allow });
  const token = (data: Record<string, string>) =>
    http()
      .post(`${oauth}/token`)
      .type('form')
      .send({ client_id: clientId, resource, ...data });
  const rpc = (access: string, name: string, args: object) =>
    http()
      .post(base)
      .set('Authorization', `Bearer ${access}`)
      .set('Accept', 'application/json, text/event-stream')
      .send({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: args },
      });

  async function authorize(extra: Record<string, string> = {}) {
    const verifier = randomBytes(32).toString('base64url');
    const response = await http()
      .get(`${oauth}/authorize`)
      .query({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirect,
        code_challenge_method: 'S256',
        code_challenge: createHash('sha256')
          .update(verifier)
          .digest('base64url'),
        scope: 'listings:read',
        resource,
        state: 'fixture-state',
        ...extra,
      })
      .expect(303);
    const id = new URL(response.headers.location).searchParams.get('request')!;
    return { id, verifier };
  }
  async function grant() {
    const { id, verifier } = await authorize();
    const decision = await consent(id, true).expect(200);
    const code = new URL(decision.body.redirectUrl).searchParams.get('code')!;
    const response = await token({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirect,
    }).expect(200);
    return response.body as { access_token: string; refresh_token: string };
  }
  async function session(role: 'USER' | 'ADMIN' = 'USER') {
    const user = await prisma.user.create({
      data: {
        email: `mcp-${randomToken()}@example.test`,
        role,
        emailVerifiedAt: new Date(),
        profile: { create: { displayName: 'MCP fixture' } },
      },
    });
    const raw = randomToken();
    const saved = await prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashToken(raw),
        expiresAt: new Date(Date.now() + 86400_000),
      },
    });
    return {
      id: user.id,
      sessionId: saved.id,
      cookie: `roomora_session=${raw}`,
    };
  }

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.enableCors(httpCors(app.get(ConfigService)));
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.listen(0, '127.0.0.1');
    // The app can sit behind a proxy: audience comes from config, never request Host.
    const settings = app.get(McpSettingsService);
    resource = settings.resource;
    prisma = app.get(PrismaService);
    const a = await session(),
      b = await session(),
      c = await session('ADMIN');
    userId = a.id;
    sessionId = a.sessionId;
    cookie = a.cookie;
    otherCookie = b.cookie;
    otherUserId = b.id;
    adminCookie = c.cookie;
    const createClient = async () =>
      (
        await http()
          .post(`${oauth}/register`)
          .send({
            client_name: 'Fixture AI',
            redirect_uris: [redirect],
            token_endpoint_auth_method: 'none',
            grant_types: ['authorization_code', 'refresh_token'],
            scope: 'listings:read',
          })
          .expect(201)
      ).body.client_id as string;
    clientId = await createClient();
    otherClientId = await createClient();
    for (const status of ['PUBLISHED', 'DRAFT', 'CLOSED', 'DELETED'] as const) {
      const listing = await prisma.listing.create({
        data: {
          ownerId: userId,
          status: status === 'DELETED' ? 'PUBLISHED' : status,
          deletedAt: status === 'DELETED' ? new Date() : null,
          type: 'ROOM_RENTAL',
          title: `Fixture ${status}`,
          description: 'Public description',
          provinceCode: '01',
          provinceName: 'Thành phố Hà Nội',
          wardCode: '00004',
          wardName: 'Phường Ba Đình',
          rent: 3_000_000,
          publishedAt: new Date(),
          privateAddress: 'PRIVATE_ADDRESS_MUST_NOT_LEAK',
          rejectionReason: 'PRIVATE_MODERATION',
          latitude: 21.03,
          longitude: 105.85,
        },
      });
      if (status === 'PUBLISHED') publicId = listing.id;
      if (status === 'DRAFT') draftId = listing.id;
      if (status === 'CLOSED') hiddenId = listing.id;
      if (status === 'DELETED') deletedId = listing.id;
    }
  }, 30_000);
  afterEach(() => {
    app.get<RateLimitService>(RateLimitService)['buckets'].clear();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('advertises OAuth discovery, mandatory S256 and public clients', async () => {
    const metadata = await http()
      .get('/.well-known/oauth-authorization-server')
      .expect(200);
    expect(metadata.body.code_challenge_methods_supported).toEqual(['S256']);
    expect(metadata.body.token_endpoint_auth_methods_supported).toEqual([
      'none',
    ]);
    const protectedMetadata = await http()
      .get('/.well-known/oauth-protected-resource/api/v1/mcp')
      .expect(200);
    expect(protectedMetadata.body.scopes_supported).toEqual(['listings:read']);
    expect(protectedMetadata.body.resource).toBe(resource);
    const spoofed = await http()
      .get('/.well-known/oauth-authorization-server')
      .set('Host', 'evil.example')
      .expect(200);
    expect(spoofed.body.issuer).toBe(new URL(resource).origin);
    await http()
      .post(`${oauth}/register`)
      .send({
        redirect_uris: ['http://evil.example/callback'],
        token_endpoint_auth_method: 'none',
      })
      .expect(400);
    await http()
      .post(`${oauth}/register`)
      .send({
        redirect_uris: [redirect],
        token_endpoint_auth_method: 'none',
        scope: 'listings:write',
      })
      .expect(400);
    await http()
      .post(`${oauth}/register`)
      .send({
        redirect_uris: [redirect],
        token_endpoint_auth_method: 'client_secret_post',
      })
      .expect(400);
    const rejected = await http()
      .get(`${oauth}/authorize`)
      .query({
        response_type: 'code',
        client_id: clientId,
        redirect_uri: redirect,
        code_challenge_method: 'plain',
        code_challenge: randomToken(),
        resource,
      })
      .expect(302);
    expect(new URL(rejected.headers.location).searchParams.get('error')).toBe(
      'invalid_request',
    );
  });

  it('requires explicit session-authenticated consent with CSRF protection', async () => {
    const { id } = await authorize();
    expect(await prisma.mcpGrant.count()).toBe(0);
    await http().get(`${base}/authorizations/${id}`).expect(401);
    await http()
      .get(`${base}/authorizations/${id}`)
      .set('Cookie', adminCookie)
      .expect(403);
    await http()
      .post(`${base}/authorizations/${id}`)
      .set('Cookie', cookie)
      .set('Origin', 'https://evil.example')
      .send({ allow: true })
      .expect(403);
    const result = await consent(id, false).expect(200);
    expect(new URL(result.body.redirectUrl).searchParams.get('error')).toBe(
      'access_denied',
    );
    expect(new URL(result.body.redirectUrl).searchParams.get('state')).toBe(
      'fixture-state',
    );
    await consent(id, true).expect(400);
  });

  it('binds codes to PKCE, client, redirect and resource; concurrent redemption succeeds once', async () => {
    const { id, verifier } = await authorize();
    const decision = await consent(id, true).expect(200);
    const code = new URL(decision.body.redirectUrl).searchParams.get('code')!;
    const data = {
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: redirect,
    };
    await token({ ...data, code_verifier: randomToken() }).expect(400);
    await token({ ...data, client_id: otherClientId }).expect(400);
    await token({
      ...data,
      redirect_uri: 'http://127.0.0.1:19888/other',
    }).expect(400);
    await token({ ...data, resource: 'https://other.example/mcp' }).expect(400);
    const responses = await Promise.all([token(data), token(data)]);
    expect(
      responses.map((response) => response.status).sort((a, b) => a - b),
    ).toEqual([200, 400]);
    await token(data).expect(400);
  });

  it('rejects cookie-only, token-in-query, unknown bearer, bad origin and expired access', async () => {
    const unauthorized = await http()
      .post(base)
      .set('Cookie', cookie)
      .send({})
      .expect(401);
    expect(unauthorized.headers['www-authenticate']).toContain(
      'resource_metadata=',
    );
    const tokens = await grant();
    await http()
      .post(base)
      .query({ access_token: tokens.access_token })
      .send({})
      .expect(401);
    await http()
      .post(base)
      .set('Authorization', 'Bearer bad')
      .send({})
      .expect(401);
    await http()
      .post(base)
      .set('Authorization', `Bearer ${tokens.access_token}`)
      .set('Origin', 'https://evil.example')
      .send({})
      .expect(403);
    await prisma.mcpGrant.update({
      where: { accessHash: hashToken(tokens.access_token) },
      data: { expiresAt: new Date(0) },
    });
    await rpc(tokens.access_token, 'search_listings', {}).expect(401);
  });

  it('expires pending requests and codes; denies wrong resource and scopes before consent', async () => {
    for (const extra of [
      { resource: 'https://other.example/mcp' },
      { scope: 'listings:write' },
    ]) {
      const response = await http()
        .get(`${oauth}/authorize`)
        .query({
          response_type: 'code',
          client_id: clientId,
          redirect_uri: redirect,
          code_challenge_method: 'S256',
          code_challenge: randomToken(),
          resource,
          ...extra,
        })
        .expect(302);
      expect(new URL(response.headers.location).searchParams.has('error')).toBe(
        true,
      );
    }
    const pending = await authorize();
    await prisma.mcpAuthorization.update({
      where: { id: pending.id },
      data: { expiresAt: new Date(0) },
    });
    await consent(pending.id, true).expect(400);
    const approved = await authorize();
    const decision = await consent(approved.id, true).expect(200);
    const code = new URL(decision.body.redirectUrl).searchParams.get('code')!;
    await prisma.mcpAuthorization.update({
      where: { id: approved.id },
      data: { expiresAt: new Date(0) },
    });
    await token({
      grant_type: 'authorization_code',
      code,
      code_verifier: approved.verifier,
      redirect_uri: redirect,
    }).expect(400);
  });

  it('exercises the official MCP client: exactly two read-only tools and public data only', async () => {
    const tokens = await grant();
    const client = new Client({ name: 'Roomora-fixture', version: '1.0' });
    const transport = new StreamableHTTPClientTransport(
      new URL(`${await app.getUrl()}${base}`),
      {
        requestInit: {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        },
      },
    );
    try {
      await client.connect(transport);
      const tools = await client.listTools();
      expect(tools.tools.map((tool) => tool.name).sort()).toEqual([
        'get_listing',
        'search_listings',
      ]);
      expect(tools.tools.every((tool) => tool.annotations?.readOnlyHint)).toBe(
        true,
      );
      const result = await client.callTool({
        name: 'search_listings',
        arguments: { provinceCode: '01', maxRent: 4_000_000 },
      });
      const data = result.structuredContent as { items: { id: string }[] };
      expect(data.items.map((item) => item.id)).toEqual([publicId]);
      const json = JSON.stringify(data);
      for (const secret of [
        'privateAddress',
        'PRIVATE_',
        'ownerId',
        'owner',
        'rejectionReason',
        'latitude',
        'longitude',
        'email',
        'sessionId',
      ])
        expect(json).not.toContain(secret);
      expect(
        (
          await client.callTool({
            name: 'get_listing',
            arguments: { id: publicId },
          })
        ).isError,
      ).not.toBe(true);
      for (const id of [draftId, hiddenId, deletedId])
        expect(
          (await client.callTool({ name: 'get_listing', arguments: { id } }))
            .isError,
        ).toBe(true);
      for (const args of [
        { userId: otherUserId },
        { status: 'DRAFT' },
        { ownerId: userId },
        { limit: 11 },
        { minRent: 5, maxRent: 1 },
      ])
        expect(
          (await client.callTool({ name: 'search_listings', arguments: args }))
            .isError,
        ).toBe(true);
      expect(
        (
          await client.callTool({
            name: 'delete_listing',
            arguments: { id: publicId },
          })
        ).isError,
      ).toBe(true);
    } finally {
      await client.close();
    }
  });

  it('rotates refresh tokens, rejects old access and commits family revocation on reuse', async () => {
    const original = await grant();
    const rotated = await token({
      grant_type: 'refresh_token',
      refresh_token: original.refresh_token,
    }).expect(200);
    expect(rotated.body.refresh_token).not.toBe(original.refresh_token);
    await rpc(original.access_token, 'search_listings', {}).expect(401);
    await rpc(rotated.body.access_token, 'search_listings', {}).expect(200);
    await token({
      grant_type: 'refresh_token',
      refresh_token: original.refresh_token,
    }).expect(400);
    await rpc(rotated.body.access_token, 'search_listings', {}).expect(401);
    await token({
      grant_type: 'refresh_token',
      refresh_token: rotated.body.refresh_token,
    }).expect(400);
  });

  it('isolates connection ownership and invalidates access and refresh after revocation', async () => {
    const tokens = await grant();
    const stored = await prisma.mcpGrant.findUniqueOrThrow({
      where: { accessHash: hashToken(tokens.access_token) },
    });
    const listed = await http()
      .get(`${base}/connections`)
      .set('Cookie', cookie)
      .expect(200);
    expect(
      listed.body.some((item: { id: string }) => item.id === stored.id),
    ).toBe(true);
    expect(JSON.stringify(listed.body)).not.toContain('mcp_access_');
    await http()
      .delete(`${base}/connections/${stored.id}`)
      .set('Cookie', otherCookie)
      .set('Origin', origin)
      .expect(204);
    await rpc(tokens.access_token, 'search_listings', {}).expect(200);
    await http()
      .delete(`${base}/connections/${stored.id}`)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .expect(204);
    await rpc(tokens.access_token, 'search_listings', {}).expect(401);
    await token({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }).expect(400);
  });

  it('rejects refresh scope/resource/client changes and revokes the family after concurrent reuse', async () => {
    const original = await grant();
    const data = {
      grant_type: 'refresh_token',
      refresh_token: original.refresh_token,
    };
    for (const extra of [
      { scope: 'listings:write' },
      { resource: 'https://other.example/mcp' },
      { client_id: otherClientId },
    ])
      await token({ ...data, ...extra }).expect(400);
    const responses = await Promise.all([token(data), token(data)]);
    expect(responses.map((item) => item.status).sort((a, b) => a - b)).toEqual([
      200, 400,
    ]);
    const success = responses.find((item) => item.status === 200)!;
    await rpc(success.body.access_token, 'search_listings', {}).expect(401);
  });

  it('rechecks account lock/closure/verification and session revocation on every request', async () => {
    const tokens = await grant();
    for (const data of [
      { lockedAt: new Date(), lockReason: 'MCP test lock' },
      {
        closedAt: new Date(),
        lockedAt: new Date(),
        lockReason: 'MCP test closure',
      },
      { emailVerifiedAt: null },
    ]) {
      await prisma.user.update({ where: { id: userId }, data });
      await rpc(tokens.access_token, 'get_listing', { id: publicId }).expect(
        401,
      );
      await token({
        grant_type: 'refresh_token',
        refresh_token: tokens.refresh_token,
      }).expect(400);
      await prisma.user.update({
        where: { id: userId },
        data: {
          lockedAt: null,
          lockReason: null,
          closedAt: null,
          emailVerifiedAt: new Date(),
        },
      });
    }
    await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: new Date() },
    });
    await rpc(tokens.access_token, 'search_listings', {}).expect(401);
    await token({
      grant_type: 'refresh_token',
      refresh_token: tokens.refresh_token,
    }).expect(400);
    await prisma.session.update({
      where: { id: sessionId },
      data: { revokedAt: null },
    });
  });

  it('shares public lookup with the chatbot and clarifies unsupported filters without AI charges', async () => {
    const path = '/api/v1/support/chat/listings';
    await http()
      .post(path)
      .set('Origin', origin)
      .send({ message: 'Tìm phòng tại Hà Nội' })
      .expect(401);
    const response = await http()
      .post(path)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({ message: 'Tìm phòng tại Hà Nội dưới 4 triệu' })
      .expect(200);
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([
      publicId,
    ]);
    expect(response.body.answer).toContain('4.000.000');
    const clarify = await http()
      .post(path)
      .set('Cookie', cookie)
      .set('Origin', origin)
      .send({ message: 'Tìm phòng tại Hà Nội có máy lạnh gần trường A' })
      .expect(200);
    expect(clarify.body.items).toEqual([]);
    expect(clarify.body.answer).toContain('bộ lọc');
    expect(await prisma.aiRequest.count()).toBe(0);
  });

  it('hides published listings while their owner is locked or closed', async () => {
    const second = await session();
    const original = cookie;
    cookie = second.cookie;
    try {
      const tokens = await grant();
      await prisma.user.update({
        where: { id: userId },
        data: { lockedAt: new Date(), lockReason: 'MCP test lock' },
      });
      const response = await rpc(
        tokens.access_token,
        'search_listings',
        {},
      ).expect(200);
      expect(response.body.result.structuredContent.items).toEqual([]);
      await prisma.user.update({
        where: { id: userId },
        data: {
          lockedAt: new Date(),
          lockReason: 'MCP test closure',
          closedAt: new Date(),
        },
      });
      expect(
        (
          await rpc(tokens.access_token, 'get_listing', {
            id: publicId,
          }).expect(200)
        ).body.result.isError,
      ).toBe(true);
    } finally {
      cookie = original;
      await prisma.user.update({
        where: { id: userId },
        data: { lockedAt: null, lockReason: null, closedAt: null },
      });
    }
  });

  it('publishes only public IDs and modification times for the Google sitemap, even with owner cookies', async () => {
    const path = '/api/v1/public/listing-sitemap';
    const response = await http().get(path).set('Cookie', cookie).expect(200);
    expect(response.body.items.map((item: { id: string }) => item.id)).toEqual([
      publicId,
    ]);
    expect(
      Object.keys(response.body.items[0]).sort((a, b) => a.localeCompare(b)),
    ).toEqual(['id', 'updatedAt']);
    await http().get(path).query({ after: 'invalid' }).expect(400);
    expect(
      (await http().get(path).query({ after: publicId }).expect(200)).body
        .items,
    ).toEqual([]);
  });
});
