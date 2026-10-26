import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { backupKey, encryptBackup, decryptBackup } from "./backup-archive.mjs";
import { backupConnection } from "./run-database-backup.mjs";

test("encrypted backups authenticate content and never publish failed plaintext", async () => {
  const dir = await mkdtemp(join(tmpdir(), "roomora-backup-"));
  const key = backupKey(Buffer.alloc(32, 7).toString("base64"));
  const archive = join(dir, "fixture.dump.enc");
  const output = join(dir, "restored.dump");
  const payload = Buffer.from("fixture database content ".repeat(10000));
  try {
    await encryptBackup(Readable.from(payload), archive, key);
    assert.equal(
      (await readFile(archive)).includes(payload.subarray(0, 50)),
      false,
    );
    await decryptBackup(archive, output, key);
    assert.deepEqual(await readFile(output), payload);
    await assert.rejects(decryptBackup(archive, output, key)); // No overwrite.
    await assert.rejects(
      decryptBackup(archive, join(dir, "wrong-key"), Buffer.alloc(32, 8)),
    );
    const damaged = await readFile(archive);
    damaged[50] ^= 1;
    const bad = join(dir, "damaged.enc");
    await writeFile(bad, damaged);
    await assert.rejects(decryptBackup(bad, join(dir, "tampered"), key));
    await assert.rejects(
      encryptBackup(
        (async function* () {
          yield payload;
          throw new Error("dump failed");
        })(),
        join(dir, "failed.enc"),
        key,
      ),
    );
    const names = await readdir(dir);
    assert.equal(
      names.some((x) => /partial|wrong-key|tampered|failed/.test(x)),
      false,
    );
    assert.throws(() => backupKey("bad"));
  } finally {
    const target = resolve(dir);
    assert.equal(
      target.startsWith(`${resolve(tmpdir())}${sep}roomora-backup-`),
      true,
    );
    await rm(target, { recursive: true, force: true });
  }
});

test("Render export requires TLS, bounded client versions and private credential env", () => {
  const cfg = backupConnection(
    "postgresql://fixture:fixture-only@dpg-example.oregon-postgres.render.com/roomora",
  );
  assert.equal(cfg.PGSSLMODE, "verify-full");
  assert.equal(cfg.image, "postgres:18");
  assert.throws(() =>
    backupConnection("postgresql://fixture:fixture-only@example.com/roomora"),
  );
  assert.throws(() =>
    backupConnection(
      "postgresql://fixture:fixture-only@dpg-example.render.com/roomora",
      "17;command",
    ),
  );
});
