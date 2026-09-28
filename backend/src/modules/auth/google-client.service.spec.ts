import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';
import { GoogleClientService } from './google-client.service.js';

const config = new ConfigService({
  GOOGLE_CLIENT_ID: 'roomora-test.apps.googleusercontent.com',
  GOOGLE_CLIENT_SECRET: 'test-secret',
  GOOGLE_REDIRECT_URI: 'http://localhost:5000/api/v1/auth/google/callback',
});
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });

function signedToken(changes: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', kid: 'test-key' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: 'https://accounts.google.com',
      aud: config.get('GOOGLE_CLIENT_ID'),
      sub: 'google-user-123',
      iat: now,
      exp: now + 3600,
      nonce: 'expected-nonce',
      email: 'Example@gmail.com',
      email_verified: true,
      name: 'Minh Đạt',
      ...changes,
    }),
  ).toString('base64url');
  const content = `${header}.${payload}`;
  return `${content}.${sign('RSA-SHA256', Buffer.from(content), keys.privateKey).toString('base64url')}`;
}

describe('GoogleClientService', () => {
  beforeEach(() => {
    // Use the real Google signature/claims verifier, with a local signing key.
    vi.spyOn(
      OAuth2Client.prototype,
      'getFederatedSignonCertsAsync',
    ).mockResolvedValue({
      certs: {
        'test-key': keys.publicKey
          .export({ type: 'spki', format: 'pem' })
          .toString(),
      },
      format: 'PEM' as Awaited<
        ReturnType<OAuth2Client['getFederatedSignonCertsAsync']>
      >['format'],
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('builds a least-privilege authorization URL with state, nonce and PKCE', async () => {
    const authorization = await new GoogleClientService(
      config,
    ).createAuthorization('state-value', 'nonce-value');
    const url = new URL(authorization.url);
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('redirect_uri')).toBe(
      config.get('GOOGLE_REDIRECT_URI'),
    );
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    expect(url.searchParams.get('state')).toBe('state-value');
    expect(url.searchParams.get('nonce')).toBe('nonce-value');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe(
      createHash('sha256')
        .update(authorization.codeVerifier)
        .digest('base64url'),
    );
    expect(url.searchParams.has('client_secret')).toBe(false);
    expect(url.searchParams.get('access_type')).toBe('online');
  });

  it('verifies a signed token and normalizes the account email', async () => {
    const exchange = vi
      .spyOn(OAuth2Client.prototype, 'getToken')
      .mockResolvedValue({ tokens: { id_token: signedToken() } });
    const identity = await new GoogleClientService(config).verifyCode(
      'code',
      'verifier',
      'expected-nonce',
    );
    expect(identity).toEqual({
      googleId: 'google-user-123',
      email: 'example@gmail.com',
      displayName: 'Minh Đạt',
    });
    expect(exchange).toHaveBeenCalledWith({
      code: 'code',
      codeVerifier: 'verifier',
    });
  });

  it.each([
    ['audience', { aud: 'another-client' }],
    ['issuer', { iss: 'https://attacker.example' }],
    ['expiry', { exp: Math.floor(Date.now() / 1000) - 3600 }],
    ['nonce', { nonce: 'wrong-nonce' }],
    ['missing nonce', { nonce: undefined }],
    ['unverified email', { email_verified: false }],
    ['missing subject', { sub: '' }],
  ])('rejects an invalid %s', async (_label, changes) => {
    vi.spyOn(OAuth2Client.prototype, 'getToken').mockResolvedValue({
      tokens: { id_token: signedToken(changes) },
    });
    await expect(
      new GoogleClientService(config).verifyCode(
        'code',
        'verifier',
        'expected-nonce',
      ),
    ).rejects.toMatchObject({ code: 'GOOGLE_TOKEN_INVALID' });
  });

  it('rejects a forged signature', async () => {
    const token = signedToken();
    const signatureStart = token.lastIndexOf('.') + 1;
    const forged =
      token.slice(0, signatureStart) +
      (token[signatureStart] === 'A' ? 'B' : 'A') +
      token.slice(signatureStart + 1);
    vi.spyOn(OAuth2Client.prototype, 'getToken').mockResolvedValue({
      tokens: { id_token: forged },
    });
    await expect(
      new GoogleClientService(config).verifyCode(
        'code',
        'verifier',
        'expected-nonce',
      ),
    ).rejects.toMatchObject({ code: 'GOOGLE_TOKEN_INVALID' });
  });

  it('hides provider errors and rejects a disabled configuration', async () => {
    vi.spyOn(OAuth2Client.prototype, 'getToken').mockRejectedValue(
      new Error('secret-provider-details'),
    );
    await expect(
      new GoogleClientService(config).verifyCode('code', 'verifier', 'nonce'),
    ).rejects.toMatchObject({ message: 'GOOGLE_NETWORK_ERROR' });
    await expect(
      new GoogleClientService(new ConfigService({})).createAuthorization(
        'state',
        'nonce',
      ),
    ).rejects.toMatchObject({ code: 'GOOGLE_DISABLED' });
  });

  it.each([
    ['invalid_grant', 'GOOGLE_CODE_INVALID'],
    ['invalid_client', 'GOOGLE_CLIENT_INVALID'],
    ['unauthorized_client', 'GOOGLE_CLIENT_INVALID'],
  ])(
    'reports a safe code for provider %s',
    async (providerCode, expectedCode) => {
      vi.spyOn(OAuth2Client.prototype, 'getToken').mockRejectedValue({
        response: {
          data: { error: providerCode, client_secret: 'never-expose' },
        },
      });
      await expect(
        new GoogleClientService(config).verifyCode('code', 'verifier', 'nonce'),
      ).rejects.toMatchObject({ code: expectedCode });
    },
  );

  it('separates other provider rejections from connection failures', async () => {
    vi.spyOn(OAuth2Client.prototype, 'getToken').mockRejectedValue({
      response: {
        status: 400,
        data: { error: 'invalid_request', client_secret: 'never-expose' },
      },
    });
    await expect(
      new GoogleClientService(config).verifyCode('code', 'verifier', 'nonce'),
    ).rejects.toMatchObject({ code: 'GOOGLE_TOKEN_EXCHANGE_FAILED' });
  });
});
