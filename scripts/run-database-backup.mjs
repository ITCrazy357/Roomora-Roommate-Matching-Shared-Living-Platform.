import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { encryptBackup, backupKey } from "./backup-archive.mjs";

export function backupConnection(value, major = "18") {
  const url = new URL(value);
  if (
    !["postgres:", "postgresql:"].includes(url.protocol) ||
    !url.hostname.endsWith(".render.com") ||
    !url.username ||
    !url.password ||
    !/^\/[a-zA-Z0-9_-]+$/.test(url.pathname) ||
    !/^(17|18)$/.test(major)
  )
    throw new Error("Invalid Render backup configuration");
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: url.pathname.slice(1),
    PGUSER: decodeURIComponent(url.username),
    PGPASSWORD: decodeURIComponent(url.password),
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: "system",
    PGCONNECT_TIMEOUT: "15",
    image: `postgres:${major}`,
  };
}

export async function runBackup(env = process.env) {
  const key = backupKey(env.ROOMORA_BACKUP_KEY);
  const { image, ...connection } = backupConnection(
    env.ROOMORA_BACKUP_DATABASE_URL,
    env.ROOMORA_POSTGRES_MAJOR || "18",
  );
  const directory = resolve(env.BACKUP_OUTPUT_DIRECTORY || "backups/encrypted");
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const output = join(
    directory,
    `roomora-${new Date().toISOString().slice(0, 10)}-${randomUUID()}.dump.enc`,
  );
  const args = [
    "run",
    "--rm",
    ...Object.keys(connection).flatMap((name) => ["--env", name]),
    image,
    "pg_dump",
    "--no-password",
    "--format=custom",
    "--no-owner",
    "--no-acl",
  ];
  // Credentials are inherited through env, never process arguments or error logs.
  const dump = spawn("docker", args, {
    env: { ...env, ...connection },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  dump.stderr.resume();
  const completed = new Promise((ok, fail) => {
    dump.once("error", fail);
    dump.once("exit", (code) =>
      code === 0 ? ok() : fail(new Error("pg_dump failed")),
    );
  });
  // A failed dump must fail the stream before it can be published as a completed backup.
  const checked = async function* () {
    let bytes = 0;
    let header = Buffer.alloc(0);
    try {
      for await (const chunk of dump.stdout) {
        bytes += chunk.length;
        if (header.length < 5)
          header = Buffer.concat([header, chunk]).subarray(0, 5);
        yield chunk;
      }
      await completed;
      if (bytes < 64 || header.toString("ascii") !== "PGDMP")
        throw new Error("Invalid custom dump");
    } finally {
      if (dump.exitCode === null) dump.kill();
    }
  };
  // Attach a rejection handler before consuming stdout to avoid an unhandled spawn failure.
  void completed.catch(() => {});
  await encryptBackup(checked(), output, key);
  if ((await stat(output)).size < 64) throw new Error("Empty archive");
  return { completed: true, encrypted: true };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(JSON.stringify(await runBackup()));
  } catch {
    console.error(
      JSON.stringify({ completed: false, error: "DATABASE_BACKUP_FAILED" }),
    );
    process.exitCode = 1;
  }
}
