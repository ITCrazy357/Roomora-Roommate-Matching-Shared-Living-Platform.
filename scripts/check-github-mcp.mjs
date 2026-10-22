import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCodexMcpConfig } from './codex-mcp-config.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = join(root, '.verification', 'github-mcp');
await mkdir(output, { recursive: true });
const sdkDir = process.env.ROOMORA_MCP_TOOLS_DIR ?? join(homedir(), '.codex', 'tools', 'playwright-mcp');
const requireTool = createRequire(join(sdkDir, 'package.json'));
const { Client } = requireTool('@modelcontextprotocol/sdk/client/index.js');
const { StdioClientTransport } = requireTool('@modelcontextprotocol/sdk/client/stdio.js');
const remote = new URL(execFileSync('git', ['remote', 'get-url', 'origin'], { cwd: root, encoding: 'utf8' }).trim());
assert.equal(remote.hostname, 'github.com');
const [owner, repo] = remote.pathname.replace(/^\//, '').replace(/\.git$/, '').split('/');
assert.ok(owner && repo);
const config = readCodexMcpConfig('github');
assert.equal(config.enabled, true);
assert.equal(config.transport.type, 'stdio');
assert.ok(!Object.keys(config.transport.env ?? {}).some(key => /TOKEN|PASSWORD|SECRET/i.test(key)),
  'The MCP registration must not store credentials.');

const client = new Client({ name: 'roomora-github-smoke', version: '1.0.0' });
const transport = new StdioClientTransport({ ...config.transport, cwd: root, stderr: 'pipe' });
// Consume server diagnostics without persisting potential credential-provider output.
transport.stderr?.on('data', () => {});
const report = {
  checkedAt: new Date().toISOString(),
  repository: `${owner}/${repo}`,
  scope: 'Live GitHub MCP reads only; no PR, issue, workflow or repository mutation.',
  checks: [],
};
const pass = name => { report.checks.push(name); console.log(`PASS ${name}`); };
const call = async (name, args) => {
  const result = await client.callTool({ name, arguments: args }, undefined, { timeout: 60000 });
  if (result.isError) throw new Error(`GitHub MCP tool ${name} failed; check account access and scopes.`);
  if (result.structuredContent) return result.structuredContent;
  const text = result.content.filter(item => item.type === 'text').map(item => item.text).join('\n');
  try { return JSON.parse(text); } catch { return { text }; }
};

try {
  await client.connect(transport, { timeout: 30000 });
  const version = client.getServerVersion();
  report.server = { name: version.name, version: version.version };
  pass('MCP initialize and capability negotiation');
  const { tools } = await client.listTools();
  await writeFile(join(output, 'capabilities.json'), JSON.stringify(tools.map(({ name, inputSchema, annotations }) => ({
    name, inputSchema, annotations,
  })), null, 2) + '\n');
  report.toolNames = tools.map(tool => tool.name);
  const unsafe = tools.filter(tool => tool.annotations?.readOnlyHint !== true);
  assert.deepEqual(unsafe.map(tool => tool.name), [], 'Server must expose only tools annotated read-only.');
  for (const name of ['get_me', 'get_file_contents', 'list_pull_requests', 'actions_list', 'get_job_logs']) {
    assert.ok(report.toolNames.includes(name), `Missing tool ${name}. Available: ${report.toolNames.join(', ')}`);
  }
  pass(`tools/list exposes ${tools.length} read-only tools, including PR and Actions`);

  const me = await call('get_me', {});
  assert.equal(me.login, config.transport.env.GITHUB_MCP_USERNAME);
  report.authenticatedLogin = me.login;
  pass('Stored GitHub credential authenticates the configured account');

  await call('get_file_contents', { owner, repo, path: '.github/workflows/ci.yml' });
  pass('Reads the Roomora CI workflow from the real repository');

  const prs = await call('list_pull_requests', { owner, repo, state: 'all', perPage: 5 });
  assert.ok(Array.isArray(prs), 'GitHub must return a pull request list.');
  report.pullRequestResponse = { count: prs.length };
  pass('Lists Roomora pull requests from GitHub');

  const runs = await call('actions_list', { owner, repo, method: 'list_workflow_runs', perPage: 3 });
  // Save only a small summary; never copy CI log bodies or file contents into reports.
  report.workflowResponseKeys = Object.keys(runs);
  const workflowRuns = runs.workflow_runs ?? runs.workflowRuns ?? runs.runs;
  assert.ok(Array.isArray(workflowRuns), 'Actions must return a workflow run list.');
  report.recentRuns = workflowRuns.map(run => ({
    id: run.id, name: run.name, status: run.status, conclusion: run.conclusion,
    headSha: run.head_sha, htmlUrl: run.html_url,
  }));
  pass('Lists recent Roomora Actions runs from GitHub');
  const completed = workflowRuns.find(run => run.name === 'Roomora CI' && run.status === 'completed')
    ?? workflowRuns.find(run => run.status === 'completed');
  if (completed) {
    const jobs = await call('actions_list', {
      owner, repo, method: 'list_workflow_jobs', resource_id: String(completed.id), perPage: 3,
    });
    // GitHub MCP 2.0.3 wraps the GitHub jobs response in its own `jobs` field.
    const jobList = Array.isArray(jobs.jobs) ? jobs.jobs : jobs.jobs?.jobs;
    assert.ok(Array.isArray(jobList), 'Actions must return a workflow job list.');
    const job = jobList.find(item => item.status === 'completed');
    assert.ok(job, 'Expected a completed CI job to check log access.');
    const logs = await call('get_job_logs', { owner, repo, job_id: job.id, return_content: true, tail_lines: 3 });
    assert.ok(JSON.stringify(logs).length > 2, 'Job log response is empty.');
    report.logCheck = { runId: completed.id, jobId: job.id, jobName: job.name, contentPersisted: false };
    pass('Reads a completed CI job log without persisting its content');
  } else {
    report.logCheck = { status: 'not-exercised', reason: 'No completed run in the latest three runs.' };
  }
  report.status = 'passed';
} catch (error) {
  report.status = 'failed';
  report.error = error.message;
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await client.close();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(`Report: ${join(output, 'report.json')}`);
}
