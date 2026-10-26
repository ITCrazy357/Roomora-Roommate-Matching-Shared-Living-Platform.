import pg from 'pg';
import { schemaReadinessQuery } from '../dist/database/schema-readiness.js';

// Explicit environment only: never silently load a workstation's .env.
const client = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 6000,
  statement_timeout: 10000,
});
try {
  if (!process.env.DATABASE_URL) throw new Error('Missing connection');
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const result = await client.query(schemaReadinessQuery);
  const ready = result.rows[0]?.schema_ready === true;
  console.log(JSON.stringify({ schemaReady: ready }));
  process.exitCode = ready ? 0 : 1;
} catch {
  console.error(
    JSON.stringify({
      schemaReady: false,
      error: 'RELEASE_VERIFICATION_FAILED',
    }),
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
