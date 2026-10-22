import { execFileSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { isAbsolute } from 'node:path';

// Install a copy in the user's Codex tools directory; stdout belongs to MCP.
const binary = process.env.GITHUB_MCP_BINARY;
const username = process.env.GITHUB_MCP_USERNAME;
if (!binary || !isAbsolute(binary) || !existsSync(binary) || !username || /[\r\n]/.test(username)) {
  console.error('GitHub MCP requires GITHUB_MCP_BINARY and GITHUB_MCP_USERNAME.');
  process.exit(1);
}

let accessToken;
try {
  const credentials = execFileSync(process.platform === 'win32' ? 'git.exe' : 'git', [
    '-c', 'credential.interactive=never', 'credential', 'fill',
  ], {
    input: `protocol=https\nhost=github.com\nusername=${username}\n\n`,
    encoding: 'utf8',
    timeout: 15000,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'Never' },
  });
  accessToken = credentials.split(/\r?\n/).find(line => line.startsWith('password='))?.slice(9);
  if (!accessToken) throw new Error('No credential');
} catch {
  // Credential-manager errors can contain sensitive output. Do not echo them.
  console.error('GitHub credential is unavailable. Sign in to GitHub with Git Credential Manager, then retry.');
  process.exit(1);
}

const server = spawn(binary, [
  'stdio', '--gh-host=https://github.com', '--read-only', '--toolsets=repos,pull_requests,actions', '--tools=get_me',
], {
  stdio: 'inherit',
  windowsHide: true,
  env: { ...process.env, GITHUB_PERSONAL_ACCESS_TOKEN: accessToken },
});
accessToken = undefined;

server.on('error', () => {
  console.error('Could not start the installed GitHub MCP binary.');
  process.exitCode = 1;
});
server.on('exit', code => { process.exitCode = code ?? 1; });
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.kill(signal));
}
