import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID, createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { backupKey, decryptBackup } from "./backup-archive.mjs";
import {
  coreSchemaReadinessQuery,
  schemaReadinessQuery,
} from "../backend/src/database/schema-readiness.ts";

const exec = promisify(execFile);
export async function restoreEncryptedBackup(
  archive,
  env = process.env,
  execute = exec,
) {
  const key = backupKey(env.ROOMORA_BACKUP_KEY);
  const major = env.ROOMORA_POSTGRES_MAJOR || "18";
  if (!/^(17|18)$/.test(major)) throw new Error("Invalid client version");
  const expected = (await readFile(`${archive}.sha256`, "utf8")).trim();
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(archive)) digest.update(chunk);
  if (
    !/^[a-f0-9]{64}$/i.test(expected) ||
    digest.digest("hex") !== expected.toLowerCase()
  )
    throw new Error("Checksum failed");
  const root = resolve(env.RUNNER_TEMP || tmpdir());
  const directory = await mkdtemp(join(root, "roomora-restore-"));
  const container = `roomora-restore-${randomUUID()}`;
  const dump = join(directory, "restored.dump");
  let started = false;
  const docker = (args, timeout = 60000) =>
    execute("docker", args, {
      timeout,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
  try {
    await decryptBackup(archive, dump, key);
    await docker([
      "run",
      "--detach",
      "--rm",
      "--network",
      "none",
      "--name",
      container,
      "--env",
      "POSTGRES_HOST_AUTH_METHOD=trust",
      `postgres:${major}`,
    ]);
    started = true;
    let ready = false;
    for (let i = 0; i < 30; i++) {
      try {
        // The image's temporary init server listens on Unix sockets only.
        // TCP readiness proves the final server is running before restore starts.
        await docker([
          "exec",
          container,
          "pg_isready",
          "-h",
          "127.0.0.1",
          "-U",
          "postgres",
        ]);
        ready = true;
        break;
      } catch {
        await new Promise((ok) => setTimeout(ok, 500));
      }
    }
    if (!ready) throw new Error("Restore PostgreSQL unavailable");
    await docker(["cp", dump, `${container}:/tmp/restored.dump`]);
    await docker([
      "exec",
      container,
      "createdb",
      "-h",
      "127.0.0.1",
      "-U",
      "postgres",
      "roomora_restore",
    ]);
    await docker(
      [
        "exec",
        container,
        "pg_restore",
        "-h",
        "127.0.0.1",
        "-U",
        "postgres",
        "--dbname",
        "roomora_restore",
        "--exit-on-error",
        "--single-transaction",
        "--no-owner",
        "--no-acl",
        "/tmp/restored.dump",
      ],
      600000,
    );
    const query = (sql) =>
      docker([
        "exec",
        container,
        "psql",
        "-h",
        "127.0.0.1",
        "-X",
        "-At",
        "-v",
        "ON_ERROR_STOP=1",
        "-U",
        "postgres",
        "-d",
        "roomora_restore",
        "-c",
        sql,
      ]);
    const core = await query(coreSchemaReadinessQuery);
    if (core.stdout.trim() !== "t") throw new Error("Not a Roomora database");
    // A pre-migration backup is valid even when the next release is not ready.
    // Never discard that recovery point just because a new index/column is absent.
    const schemaReady = await query(schemaReadinessQuery)
      .then((result) => result.stdout.trim() === "t")
      .catch(() => false);
    return {
      restored: true,
      coreSchemaReady: true,
      schemaReady,
      isolated: true,
    };
  } finally {
    if (started)
      await docker(["stop", "--timeout", "10", container]).catch(() => {});
    // Restrict recursive cleanup to the temporary directory created by this invocation.
    const target = resolve(directory);
    if (!target.startsWith(`${root}${sep}roomora-restore-`))
      throw new Error("Unexpected cleanup path");
    await rm(target, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(JSON.stringify(await restoreEncryptedBackup(process.argv[2])));
  } catch {
    console.error(
      JSON.stringify({ restored: false, error: "BACKUP_RESTORE_FAILED" }),
    );
    process.exitCode = 1;
  }
}
