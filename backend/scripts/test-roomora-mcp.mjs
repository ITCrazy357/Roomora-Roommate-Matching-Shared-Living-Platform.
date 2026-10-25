// Run HTTP/SDK tests against a fresh disposable local PostgreSQL database.
import { readFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';
import pg from 'pg';

process.chdir(fileURLToPath(new URL('..', import.meta.url)));
const local = existsSync('.env') ? parse(readFileSync('.env')) : {};
const adminUrl = new URL(
  process.env.MCP_TEST_DATABASE_URL || local.DATABASE_URL,
);
if (!['localhost', '127.0.0.1', '[::1]'].includes(adminUrl.hostname))
  throw new Error('Tests require a local PostgreSQL server.');
const name = `roomora_mcp_test_${randomBytes(6).toString('hex')}`;
const admin = new pg.Client({ connectionString: adminUrl.href });
await admin.connect();
const childUrl = new URL(adminUrl);
childUrl.pathname = `/${name}`;
const env = {};
for (const key of [
  'PATH',
  'Path',
  'SystemRoot',
  'SYSTEMROOT',
  'TEMP',
  'TMP',
  'USERPROFILE',
  'APPDATA',
  'LOCALAPPDATA',
  'COMSPEC',
])
  if (process.env[key]) env[key] = process.env[key];
Object.assign(env, {
  NODE_ENV: 'test',
  DATABASE_URL: childUrl.href,
  FRONTEND_ORIGIN: 'http://localhost:3000',
  MCP_ENABLED: 'true',
  MCP_PUBLIC_ORIGIN: 'http://localhost:5000',
  AUTH_OTP_SECRET: 'mcp-test-only-secret-with-at-least-32-characters',
  IDENTITY_DECLARATION_REQUIRED: 'true',
});
const run = (file, args) =>
  new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [file, ...args], {
      env,
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`Test command exited ${code}`)),
    );
  });
try {
  await admin.query(`CREATE DATABASE "${name}"`);
  await run('node_modules/prisma/build/index.js', ['migrate', 'deploy']);
  await run('node_modules/vitest/vitest.mjs', [
    'run',
    '--config',
    'vitest.config.e2e.ts',
    'test/roomora-mcp.e2e-spec.ts',
    'test/support-chat.e2e-spec.ts',
  ]);
} catch {
  process.exitCode = 1;
  console.error(
    'Roomora MCP verification failed. See sanitized assertions above.',
  );
} finally {
  await admin.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.end();
}
