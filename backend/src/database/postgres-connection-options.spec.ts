import { postgresConnectionOptions } from './postgres-connection-options.js';

const certificate = [
  '-----BEGIN CERTIFICATE-----',
  'test-only-certificate',
  '-----END CERTIFICATE-----',
].join('\n');

describe('postgresConnectionOptions', () => {
  it('keeps local connection strings unchanged without a configured CA', () => {
    expect(
      postgresConnectionOptions('postgresql://localhost:5432/roomora'),
    ).toEqual({ connectionString: 'postgresql://localhost:5432/roomora' });
  });

  it('uses the configured CA without allowing URL TLS settings to overwrite it', () => {
    const options = postgresConnectionOptions(
      'postgresql://user:password@db.example.com:5432/roomora?sslmode=require&application_name=roomora',
      Buffer.from(certificate).toString('base64'),
    );

    const url = new URL(options.connectionString);
    expect(url.searchParams.get('sslmode')).toBeNull();
    expect(url.searchParams.get('application_name')).toBe('roomora');
    expect(options.ssl).toEqual({ ca: certificate, rejectUnauthorized: true });
  });

  it('rejects invalid configured certificates', () => {
    expect(() =>
      postgresConnectionOptions(
        'postgresql://localhost:5432/roomora',
        'not a certificate',
      ),
    ).toThrow('DATABASE_SSL_CA_BASE64');
  });
});
