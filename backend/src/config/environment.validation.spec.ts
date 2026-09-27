import { validateEnvironment } from './environment.validation.js';

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
      validateEnvironment({ ...base, ...google, NODE_ENV: 'production' }),
    ).toThrow('GOOGLE_REDIRECT_URI');
  });
});
