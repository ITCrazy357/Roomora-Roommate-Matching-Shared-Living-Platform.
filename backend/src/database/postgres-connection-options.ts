type PostgresConnectionOptions = {
  connectionString: string;
  ssl?: { ca: string; rejectUnauthorized: true };
};

function decodeCertificate(value: string): string {
  const encoded = value.replace(/\s+/g, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(encoded) || encoded.length % 4 !== 0)
    throw new Error('DATABASE_SSL_CA_BASE64 must be valid base64');
  const certificate = Buffer.from(encoded, 'base64').toString('utf8');
  if (
    !certificate.includes('-----BEGIN CERTIFICATE-----') ||
    !certificate.includes('-----END CERTIFICATE-----')
  )
    throw new Error('DATABASE_SSL_CA_BASE64 must contain a PEM certificate');
  return certificate;
}

export function postgresConnectionOptions(
  connectionString: string,
  certificateBase64?: string,
): PostgresConnectionOptions {
  if (!certificateBase64) return { connectionString };

  const url = new URL(connectionString);
  // node-postgres lets these URL parameters replace the explicit ssl object.
  // A supplied CA must remain authoritative for managed PostgreSQL services.
  for (const parameter of ['sslmode', 'sslrootcert', 'sslcert', 'sslkey'])
    url.searchParams.delete(parameter);

  return {
    connectionString: url.toString(),
    ssl: { ca: decodeCertificate(certificateBase64), rejectUnauthorized: true },
  };
}
