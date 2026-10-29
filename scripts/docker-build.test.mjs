import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const bash =
  process.platform === "win32" ? "C:/Program Files/Git/bin/bash.exe" : "bash";

function buildFixture({ failure, failures = 2 }) {
  const dir = mkdtempSync(join(tmpdir(), "roomora-build-retry-"));
  try {
    const result = spawnSync(
      bash,
      [
        "--noprofile",
        "--norc",
        "-c",
        `
      set -euo pipefail
      docker() {
        printf '%s\\n' "$@" >> "$TEST_DIR/args"
        count="$(cat "$TEST_DIR/count" 2>/dev/null || printf 0)"
        count=$((count + 1))
        printf '%s' "$count" > "$TEST_DIR/count"
        if [[ "$count" -le "$TEST_FAILURES" ]]; then
          printf '%s\\n' "$TEST_FAILURE" >&2
          return 17
        fi
        printf 'Build succeeded\\n'
      }
      sleep() { printf '%s\\n' "$1" >> "$TEST_DIR/delays"; }
      export -f docker sleep
      bash scripts/docker-build.sh --target runtime -t fixture:test 'context with spaces'
    `,
      ],
      {
        cwd: fileURLToPath(new URL("../", import.meta.url)),
        env: {
          ...process.env,
          TEST_DIR: dir.replaceAll("\\", "/"),
          TEST_FAILURE: failure,
          TEST_FAILURES: String(failures),
        },
        encoding: "utf8",
        timeout: 15000,
      },
    );
    if (result.error) throw result.error;
    let delays = "";
    try {
      delays = readFileSync(join(dir, "delays"), "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    return {
      ...result,
      calls: Number(readFileSync(join(dir, "count"), "utf8")),
      args: readFileSync(join(dir, "args"), "utf8").trim().split("\n"),
      delays,
    };
  } finally {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir()));
    assert.match(basename(dir), /^roomora-build-retry-/);
    rmSync(dir, { recursive: true, force: true });
  }
}

const metadataFailure = (status) =>
  `ERROR: failed to solve: node:22-bookworm-slim: failed to resolve source metadata for docker.io/library/node:22-bookworm-slim: unexpected status from HEAD request to https://registry-1.docker.io/v2/library/node/manifests/22-bookworm-slim: ${status} registry error`;

test("temporary base-image registry errors recover with bounded backoff and preserve arguments", () => {
  for (const status of [500, 503, 429]) {
    const result = buildFixture({ failure: metadataFailure(status) });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.calls, 3);
    assert.equal(result.delays, "10\n20\n");
    assert.deepEqual(
      result.args,
      Array(3)
        .fill([
          "build",
          "--progress=plain",
          "--target",
          "runtime",
          "-t",
          "fixture:test",
          "context with spaces",
        ])
        .flat(),
    );
  }
});

test("a persistent registry outage fails after three attempts with the original exit code", () => {
  const result = buildFixture({ failure: metadataFailure(502), failures: 10 });
  assert.equal(result.status, 17);
  assert.equal(result.calls, 3);
  assert.equal(result.delays, "10\n20\n");
});

test("compiler, dependency-install, Dockerfile and registry-auth errors are not retried", () => {
  for (const failure of [
    'ERROR: process "npm run build" did not complete successfully: exit code: 1',
    "npm ERR! code E500: Internal Server Error fetching a dependency",
    "ERROR: failed to solve: failed to compute cache key: file missing",
    metadataFailure(401),
    metadataFailure(404),
  ]) {
    const result = buildFixture({ failure, failures: 10 });
    assert.equal(result.status, 17);
    assert.equal(result.calls, 1);
    assert.equal(result.delays, "");
  }
});

test("a successful build runs only once without sleeping", () => {
  const result = buildFixture({ failure: "unused", failures: 0 });
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls, 1);
  assert.equal(result.delays, "");
});
