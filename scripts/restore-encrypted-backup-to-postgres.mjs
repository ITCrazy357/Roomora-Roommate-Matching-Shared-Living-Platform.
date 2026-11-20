import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { join, resolve, sep } from "node:path";
import { promisify } from "node:util";
import { backupKey, decryptBackup } from "./backup-archive.mjs";

const exec = promisify(execFile);
const defaultDatabase = "roomora_recovery_20261120";
const inventoryQuery = `
  SELECT json_build_object(
    'users', (SELECT count(*) FROM users),
    'listings', (SELECT count(*) FROM listings),
    'connections', (SELECT count(*) FROM connections),
    'conversations', (SELECT count(*) FROM conversations),
    'messages', (SELECT count(*) FROM messages),
    'houses', (SELECT count(*) FROM houses),
    'expenses', (SELECT count(*) FROM expenses),
    'notifications', (SELECT count(*) FROM notifications)
  )::text;
`;

function recoveryDatabaseName(value) {
  const name = value || defaultDatabase;
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name))
    throw new Error("Invalid recovery database name");
  return name;
}

function recoveryUrl(value, database) {
  const url = new URL(value);
  if (!/^postgres(?:ql)?:$/.test(url.protocol) || !url.hostname)
    throw new Error("Invalid PostgreSQL URL");
  if (url.searchParams.get("sslmode") !== "require")
    throw new Error("Recovery requires sslmode=require");
  url.pathname = `/${database}`;
  return url.toString();
}

async function verifyArchive(archive) {
  const expected = (await readFile(`${archive}.sha256`, "utf8")).trim();
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(archive)) digest.update(chunk);
  if (
    !/^[a-f0-9]{64}$/i.test(expected) ||
    digest.digest("hex") !== expected.toLowerCase()
  )
    throw new Error("Checksum failed");
}

export async function restoreEncryptedBackupToPostgres(
  archive,
  env = process.env,
  execute = exec,
) {
  const key = backupKey(env.ROOMORA_BACKUP_KEY);
  const major = env.ROOMORA_POSTGRES_MAJOR || "18";
  if (!/^(17|18)$/.test(major)) throw new Error("Invalid client version");
  const database = recoveryDatabaseName(env.ROOMORA_RECOVERY_DATABASE);
  const target = recoveryUrl(env.ROOMORA_RESTORE_DATABASE_URL, database);
  await verifyArchive(archive);

  const root = resolve(env.RUNNER_TEMP || tmpdir());
  const directory = await mkdtemp(join(root, "roomora-recovery-"));
  const dump = join(directory, "restored.dump");
  const docker = (args, timeout = 600000) =>
    execute("docker", args, {
      timeout,
      windowsHide: true,
      maxBuffer: 1024 * 1024,
    });
  const psql = (url, sql) =>
    docker([
      "run",
      "--rm",
      `postgres:${major}`,
      "psql",
      url,
      "-X",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      sql,
    ]);

  try {
    const capability = await psql(
      env.ROOMORA_RESTORE_DATABASE_URL,
      "SELECT rolcreatedb FROM pg_roles WHERE rolname = current_user",
    );
    if (capability.stdout.trim() !== "t")
      throw new Error("Database creation is not permitted");

    const exists = await psql(
      env.ROOMORA_RESTORE_DATABASE_URL,
      `SELECT EXISTS(SELECT 1 FROM pg_database WHERE datname = '${database}')`,
    );
    if (exists.stdout.trim() === "t")
      throw new Error("Recovery database already exists");

    await psql(env.ROOMORA_RESTORE_DATABASE_URL, `CREATE DATABASE ${database}`);
    await decryptBackup(archive, dump, key);
    await docker([
      "run",
      "--rm",
      "--mount",
      `type=bind,source=${directory},target=/backup,readonly`,
      `postgres:${major}`,
      "pg_restore",
      `--dbname=${target}`,
      "--exit-on-error",
      "--single-transaction",
      "--no-owner",
      "--no-acl",
      "/backup/restored.dump",
    ]);
    const inventory = await psql(target, inventoryQuery);
    return {
      restored: true,
      database,
      inventory: JSON.parse(inventory.stdout.trim()),
    };
  } finally {
    const cleanup = resolve(directory);
    if (!cleanup.startsWith(`${root}${sep}roomora-recovery-`))
      throw new Error("Unexpected cleanup path");
    await rm(cleanup, { recursive: true, force: true });
  }
}

export async function checkRecoveryDatabase(env = process.env, execute = exec) {
  const major = env.ROOMORA_POSTGRES_MAJOR || "18";
  if (!/^(17|18)$/.test(major)) throw new Error("Invalid client version");
  const database = recoveryDatabaseName(env.ROOMORA_RECOVERY_DATABASE);
  const target = recoveryUrl(env.ROOMORA_RESTORE_DATABASE_URL, database);
  const checked = await execute(
    "docker",
    [
      "run",
      "--rm",
      `postgres:${major}`,
      "psql",
      target,
      "-X",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      inventoryQuery,
    ],
    { timeout: 600000, windowsHide: true, maxBuffer: 1024 * 1024 },
  );
  return { database, inventory: JSON.parse(checked.stdout.trim()) };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result =
      process.argv[2] === "--check"
        ? await checkRecoveryDatabase()
        : await restoreEncryptedBackupToPostgres(process.argv[2]);
    console.log(JSON.stringify(result));
  } catch {
    console.error(JSON.stringify({ restored: false, error: "RECOVERY_RESTORE_FAILED" }));
    process.exitCode = 1;
  }
}
