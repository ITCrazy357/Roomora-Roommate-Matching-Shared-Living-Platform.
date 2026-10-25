import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { postgresMcpDirectory, readPostgresMcpConnection } from './postgres-mcp-connection.mjs';

let dsn;
try {
  dsn = readPostgresMcpConnection();
} catch {
  console.error('PostgreSQL MCP connection is unavailable. Run setup-postgres-mcp.mjs as the configured Windows user.');
  process.exit(1);
}
const server = spawn(process.execPath, [
  join(postgresMcpDirectory, 'node_modules', '@bytebase', 'dbhub', 'dist', 'index.js'),
  '--transport', 'stdio', '--config', join(postgresMcpDirectory, 'dbhub.toml'),
], {
  cwd: postgresMcpDirectory,
  stdio: ['inherit', 'inherit', 'pipe'],
  windowsHide: true,
  env: { ...process.env, ROOMORA_MCP_DSN: dsn },
});
dsn = undefined;
// DBHub diagnostics may include database details. Keep its protocol output only.
server.stderr.resume();
server.on('error', () => {
  console.error('Could not start the installed PostgreSQL MCP server.');
  process.exitCode = 1;
});
server.on('exit', code => {
  if (code) console.error('PostgreSQL MCP stopped. Check local Docker/PostgreSQL and the installed DBHub configuration.');
  process.exitCode = code ?? 1;
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.kill(signal));
