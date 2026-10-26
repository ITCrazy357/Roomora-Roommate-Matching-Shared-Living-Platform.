import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, writeFile, rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { backupKey, encryptBackup, decryptBackup } from "./backup-archive.mjs";
import {
  backupConnection,
  inspectBackupConfiguration,
  classifyDumpFailure,
  backupTlsMount,
} from "./run-database-backup.mjs";

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

test("exports mount an explicit CA bundle read-only and fail closed when it is unavailable", async () => {
  const dir = await mkdtemp(join(tmpdir(), "roomora-backup-ca-"));
  const caFile = join(dir, "public-ca.crt");
  const url =
    "postgresql://fixture:fixture-only@dpg-fixture.render.com/roomora";
  try {
    await writeFile(caFile, "test-only CA fixture; no real connection is made");
    const connection = backupConnection(url);
    assert.deepEqual(await backupTlsMount(connection, caFile), [
      "--mount",
      `type=bind,source=${caFile},target=/run/roomora-backup-ca.crt,readonly`,
    ]);
    assert.equal(connection.PGSSLROOTCERT, "/run/roomora-backup-ca.crt");
    assert.equal(connection.PGSSLMODE, "verify-full");
    const defaultConnection = backupConnection(url);
    assert.deepEqual(await backupTlsMount(defaultConnection, undefined), []);
    assert.equal(defaultConnection.PGSSLROOTCERT, "system");
    const empty = join(dir, "empty.crt");
    await writeFile(empty, "");
    for (const bad of [
      "",
      "relative.crt",
      dir,
      empty,
      join(dir, "missing.crt"),
      `${caFile},readonly=false`,
    ]) {
      const rejectedConnection = backupConnection(url);
      await assert.rejects(backupTlsMount(rejectedConnection, bad), {
        backupCode: "BACKUP_CA_FILE_INVALID",
      });
      assert.equal(rejectedConnection.PGSSLROOTCERT, "system");
    }
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./run-database-backup.mjs", import.meta.url))],
      {
        env: {
          ...process.env,
          ROOMORA_BACKUP_KEY: Buffer.alloc(32, 7).toString("base64"),
          ROOMORA_BACKUP_DATABASE_URL: url,
          ROOMORA_BACKUP_CA_FILE: join(dir, "fixture-private-missing.crt"),
        },
        encoding: "utf8",
        windowsHide: true,
      },
    );
    assert.equal(result.status, 1);
    assert.deepEqual(JSON.parse(result.stderr), {
      completed: false,
      error: "BACKUP_CA_FILE_INVALID",
    });
    assert.equal(result.stdout, "");
  } finally {
    const target = resolve(dir);
    assert.ok(
      target.startsWith(`${resolve(tmpdir())}${sep}roomora-backup-ca-`),
    );
    await rm(target, { recursive: true, force: true });
  }
});

test("preflight explains bad or missing settings without printing any secret values", () => {
  const key = Buffer.alloc(32, 7).toString("base64");
  const url =
    "postgresql://fixture-user:fixture-private-password@dpg-fixture.singapore-postgres.render.com/roomora";
  assert.deepEqual(
    inspectBackupConfiguration({
      ROOMORA_BACKUP_KEY: `\n${key}\n`,
      ROOMORA_BACKUP_DATABASE_URL: url,
    }),
    { configured: true, issues: [], postgresMajor: "18" },
  );
  assert.deepEqual(inspectBackupConfiguration({}).issues, [
    "BACKUP_KEY_MISSING",
    "BACKUP_DATABASE_URL_MISSING",
  ]);
  assert.deepEqual(
    inspectBackupConfiguration({
      ROOMORA_BACKUP_KEY: key,
      ROOMORA_BACKUP_DATABASE_URL:
        "postgresql://fixture:fixture-only@dpg-internal-a/roomora",
    }).issues,
    ["BACKUP_DATABASE_URL_USE_EXTERNAL"],
  );
  const result = spawnSync(
    process.execPath,
    [
      fileURLToPath(new URL("./run-database-backup.mjs", import.meta.url)),
      "--check-config",
    ],
    {
      env: {
        ...process.env,
        ROOMORA_BACKUP_KEY: "fixture-private-invalid-key",
        ROOMORA_BACKUP_DATABASE_URL:
          "postgresql://fixture:fixture-private-password@unexpected.example/roomora",
        ROOMORA_POSTGRES_MAJOR: "18",
      },
      encoding: "utf8",
      windowsHide: true,
    },
  );
  assert.equal(result.status, 1);
  const report = JSON.parse(result.stderr);
  assert.deepEqual(report.issues, [
    "BACKUP_KEY_INVALID_BASE64_32_BYTES",
    "BACKUP_DATABASE_URL_NOT_RENDER",
  ]);
  for (const forbidden of [
    "fixture-private-invalid-key",
    "fixture-private-password",
    "unexpected.example",
  ])
    assert.equal(result.stderr.includes(forbidden), false);
  assert.equal(result.stdout, "");
});

test("pg_dump errors produce only actionable fixed codes, including a safe unknown fallback", () => {
  const cases = [
    [
      'password authentication failed for user "fixture-private"',
      "DATABASE_AUTHENTICATION_FAILED",
    ],
    [
      "root certificate file not found for fixture-private host",
      "DATABASE_TLS_VERIFICATION_FAILED",
    ],
    [
      "no pg_hba.conf entry for host fixture-private",
      "DATABASE_NETWORK_ACCESS_DENIED",
    ],
    ["connection timed out at fixture-private", "DATABASE_CONNECTION_FAILED"],
    ["aborting because of server version mismatch", "PG_DUMP_VERSION_MISMATCH"],
    [
      "permission denied for table fixture_private",
      "DATABASE_READ_PERMISSION_DENIED",
    ],
    ["Cannot connect to the Docker daemon", "DOCKER_ENGINE_UNAVAILABLE"],
    ["manifest unknown", "POSTGRES_IMAGE_PULL_FAILED"],
    ["unexpected error: fixture-private-details", "PG_DUMP_FAILED"],
  ];
  for (const [stderr, code] of cases)
    assert.equal(classifyDumpFailure(stderr), code);
});
