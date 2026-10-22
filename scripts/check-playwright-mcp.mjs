import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCodexMcpConfig } from './codex-mcp-config.mjs';

// Exercise the registered server through MCP; no application dependency is added.
const root = fileURLToPath(new URL('../', import.meta.url));
const base = new URL(process.argv[2] ?? 'http://127.0.0.1:3006');
assert.ok(
  base.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(base.hostname),
  'This smoke check only accepts a local HTTP frontend.',
);
const output = join(root, '.verification', 'playwright-mcp');
await mkdir(output, { recursive: true });

const tooling = process.env.ROOMORA_MCP_TOOLS_DIR ?? join(homedir(), '.codex', 'tools', 'playwright-mcp');
const requireTool = createRequire(join(tooling, 'package.json'));
const { Client } = requireTool('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = requireTool('@modelcontextprotocol/sdk/client/stdio.js');
const config = readCodexMcpConfig('playwright');
assert.equal(config.enabled, true, 'Playwright MCP must be enabled in Codex.');
assert.equal(config.transport.type, 'stdio');
assert.ok(config.transport.args.includes('--isolated'), 'Use a separate browser session.');
assert.ok(config.transport.args.includes('--headless'), 'This check runs without a visible window.');

const transport = new StdioClientTransport({ ...config.transport, cwd: root, stderr: 'pipe' });
const client = new Client({ name: 'roomora-playwright-smoke', version: '1.0.0' });
const report = {
  checkedAt: new Date().toISOString(),
  frontend: base.origin,
  scope: 'Local frontend with guest API fixtures; no backend, database, provider or production verification.',
  checks: [],
};
let stderr = '';
transport.stderr?.on('data', chunk => { stderr = (stderr + chunk).slice(-6000); });
const pass = name => { report.checks.push(name); console.log(`PASS ${name}`); };
const call = async (name, args = {}) => {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 90000 });
  const text = result.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
  if (result.isError) throw new Error(`${name}: ${text}`);
  return text;
};

try {
  await client.connect(transport, { timeout: 30000 });
  report.server = client.getServerVersion();
  pass('MCP initialize and capability negotiation');
  const { tools } = await client.listTools();
  report.toolNames = tools.map(tool => tool.name);
  const runCodeTool = report.toolNames.includes('browser_run_code') ? 'browser_run_code' : 'browser_run_code_unsafe';
  for (const name of ['browser_navigate', runCodeTool, 'browser_snapshot', 'browser_close']) {
    assert.ok(tools.some(tool => tool.name === name), `Missing MCP tool: ${name}. Available: ${report.toolNames.join(', ')}`);
  }
  report.toolCount = tools.length;
  pass('MCP tools/list exposes browser tools');

  // Keep this check independent of credentials, live data, paid AI and payments.
  await call(runCodeTool, { code: `async (page) => {
    const state = { apiRequests: 0, mutations: 0, pageErrors: [], unexpectedApiPaths: [] };
    page.__roomoraMcpSmoke = state;
    page.on('pageerror', error => state.pageErrors.push(error.message));
    await page.context().route('**/api/v1/**', async route => {
      const request = route.request();
      const path = new URL(request.url()).pathname;
      state.apiRequests++;
      const headers = {
        'access-control-allow-origin': ${JSON.stringify(base.origin)},
        'access-control-allow-credentials': 'true',
        'access-control-allow-methods': 'GET, OPTIONS',
        'access-control-allow-headers': 'Content-Type, Accept',
      };
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers });
      if (request.method() !== 'GET') {
        state.mutations++;
        return route.abort('blockedbyclient');
      }
      let status = 200;
      let body;
      if (path === '/api/v1/auth/me') { status = 401; body = { code: 'UNAUTHENTICATED' }; }
      else if (path === '/api/v1/auth/config') body = { googleEnabled: false };
      else if (path === '/api/v1/listings') body = { items: [], total: 0, page: 1, limit: 3, pages: 0 };
      else if (path === '/api/v1/system/announcements') body = { items: [], serverTime: new Date().toISOString() };
      else { state.unexpectedApiPaths.push(path); return route.abort('blockedbyclient'); }
      return route.fulfill({ status, headers, contentType: 'application/json', body: JSON.stringify(body) });
    });
    return 'Guest fixtures installed; API mutations blocked.';
  }` });

  await call('browser_navigate', { url: base.origin });
  const snapshot = await call('browser_snapshot');
  assert.ok(snapshot.includes('Tìm chỗ ở.'), 'Roomora home heading is missing.');
  await writeFile(join(output, 'home-snapshot.md'), snapshot);
  pass('MCP opens Roomora and reads its accessibility snapshot');

  const uiResult = await call(runCodeTool, { code: `async (page) => {
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.getByRole('heading', { level: 1 }).waitFor();
    await page.screenshot({ path: ${JSON.stringify(join(output, 'home-desktop.png'))}, fullPage: true });
    await page.getByRole('banner').getByRole('link', { name: 'Đăng nhập', exact: true }).click();
    await page.waitForURL('**/dang-nhap');
    await page.getByLabel('Email', { exact: true }).fill('mcp-smoke@example.invalid');
    const password = page.getByLabel('Mật khẩu', { exact: true });
    await password.fill('Synthetic-smoke-value');
    if (await password.getAttribute('type') !== 'password') throw new Error('Password should start hidden.');
    await page.getByRole('button', { name: 'Hiện mật khẩu: Mật khẩu', exact: true }).click();
    if (await password.getAttribute('type') !== 'text') throw new Error('Password reveal failed.');
    await page.getByRole('button', { name: 'Ẩn mật khẩu: Mật khẩu', exact: true }).click();
    if (await password.getAttribute('type') !== 'password') throw new Error('Password hide failed.');
    const checkedWidths = [];
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.screenshot({ path: ${JSON.stringify(output)} + '/login-' + width + '.png', fullPage: true });
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
      if (overflow) throw new Error('Horizontal overflow at width ' + width);
      checkedWidths.push(width);
    }
    if (page.__roomoraMcpSmoke.mutations !== 0) throw new Error('Unexpected API mutation attempted.');
    if (page.__roomoraMcpSmoke.pageErrors.length) throw new Error('Browser page errors: ' + page.__roomoraMcpSmoke.pageErrors.join('; '));
    if (page.__roomoraMcpSmoke.unexpectedApiPaths.length) throw new Error('Unexpected API paths: ' + page.__roomoraMcpSmoke.unexpectedApiPaths.join('; '));
    if (!page.__roomoraMcpSmoke.apiRequests) throw new Error('No API fixture was exercised; verify the frontend API URL.');
    return { loginNavigation: true, inputAndPasswordToggle: true, checkedWidths, ...page.__roomoraMcpSmoke };
  }` });
  await writeFile(join(output, 'ui-result.md'), uiResult);
  pass('MCP navigates to login, fills inputs and toggles password visibility');
  pass('Login layout has no horizontal overflow at 1440px and 390px');
  pass('No page errors or API mutations during the fixture check');
  await call('browser_close');
  pass('MCP closes the isolated browser');
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  if (stderr) report.serverStderr = stderr;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.close();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${join(output, 'report.json')}`);
}
