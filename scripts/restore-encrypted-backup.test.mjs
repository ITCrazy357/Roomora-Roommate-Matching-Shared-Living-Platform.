import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readdir, unlink, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { Readable } from "node:stream";
import { encryptBackup } from "./backup-archive.mjs";
import { restoreEncryptedBackup } from "./restore-encrypted-backup.mjs";
import { coreSchemaReadinessQuery } from "../backend/src/database/schema-readiness.ts";

test("restore accepts a pre-migration backup without claiming the new release is ready", async () => {
  const directory = await mkdtemp(join(tmpdir(), "roomora-restore-policy-"));
  const archive = join(directory, "fixture.dump.enc");
  const key = randomBytes(32);
  await encryptBackup(
    Readable.from(Buffer.from("test-only dump; pg_restore is simulated")),
    archive,
    key,
  );
  try {
    for (const missingColumn of [false, true]) {
      const calls = [];
      const execute = async (_command, args) => {
        calls.push(args);
        if (!args.includes("psql")) return { stdout: "" };
        if (args.at(-1) === coreSchemaReadinessQuery) return { stdout: "t\n" };
        if (missingColumn) throw new Error("new release column is absent");
        return { stdout: "f\n" };
      };
      const result = await restoreEncryptedBackup(
        archive,
        {
          ROOMORA_BACKUP_KEY: key.toString("base64"),
          ROOMORA_POSTGRES_MAJOR: "18",
        },
        execute,
      );
      assert.deepEqual(result, {
        restored: true,
        coreSchemaReady: true,
        schemaReady: false,
        isolated: true,
      });
      assert.ok(calls.some((args) => args.includes("pg_restore")));
      assert.ok(calls.some((args) => args.includes("stop")));
    }
  } finally {
    for (const name of await readdir(directory))
      await unlink(join(directory, name));
    await rmdir(directory);
  }
});

test("a successfully imported archive without Roomora core tables is rejected", async () => {
  const directory = await mkdtemp(join(tmpdir(), "roomora-restore-policy-"));
  const archive = join(directory, "fixture.dump.enc");
  const key = randomBytes(32);
  await encryptBackup(
    Readable.from(Buffer.from("test-only wrong database")),
    archive,
    key,
  );
  try {
    const execute = async (_command, args) => ({
      stdout: args.includes("psql") ? "f\n" : "",
    });
    await assert.rejects(
      restoreEncryptedBackup(
        archive,
        { ROOMORA_BACKUP_KEY: key.toString("base64") },
        execute,
      ),
      /Not a Roomora database/,
    );
  } finally {
    for (const name of await readdir(directory))
      await unlink(join(directory, name));
    await rmdir(directory);
  }
});
