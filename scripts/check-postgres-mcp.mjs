import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCodexMcpConfig } from './codex-mcp-config.mjs';
import { postgresMcpDirectory, protectedConnectionFile, readPostgresMcpConnection } from './postgres-mcp-connection.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, '.verification', 'postgres-mcp');
await mkdir(output, { recursive: true });
const requireSdk = createRequire(join(process.env.ROOMORA_MCP_TOOLS_DIR
  ?? join(homedir(), '.codex', 'tools', 'playwright-mcp'), 'package.json'));
const requirePg = createRequire(join(postgresMcpDirectory, 'package.json'));
const { Client: McpClient } = requireSdk('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = requireSdk('@modelcontextprotocol/sdk/client/stdio.js');
const { Client: PgClient } = requirePg('pg');
const report = { checkedAt: new Date().toISOString(), scope: 'Local PostgreSQL and actual MCP. No production or application HTTP verification.', checks: [] };
const pass = name => { report.checks.push(name); console.log(`PASS ${name}`); };
let client;
let database;

try {
  const config = readCodexMcpConfig('postgres');
  assert.equal(config.enabled, true);
  assert.equal(config.transport.type, 'stdio');
  assert.ok(!JSON.stringify(config).includes('postgresql://'), 'Do not store the connection URL in Codex config.');
  assert.ok(!readFileSync(protectedConnectionFile, 'utf8').includes('postgresql://'), 'The saved connection must be DPAPI encrypted.');
  database = new PgClient({ connectionString: readPostgresMcpConnection(), connectionTimeoutMillis: 5000 });
  await database.connect();
  pass('DPAPI credential opens the dedicated local database connection');

  const identity = (await database.query(`SELECT current_user AS role, current_database() AS database,
    current_setting('default_transaction_read_only') AS readonly,
    current_setting('statement_timeout') AS timeout`)).rows[0];
  assert.equal(identity.role, 'roomora_mcp_readonly');
  assert.equal(identity.database, 'roomora');
  assert.equal(identity.readonly, 'on');
  assert.equal(identity.timeout, '5s');
  report.connection = identity;
  const role = (await database.query(`SELECT rolsuper, rolcreaterole, rolcreatedb, rolreplication, rolbypassrls, rolinherit
    FROM pg_roles WHERE rolname = current_user`)).rows[0];
  assert.ok(Object.values(role).every(value => value === false), 'The MCP role must have no elevated attributes.');
  const memberships = (await database.query(`SELECT count(*)::int AS count FROM pg_auth_members
    WHERE member = (SELECT oid FROM pg_roles WHERE rolname = current_user)`)).rows[0].count;
  assert.equal(memberships, 0, 'The role must not inherit or switch to another role.');
  const grants = (await database.query(`SELECT count(*)::int AS count FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
      AND has_table_privilege(current_user, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')`)).rows[0].count;
  assert.equal(grants, 0, 'Raw application tables must not be granted.');
  pass('Role has no elevated attributes, memberships or direct application-table privileges');

  for (const table of ['users', 'sessions', 'auth_tokens', 'identity_declarations', 'messages', 'service_payment_events']) {
    await assert.rejects(database.query(`SELECT * FROM public.${table} LIMIT 0`), error => error.code === '42501');
  }
  pass('PostgreSQL denies direct reads of authentication, identity, chat and provider tables');

  // Explicit READ WRITE bypasses the default setting: grants must still stop writes.
  // WHERE false and rollback make these probes harmless even under bad grants.
  for (const sql of [
    'UPDATE public.expenses SET amount = amount WHERE false',
    'DELETE FROM public.sessions WHERE false',
    'CREATE TABLE mcp_inspect.__mcp_permission_probe (id integer)',
  ]) {
    await database.query('BEGIN READ WRITE');
    try { await assert.rejects(database.query(sql), error => error.code === '42501'); }
    finally { await database.query('ROLLBACK'); }
  }
  pass('Database grants deny UPDATE, DELETE and CREATE even in READ WRITE transactions');

  const transport = new StdioClientTransport({ ...config.transport, cwd: root, stderr: 'pipe' });
  transport.stderr?.on('data', () => {});
  client = new McpClient({ name: 'roomora-postgres-smoke', version: '1.0.0' });
  await client.connect(transport, { timeout: 30000 });
  const version = client.getServerVersion();
  report.server = { name: version.name, version: version.version };
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map(tool => tool.name).sort(), ['execute_sql', 'search_objects']);
  assert.ok(tools.every(tool => tool.annotations?.readOnlyHint === true));
  await writeFile(join(output, 'capabilities.json'), JSON.stringify(tools.map(({ name, inputSchema, annotations }) => ({
    name, inputSchema, annotations,
  })), null, 2) + '\n');
  pass('MCP initializes and exposes exactly two read-only tools');

  const call = async (name, args) => {
    const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 30000 });
    const body = result.structuredContent ?? JSON.parse(result.content.filter(item => item.type === 'text').map(item => item.text).join('\n'));
    return { result, body };
  };
  const sql = async query => {
    const { result, body } = await call('execute_sql', { sql: query });
    assert.ok(!result.isError && body.success === true, 'Expected a successful diagnostic SQL query.');
    return body.data.statements[0];
  };
  const mcpIdentity = (await sql(`SELECT current_user AS role, current_database() AS database,
    current_setting('transaction_read_only') AS readonly`)).rows[0];
  assert.equal(mcpIdentity.role, identity.role);
  assert.equal(mcpIdentity.database, identity.database);
  assert.equal(mcpIdentity.readonly, 'on');
  pass('MCP queries use the dedicated role and a read-only transaction');

  const discovery = await call('search_objects', { object_type: 'view', schema: 'mcp_inspect', detail_level: 'names', limit: 20 });
  assert.ok(!discovery.result.isError && discovery.body.success === true);
  const views = (await sql(`SELECT table_name FROM information_schema.views WHERE table_schema = 'mcp_inspect' ORDER BY table_name`)).rows;
  assert.equal(views.length, 7);
  report.views = views.map(view => view.table_name);
  for (const name of report.views) await sql(`SELECT * FROM mcp_inspect.${name} LIMIT 1`);
  report.tableCount = (await sql('SELECT count(*)::int AS total FROM mcp_inspect.table_inventory')).rows[0].total;
  assert.ok(report.tableCount > 0);
  pass('MCP discovers and reads all seven metadata, migration and aggregate views');

  const limited = await sql('SELECT n FROM generate_series(1, 105) AS n');
  assert.equal(limited.rows.length, 100);
  assert.equal(limited.truncated, true);
  pass('SQL results are capped at 100 rows and report truncation');

  for (const query of [
    'SELECT password_hash FROM public.users LIMIT 0',
    'UPDATE public.expenses SET amount = amount WHERE false',
    'SELECT 1; DELETE FROM public.sessions WHERE false',
  ]) {
    const { result, body } = await call('execute_sql', { sql: query });
    assert.ok(result.isError || body.success === false, 'MCP must reject private reads and writes.');
  }
  pass('MCP rejects private reads, writes and a multi-statement write attempt');

  const timeout = await call('execute_sql', { sql: 'SELECT pg_sleep(6)' });
  assert.ok((timeout.result.isError || timeout.body.success === false)
    && JSON.stringify(timeout.body).includes('statement timeout'), 'Expected PostgreSQL statement timeout.');
  await sql('SELECT 1 AS recovered');
  pass('Five-second server timeout cancels a slow query and the connection remains usable');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  // Preserve assertion diagnostics, but never serialize raw driver/DPAPI errors.
  report.error = error instanceof assert.AssertionError ? error.message : `${error.name} (${error.code ?? 'connection/configuration'})`;
  console.error(report.error);
  process.exitCode = 1;
} finally {
  await client?.close().catch(() => {});
  await database?.end().catch(() => {});
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${join(output, 'report.json')}`);
}
