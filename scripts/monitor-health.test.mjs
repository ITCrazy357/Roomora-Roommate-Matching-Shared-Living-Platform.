import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:http";
import { mkdtemp, writeFile, unlink, rmdir, utimes } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkDeployment } from "./monitor-health.mjs";

test("readiness and completed backup age determine health independently", async () => {
  const directory = await mkdtemp(join(tmpdir(), "roomora-monitor-"));
  const backup = join(directory, "fixture.dump");
  let status = 200;
  let body = JSON.stringify({
    status: "ok",
    service: "roomora-api",
    database: "up",
    schema: "up",
    redis: "disabled",
  });
  const server = createServer((_req, res) => {
    res.writeHead(status);
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/v1/health/ready`;
  try {
    await writeFile(backup, "test-only-backup");
    let report = await checkDeployment({ url, backupDirectory: directory });
    assert.equal(report.ready, true);
    assert.equal(report.backupFresh, false); // No completion checksum yet.
    await writeFile(`${backup}.sha256`, "a".repeat(64));
    report = await checkDeployment({ url, backupDirectory: directory });
    assert.equal(report.backupFresh, true);
    body = JSON.stringify({
      status: "ok",
      service: "roomora-api",
      database: "up",
      schema: "down",
      redis: "disabled",
    });
    assert.equal(
      (await checkDeployment({ url, backupDirectory: directory })).ready,
      false,
    );
    body = "<html>proxy fallback</html>";
    assert.equal(
      (await checkDeployment({ url, backupDirectory: directory })).ready,
      false,
    );
    body = JSON.stringify({
      status: "ok",
      service: "roomora-api",
      database: "up",
      redis: "down",
    });
    assert.equal(
      (await checkDeployment({ url, backupDirectory: directory })).ready,
      false,
    );
    status = 503;
    assert.equal(
      (await checkDeployment({ url, backupDirectory: directory })).ready,
      false,
    );
    const old = new Date(Date.now() - 25 * 3600000);
    await utimes(backup, old, old);
    assert.equal(
      (await checkDeployment({ url, backupDirectory: directory })).backupFresh,
      false,
    );
    await assert.rejects(
      checkDeployment({
        url: "http://example.test/api/v1/health/ready",
        backupDirectory: directory,
      }),
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await unlink(backup);
    await unlink(`${backup}.sha256`);
    await rmdir(directory);
  }
});
