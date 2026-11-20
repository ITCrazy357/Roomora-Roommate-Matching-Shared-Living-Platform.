import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { restoreEncryptedBackup } from "./restore-encrypted-backup.mjs";
import { schemaReadinessQuery } from "../backend/src/database/schema-readiness.ts";

const exec = promisify(execFile);

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

export async function inspectEncryptedBackup(
  archive,
  env = process.env,
  execute = exec,
) {
  let inventory;
  const inspectDuringRestore = async (command, args, options) => {
    const result = await execute(command, args, options);
    if (args.includes("psql") && args.at(-1) === schemaReadinessQuery) {
      const inspected = await execute(
        "docker",
        [
          "exec",
          args[1],
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
          inventoryQuery,
        ],
        options,
      );
      inventory = JSON.parse(inspected.stdout.trim());
    }
    return result;
  };

  const restored = await restoreEncryptedBackup(
    archive,
    env,
    inspectDuringRestore,
  );
  if (!inventory) throw new Error("Archive inventory unavailable");
  return { ...restored, inventory };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(JSON.stringify(await inspectEncryptedBackup(process.argv[2])));
  } catch {
    console.error(JSON.stringify({ inspected: false, error: "BACKUP_INSPECTION_FAILED" }));
    process.exitCode = 1;
  }
}
