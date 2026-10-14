import { validateEnvironment } from './environment.validation.js';

describe('Redis environment validation', () => {
  const base = { FRONTEND_ORIGIN: 'http://localhost:3000' };
  it('allows local memory only outside production', () => {
    expect(validateEnvironment(base).REDIS_URL).toBeUndefined();
    expect(() =>
      validateEnvironment({
        ...base,
        NODE_ENV: 'production',
        AUTH_OTP_SECRET: 'a'.repeat(64),
      }),
    ).toThrow('REDIS_URL');
    expect(
      validateEnvironment({
        ...base,
        REDIS_URL: 'rediss://user:password@redis.example.com:6379/0',
      }).REDIS_KEY_PREFIX,
    ).toBe('roomora');
  });
  it.each([
    'http://localhost',
    'redis://localhost/abc',
    'redis://localhost/0?x=1',
    'redis://localhost/0#secret',
    'invalid',
  ])('rejects invalid Redis URL %s', (REDIS_URL) => {
    expect(() => validateEnvironment({ ...base, REDIS_URL })).toThrow(
      'REDIS_URL',
    );
  });
  it.each(['roomora:other', '{unsafe}', 'space here', 'a'.repeat(65)])(
    'rejects invalid key prefix %s',
    (REDIS_KEY_PREFIX) => {
      expect(() => validateEnvironment({ ...base, REDIS_KEY_PREFIX })).toThrow(
        'REDIS_KEY_PREFIX',
      );
    },
  );
});

describe('Database operational limits', () => {
  const base = { FRONTEND_ORIGIN: 'http://localhost:3000' };
  it.each(['0', '-1', '1.5', 'abc', '101'])(
    'rejects invalid pool size %s',
    (value) => {
      expect(() =>
        validateEnvironment({ ...base, DATABASE_POOL_SIZE: value }),
      ).toThrow('DATABASE_POOL_SIZE');
    },
  );
  it('normalizes valid values and uses conservative defaults', () => {
    expect(validateEnvironment(base)).toMatchObject({
      DATABASE_POOL_SIZE: 10,
      DATABASE_SLOW_QUERY_MS: 500,
      TRUST_PROXY_HOPS: 0,
    });
    expect(
      validateEnvironment({
        ...base,
        DATABASE_POOL_SIZE: '20',
        DATABASE_SLOW_QUERY_MS: '250',
      }),
    ).toMatchObject({ DATABASE_POOL_SIZE: 20, DATABASE_SLOW_QUERY_MS: 250 });
  });
});

describe('Proxy trust', () => {
  const base = { FRONTEND_ORIGIN: 'http://localhost:3000' };
  it('allows one private proxy hop and rejects broad trust', () => {
    expect(
      validateEnvironment({ ...base, TRUST_PROXY_HOPS: '1' }).TRUST_PROXY_HOPS,
    ).toBe(1);
    expect(() =>
      validateEnvironment({ ...base, TRUST_PROXY_HOPS: '2' }),
    ).toThrow('TRUST_PROXY_HOPS');
  });
});

describe('Google environment validation', () => {
  const base = { FRONTEND_ORIGIN: 'http://localhost:3000' };
  const google = {
    GOOGLE_CLIENT_ID: 'test.apps.googleusercontent.com',
    GOOGLE_CLIENT_SECRET: 'test-only',
    GOOGLE_REDIRECT_URI: 'http://localhost:5000/api/v1/auth/google/callback',
  };

  it('allows Google to be disabled or fully configured', () => {
    expect(validateEnvironment(base).GOOGLE_CLIENT_ID).toBeUndefined();
    expect(
      validateEnvironment({ ...base, ...google }).GOOGLE_REDIRECT_URI,
    ).toBe(google.GOOGLE_REDIRECT_URI);
  });

  it('rejects partially configured Google credentials', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        GOOGLE_CLIENT_ID: google.GOOGLE_CLIENT_ID,
      }),
    ).toThrow('Cần cấu hình đủ');
  });

  it.each([
    'http://example.com/api/v1/auth/google/callback',
    'https://example.com/api/v1/auth/google/callback/',
    'https://example.com/api/v1/auth/google/callback?next=evil',
    'https://user:password@example.com/api/v1/auth/google/callback',
  ])('rejects an unsafe or mismatched callback: %s', (uri) => {
    expect(() =>
      validateEnvironment({ ...base, ...google, GOOGLE_REDIRECT_URI: uri }),
    ).toThrow('GOOGLE_REDIRECT_URI');
  });

  it('requires HTTPS callbacks in production', () => {
    expect(() =>
      validateEnvironment({
        ...base,
        ...google,
        NODE_ENV: 'production',
        AUTH_OTP_SECRET: 'a'.repeat(64),
      }),
    ).toThrow('GOOGLE_REDIRECT_URI');
  });

  it('requires a sufficiently long OTP secret in production', () => {
    expect(() =>
      validateEnvironment({ ...base, NODE_ENV: 'production' }),
    ).toThrow('AUTH_OTP_SECRET');
    expect(() =>
      validateEnvironment({ ...base, AUTH_OTP_SECRET: 'short' }),
    ).toThrow('AUTH_OTP_SECRET');
    expect(
      validateEnvironment({
        ...base,
        NODE_ENV: 'production',
        AUTH_OTP_SECRET: 'a'.repeat(64),
        REDIS_URL: 'redis://localhost:6379/0',
      }).AUTH_OTP_SECRET,
    ).toBe('a'.repeat(64));
  });
});

describe('Payment gateway configuration', () => {
  const base = { FRONTEND_ORIGIN: 'http://localhost:3000' };
  const payos = {
    PAYOS_CLIENT_ID: 'test-client',
    PAYOS_API_KEY: 'test-api',
    PAYOS_CHECKSUM_KEY: 'test-checksum',
  };
  it('defaults to MoMo sandbox and accepts fully configured PayOS', () => {
    expect(validateEnvironment(base).BILLING_PAYMENT_PROVIDER).toBe(
      'MOMO_SANDBOX',
    );
    expect(
      validateEnvironment({
        ...base,
        ...payos,
        BILLING_PAYMENT_PROVIDER: 'PAYOS',
      }).BILLING_PAYMENT_PROVIDER,
    ).toBe('PAYOS');
  });
  it.each(['PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY'])(
    'rejects incomplete PayOS settings: %s',
    (key) => {
      expect(() =>
        validateEnvironment({ ...base, [key]: 'test-only' }),
      ).toThrow('Cần cấu hình đủ PAYOS');
    },
  );
  it('rejects unknown payment providers', () => {
    expect(() =>
      validateEnvironment({ ...base, BILLING_PAYMENT_PROVIDER: 'OTHER' }),
    ).toThrow('BILLING_PAYMENT_PROVIDER');
  });
});
