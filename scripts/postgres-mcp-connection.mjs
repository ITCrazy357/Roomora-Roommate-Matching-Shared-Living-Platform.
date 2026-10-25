import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export const postgresMcpDirectory = join(homedir(), '.codex', 'tools', 'postgres-mcp');
export const protectedConnectionFile = join(postgresMcpDirectory, 'connection.dpapi');

function powershell(code, input) {
  if (process.platform !== 'win32') throw new Error('This credential store requires Windows DPAPI.');
  const executable = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  return execFileSync(executable, ['-NoProfile', '-NonInteractive', '-Command', code], {
    input, encoding: 'utf8', windowsHide: true, timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

export function savePostgresMcpConnection(dsn) {
  const encrypted = powershell(
    '$taskSecure = ConvertTo-SecureString -String ([Console]::In.ReadToEnd()) -AsPlainText -Force; ConvertFrom-SecureString -SecureString $taskSecure',
    dsn,
  );
  writeFileSync(protectedConnectionFile, encrypted, { flag: 'wx', mode: 0o600 });
}

export function readPostgresMcpConnection() {
  const dsn = powershell(
    '$taskSecure = ConvertTo-SecureString -String ([Console]::In.ReadToEnd()); [System.Net.NetworkCredential]::new("", $taskSecure).Password',
    readFileSync(protectedConnectionFile, 'utf8'),
  );
  const connection = new URL(dsn);
  if (connection.protocol !== 'postgresql:' || connection.hostname !== '127.0.0.1'
    || connection.port !== '5433' || connection.pathname !== '/roomora'
    || connection.username !== 'roomora_mcp_readonly') {
    throw new Error('PostgreSQL MCP is restricted to its dedicated role on the Roomora local database.');
  }
  return dsn;
}
