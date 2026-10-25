import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { protectedConnectionFile, savePostgresMcpConnection } from './postgres-mcp-connection.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const requireBackend = createRequire(join(root, 'backend', 'package.json'));
const { Client } = requireBackend('pg');
const { parse } = requireBackend('dotenv');
const env = parse(readFileSync(join(root, 'backend', '.env')));
let adminUrl;
try { adminUrl = new URL(env.DATABASE_URL); }
catch { throw new Error('Invalid DATABASE_URL in backend/.env; connection value is not printed.'); }
assert.ok(['127.0.0.1', 'localhost'].includes(adminUrl.hostname)
  && adminUrl.port === '5433' && adminUrl.pathname === '/roomora',
  'Provisioning only supports the existing Roomora local database on port 5433.');
assert.ok(!existsSync(protectedConnectionFile), 'MCP credentials already exist; run check-postgres-mcp.mjs instead.');
const client = new Client({ connectionString: adminUrl.toString(), connectionTimeoutMillis: 5000 });
let credentialWritten = false;
let committed = false;

try {
  await client.connect();
  await client.query('BEGIN');
  const existing = await client.query(`SELECT 1 FROM pg_roles WHERE rolname = 'roomora_mcp_readonly'
    UNION ALL SELECT 1 FROM pg_namespace WHERE nspname = 'mcp_inspect'`);
  assert.equal(existing.rowCount, 0, 'MCP role/schema already exists; refusing to overwrite existing access.');
  const password = randomBytes(32).toString('hex');
  // The password is generated hex, never user input. Do not log SQL or pg errors.
  await client.query(`CREATE ROLE roomora_mcp_readonly LOGIN PASSWORD '${password}'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS CONNECTION LIMIT 6`);
  await client.query(`GRANT CONNECT ON DATABASE roomora TO roomora_mcp_readonly;
    ALTER ROLE roomora_mcp_readonly IN DATABASE roomora SET default_transaction_read_only = on;
    ALTER ROLE roomora_mcp_readonly IN DATABASE roomora SET statement_timeout = '5s';
    ALTER ROLE roomora_mcp_readonly IN DATABASE roomora SET lock_timeout = '1s';
    ALTER ROLE roomora_mcp_readonly IN DATABASE roomora SET idle_in_transaction_session_timeout = '5s';
    ALTER ROLE roomora_mcp_readonly IN DATABASE roomora SET search_path = mcp_inspect, pg_catalog;`);
  await client.query(readFileSync(join(root, 'scripts', 'postgres-mcp-views.sql'), 'utf8'));
  const access = await client.query(`SELECT count(*)::int AS total FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m','S')
      AND has_table_privilege('roomora_mcp_readonly', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')`);
  assert.equal(access.rows[0].total, 0, 'Existing PUBLIC grants would expose application tables; provisioning rolled back.');
  const dsn = new URL('postgresql://roomora_mcp_readonly@127.0.0.1:5433/roomora?sslmode=disable');
  dsn.password = password;
  savePostgresMcpConnection(dsn.toString());
  credentialWritten = true;
  await client.query('COMMIT');
  committed = true;
  console.log('Created local read-only MCP role, seven diagnostic views and a Windows DPAPI-protected connection.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  if (credentialWritten && !committed) unlinkSync(protectedConnectionFile);
  console.error(`PostgreSQL MCP provisioning failed (${error.code ?? 'validation'}); no credentials printed.`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
