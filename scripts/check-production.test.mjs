import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { checkProduction, backupArtifactFresh } from "./check-production.mjs";

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
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({
        artifacts: [
          {
            name: "database-encrypted-expired",
            expired: true,
            size_in_bytes: 100,
            created_at: new Date().toISOString(),
          },
          {
            name: "report",
            expired: false,
            size_in_bytes: 100,
            created_at: new Date().toISOString(),
          },
          {
            name: "database-encrypted-old",
            expired: false,
            size_in_bytes: 100,
            created_at: new Date(Date.now() - 27 * 3600000).toISOString(),
          },
        ],
      }),
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
