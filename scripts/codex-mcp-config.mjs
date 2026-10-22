import { execFileSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { delimiter, join } from 'node:path';

function isFile(path) {
  try { return statSync(path).isFile(); } catch { return false; }
}

function findCodexCli() {
  if (process.env.CODEX_CLI?.trim()) {
    const override = process.env.CODEX_CLI.trim();
    // Git Bash may supply an MSYS path to a native Windows Node process.
    return process.platform === 'win32'
      ? override.replace(/^\/([a-z])\//i, (_, drive) => `${drive.toUpperCase()}:/`)
      : override;
  }

  const executable = process.platform === 'win32' ? 'codex.exe' : 'codex';
  for (const directory of (process.env.PATH ?? '').split(delimiter).filter(Boolean)) {
    const candidate = join(directory.replace(/^"(.*)"$/, '$1'), executable);
    if (isFile(candidate)) return candidate;
  }

  // The VS Code extension bundles a native CLI without adding it to terminal PATH.
  if (process.platform === 'win32') {
    const platform = process.arch === 'arm64' ? 'windows-aarch64' : 'windows-x86_64';
    const candidates = [];
    for (const editor of ['.vscode', '.vscode-insiders']) {
      const extensions = join(homedir(), editor, 'extensions');
      let entries;
      try { entries = readdirSync(extensions, { withFileTypes: true }); } catch { continue; }
      for (const entry of entries) {
        if (!entry.isDirectory() || !entry.name.startsWith('openai.chatgpt-')) continue;
        const directory = join(extensions, entry.name);
        const path = join(directory, 'bin', platform, 'codex.exe');
        if (isFile(path)) candidates.push({ path, modified: statSync(directory).mtimeMs });
      }
    }
    candidates.sort((left, right) => right.modified - left.modified);
    if (candidates.length) return candidates[0].path;
  }

  throw new Error('Codex CLI was not found on PATH or in VS Code extensions. Set CODEX_CLI to the native Codex executable.');
}

export function readCodexMcpConfig(name) {
  const cli = findCodexCli();
  try {
    return JSON.parse(execFileSync(cli, [
      '--no-daemon', 'mcp', 'get', name, '--json',
    ], { encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }));
  } catch (error) {
    throw new Error(`Cannot read MCP server '${name}' with ${cli} (${error.code ?? error.status ?? 'invalid response'}). Check the Codex registration and CODEX_CLI.`);
  }
}
