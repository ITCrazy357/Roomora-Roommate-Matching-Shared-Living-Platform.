import { spawn } from "node:child_process";
import { mkdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { encryptBackup, backupKey } from "./backup-archive.mjs";

const configurationCodes = new Set([
  "BACKUP_KEY_MISSING",
  "BACKUP_KEY_INVALID_BASE64_32_BYTES",
  "BACKUP_DATABASE_URL_MISSING",
  "BACKUP_DATABASE_URL_INVALID",
  "BACKUP_DATABASE_URL_USE_EXTERNAL",
  "BACKUP_DATABASE_URL_NOT_RENDER",
  "BACKUP_DATABASE_URL_CREDENTIALS_MISSING",
  "BACKUP_DATABASE_NAME_INVALID",
  "BACKUP_POSTGRES_MAJOR_INVALID",
]);
const runtimeCodes = new Set([
  "DOCKER_NOT_AVAILABLE",
  "DOCKER_START_FAILED",
  "DOCKER_ENGINE_UNAVAILABLE",
  "POSTGRES_IMAGE_PULL_FAILED",
  "PG_DUMP_VERSION_MISMATCH",
  "DATABASE_AUTHENTICATION_FAILED",
  "DATABASE_TLS_VERIFICATION_FAILED",
  "DATABASE_NETWORK_ACCESS_DENIED",
  "DATABASE_READ_PERMISSION_DENIED",
  "DATABASE_CONNECTION_FAILED",
  "PG_DUMP_FAILED",
  "PG_DUMP_INVALID_ARCHIVE",
  "BACKUP_ARCHIVE_WRITE_FAILED",
]);
function failure(code) {
  return Object.assign(new Error("Backup operation failed"), {
    backupCode: code,
  });
}

export function backupConnection(value, major = "18") {
  if (!/^(17|18)$/.test(major)) throw failure("BACKUP_POSTGRES_MAJOR_INVALID");
  if (typeof value !== "string" || !value.trim())
    throw failure("BACKUP_DATABASE_URL_MISSING");
  let url;
  try {
    url = new URL(value.trim());
  } catch {
    throw failure("BACKUP_DATABASE_URL_INVALID");
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol))
    throw failure("BACKUP_DATABASE_URL_INVALID");
  if (!url.hostname.endsWith(".render.com")) {
    throw failure(
      url.hostname.startsWith("dpg-") && !url.hostname.includes(".")
        ? "BACKUP_DATABASE_URL_USE_EXTERNAL"
        : "BACKUP_DATABASE_URL_NOT_RENDER",
    );
  }
  if (!url.username || !url.password)
    throw failure("BACKUP_DATABASE_URL_CREDENTIALS_MISSING");
  if (!/^\/[a-zA-Z0-9_-]+$/.test(url.pathname))
    throw failure("BACKUP_DATABASE_NAME_INVALID");
  let user, password;
  try {
    user = decodeURIComponent(url.username);
    password = decodeURIComponent(url.password);
  } catch {
    throw failure("BACKUP_DATABASE_URL_INVALID");
  }
  return {
    PGHOST: url.hostname,
    PGPORT: url.port || "5432",
    PGDATABASE: url.pathname.slice(1),
    PGUSER: user,
    PGPASSWORD: password,
    PGSSLMODE: "verify-full",
    PGSSLROOTCERT: "system",
    PGCONNECT_TIMEOUT: "15",
    image: `postgres:${major}`,
  };
}

// Report only fixed codes, never values, lengths, hashes, hosts or error messages.
export function inspectBackupConfiguration(env = process.env) {
  const issues = [];
  if (
    typeof env.ROOMORA_BACKUP_KEY !== "string" ||
    !env.ROOMORA_BACKUP_KEY.trim()
  )
    issues.push("BACKUP_KEY_MISSING");
  else {
    try {
      backupKey(env.ROOMORA_BACKUP_KEY);
    } catch {
      issues.push("BACKUP_KEY_INVALID_BASE64_32_BYTES");
    }
  }
  const major = env.ROOMORA_POSTGRES_MAJOR || "18";
  try {
    backupConnection(env.ROOMORA_BACKUP_DATABASE_URL, major);
  } catch (error) {
    issues.push(
      configurationCodes.has(error.backupCode)
        ? error.backupCode
        : "BACKUP_DATABASE_URL_INVALID",
    );
  }
  return {
    configured: issues.length === 0,
    issues,
    ...(/^(17|18)$/.test(major) ? { postgresMajor: major } : {}),
  };
}

export function classifyDumpFailure(stderr) {
  if (
    /cannot connect to the docker daemon|docker daemon is not running/i.test(
      stderr,
    )
  )
    return "DOCKER_ENGINE_UNAVAILABLE";
  if (
    /manifest unknown|pull access denied|toomanyrequests|failed to resolve reference/i.test(
      stderr,
    )
  )
    return "POSTGRES_IMAGE_PULL_FAILED";
  if (
    /server version mismatch|aborting because of server version|server version:.*pg_dump version:/is.test(
      stderr,
    )
  )
    return "PG_DUMP_VERSION_MISMATCH";
  if (/password authentication failed|no password supplied/i.test(stderr))
    return "DATABASE_AUTHENTICATION_FAILED";
  if (/no pg_hba.conf entry|ip.*not.*allow/i.test(stderr))
    return "DATABASE_NETWORK_ACCESS_DENIED";
  if (
    /certificate verify failed|root certificate|ssl error|certificate verification|server does not support ssl/i.test(
      stderr,
    )
  )
    return "DATABASE_TLS_VERIFICATION_FAILED";
  if (/permission denied for (table|schema|sequence)/i.test(stderr))
    return "DATABASE_READ_PERMISSION_DENIED";
  if (
    /connection timed out|timeout expired|could not translate host|name or service not known|network is unreachable|connection refused/i.test(
      stderr,
    )
  )
    return "DATABASE_CONNECTION_FAILED";
  return "PG_DUMP_FAILED";
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
  let stderrTail = "";
  dump.stderr.on("data", (chunk) => {
    stderrTail = (stderrTail + chunk.toString()).slice(-16384);
  });
  const completed = new Promise((ok, fail) => {
    dump.once("error", (error) =>
      fail(
        failure(
          error.code === "ENOENT"
            ? "DOCKER_NOT_AVAILABLE"
            : "DOCKER_START_FAILED",
        ),
      ),
    );
    dump.once("exit", (code) =>
      code === 0 ? ok() : fail(failure(classifyDumpFailure(stderrTail))),
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
        throw failure("PG_DUMP_INVALID_ARCHIVE");
    } finally {
      if (dump.exitCode === null) dump.kill();
    }
  };
  // Attach a rejection handler before consuming stdout to avoid an unhandled spawn failure.
  void completed.catch(() => {});
  try {
    await encryptBackup(checked(), output, key);
  } catch (error) {
    throw runtimeCodes.has(error.backupCode)
      ? error
      : failure("BACKUP_ARCHIVE_WRITE_FAILED");
  }
  if ((await stat(output)).size < 64) throw failure("PG_DUMP_INVALID_ARCHIVE");
  return { completed: true, encrypted: true };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const configuration = inspectBackupConfiguration();
    if (!configuration.configured) {
      console.error(
        JSON.stringify({
          completed: false,
          error: "BACKUP_CONFIGURATION_INVALID",
          ...configuration,
        }),
      );
      process.exitCode = 1;
    } else if (process.argv[2] === "--check-config") {
      console.log(JSON.stringify(configuration));
    } else {
      console.log(JSON.stringify(await runBackup()));
    }
  } catch (error) {
    console.error(
      JSON.stringify({
        completed: false,
        error: runtimeCodes.has(error.backupCode)
          ? error.backupCode
          : "DATABASE_BACKUP_FAILED",
      }),
    );
    process.exitCode = 1;
  }
}
