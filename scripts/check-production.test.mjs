import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import {
  checkProduction,
  checkProductionWithRetries,
  backupArtifactFresh,
} from "./check-production.mjs";

const readyBody = {
  status: "ok",
  service: "roomora-api",
  database: "up",
  schema: "up",
  redis: "up",
};
const site = "https://site.example.test";
const api = "https://api.example.test";
function healthyResponse(url) {
  return new URL(url).pathname === "/"
    ? new Response("home", {
        headers: { "Content-Security-Policy": "script-src 'nonce-fixture'" },
      })
    : Response.json(readyBody);
}

test("request diagnostics distinguish timeout, network and invalid JSON without logging provider data", async () => {
  const original = globalThis.fetch;
  try {
    for (const [response, status, error] of [
      [
        () => {
          throw new DOMException("private timeout", "TimeoutError");
        },
        null,
        "TIMEOUT",
      ],
      [
        () => {
          throw new TypeError("private network details");
        },
        null,
        "NETWORK_ERROR",
      ],
      [
        () => new Response("private provider HTML", { status: 503 }),
        503,
        "INVALID_JSON",
      ],
    ]) {
      globalThis.fetch = async (url) =>
        new URL(url).pathname === "/" ? healthyResponse(url) : response();
      const result = await checkProduction({ site, api });
      assert.equal(result.healthy, false);
      for (const probe of [result.direct, result.proxy]) {
        assert.equal(probe.status, status);
        assert.equal(probe.error, error);
        assert.ok(probe.elapsedMs >= 0);
      }
      assert.equal(JSON.stringify(result).includes("private"), false);
    }
  } finally {
    globalThis.fetch = original;
  }
});

test("the timeout also bounds a stalled response body and keeps its HTTP status", async () => {
  const server = createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, {
        "Content-Security-Policy": "script-src 'nonce-fixture'",
      });
      res.end("home");
    } else {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.write('{"status":');
    }
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const result = await checkProduction({
      site: origin,
      api: origin,
      timeoutMs: 200,
    });
    assert.equal(result.healthy, false);
    assert.equal(result.home.status, 200);
    for (const probe of [result.direct, result.proxy]) {
      assert.equal(probe.status, 200);
      assert.equal(probe.error, "TIMEOUT");
    }
  } finally {
    server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
  }
});

test("retries allow recovery, record the failed attempts and stop immediately once healthy", async () => {
  const original = globalThis.fetch;
  let directCalls = 0;
  globalThis.fetch = async (url) => {
    if (new URL(url).origin === api && ++directCalls < 3)
      throw new DOMException("fixture", "TimeoutError");
    return healthyResponse(url);
  };
  try {
    const result = await checkProductionWithRetries({
      site,
      api,
      retryDelayMs: 0,
    });
    assert.equal(result.healthy, true);
    assert.equal(directCalls, 3);
    assert.equal(result.attempts.length, 3);
    assert.equal(result.attempts[0].direct.error, "TIMEOUT");
    assert.equal(result.attempts[1].healthy, false);
    assert.equal(result.attempts[2].healthy, true);
  } finally {
    globalThis.fetch = original;
  }
});

test("five unsuccessful attempts remain unhealthy; successes from different attempts are not combined", async () => {
  const original = globalThis.fetch;
  let attempt = 0;
  globalThis.fetch = async (url) => {
    const target = new URL(url);
    if (target.origin === api) attempt++;
    if (target.pathname !== "/") {
      const failing =
        target.origin === api ? attempt % 2 === 1 : attempt % 2 === 0;
      if (failing)
        return Response.json({ ...readyBody, schema: "down" }, { status: 503 });
    }
    return healthyResponse(url);
  };
  try {
    const result = await checkProductionWithRetries({
      site,
      api,
      retryDelayMs: 0,
    });
    assert.equal(result.healthy, false);
    assert.equal(result.attempts.length, 5);
    assert.equal(attempt, 5);
    assert.ok(result.attempts.every((x) => !x.healthy));
    assert.equal(result.direct.ready, false);
    assert.equal(result.proxy.ready, true);
  } finally {
    globalThis.fetch = original;
  }
});

test("a live process without the release schema is not deployment-ready", async () => {
  let schema = "up";
  const server = createServer((req, res) => {
    if (req.url === "/") {
      res.writeHead(200, {
        "Content-Security-Policy": "script-src 'nonce-fixture'",
      });
      res.end("home");
    } else {
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          status: "ok",
          service: "roomora-api",
          database: "up",
          schema,
          redis: "disabled",
        }),
      );
    }
  });
  await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    assert.equal(
      (await checkProduction({ site: origin, api: origin })).healthy,
      true,
    );
    schema = "down";
    assert.equal(
      (await checkProduction({ site: origin, api: origin })).healthy,
      false,
    );
    await assert.rejects(
      checkProduction({
        site: "https://user:private@example.test",
        api: origin,
      }),
    );
  } finally {
    await new Promise((ok) => server.close(ok));
  }
});

test("artifact freshness ignores expired, empty and unrelated uploads", async () => {
  const original = globalThis.fetch;
  const runs = [1, 2, 3, 4, 5].map((id) => ({
    id,
    status: "completed",
    conclusion: "success",
    head_branch: "main",
  }));
  const artifact = (id, options = {}) => ({
    name: `database-encrypted-${id}`,
    expired: false,
    size_in_bytes: 100,
    created_at: new Date().toISOString(),
    workflow_run: { id, head_branch: "main" },
    ...options,
  });
  globalThis.fetch = async (url) =>
    new Response(
      JSON.stringify(
        String(url).includes("/workflows/")
          ? { workflow_runs: runs }
          : {
              artifacts: [
                artifact(1, { expired: true }),
                artifact(2, { size_in_bytes: 0 }),
                artifact(3, { name: "report" }),
                artifact(4, { name: "database-encrypted-wrong-run-id" }),
                artifact(5, {
                  created_at: new Date(Date.now() - 27 * 3600000).toISOString(),
                }),
              ],
            },
      ),
      { status: 200 },
    );
  try {
    assert.equal(
      (
        await backupArtifactFresh({
          repository: "fixture/repo",
          token: "fixture-only",
        })
      ).backupArtifactFresh,
      false,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("retained files from failed, pending or unrelated runs cannot hide a stale successful backup", async () => {
  const original = globalThis.fetch;
  const runs = [
    { id: 1, status: "completed", conclusion: "success", head_branch: "main" },
    { id: 2, status: "completed", conclusion: "failure", head_branch: "main" },
    { id: 3, status: "in_progress", conclusion: null, head_branch: "main" },
    {
      id: 4,
      status: "completed",
      conclusion: "success",
      head_branch: "feature/test",
    },
  ];
  const ages = [27, 1, 0.5, 0.25, 0.1];
  const artifacts = ages.map((age, index) => ({
    name: `database-encrypted-${index + 1}`,
    expired: false,
    size_in_bytes: 100,
    created_at: new Date(Date.now() - age * 3600000).toISOString(),
    workflow_run: {
      id: index + 1,
      head_branch: index === 3 ? "feature/test" : "main",
    },
  }));
  const requests = [];
  globalThis.fetch = async (url) => {
    requests.push(String(url));
    return new Response(
      JSON.stringify(
        String(url).includes("/workflows/")
          ? { workflow_runs: runs }
          : { artifacts },
      ),
      { status: 200 },
    );
  };
  const settings = { repository: "fixture/repo", token: "fixture-only" };
  try {
    const stale = await backupArtifactFresh(settings);
    assert.equal(stale.backupArtifactFresh, false);
    assert.ok(stale.backupArtifactAgeHours >= 27);
    assert.ok(
      requests.some((url) =>
        url.endsWith(
          "/workflows/database-backup.yml/runs?branch=main&status=success&per_page=100",
        ),
      ),
    );
    // The very same recovery file becomes eligible only after its run succeeds.
    runs[1].conclusion = "success";
    const fresh = await backupArtifactFresh(settings);
    assert.equal(fresh.backupArtifactFresh, true);
    assert.ok(
      fresh.backupArtifactAgeHours >= 1 && fresh.backupArtifactAgeHours < 1.01,
    );
    artifacts[1].expired = true;
    assert.equal(
      (await backupArtifactFresh(settings)).backupArtifactFresh,
      false,
    );
  } finally {
    globalThis.fetch = original;
  }
});

test("backup metadata access failures fail closed", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response("private provider error", { status: 403 });
  try {
    await assert.rejects(
      backupArtifactFresh({
        repository: "fixture/repo",
        token: "fixture-only",
      }),
      {
        message: "Backup metadata lookup failed",
      },
    );
  } finally {
    globalThis.fetch = original;
  }
});
