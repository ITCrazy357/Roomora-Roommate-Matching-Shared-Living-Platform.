import { readdir, stat, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function checkDeployment({
  url,
  backupDirectory,
  maxAgeHours = 24,
  timeoutMs = 6000,
}) {
  const target = new URL(url);
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
    target.hostname,
  );
  if (
    (target.protocol !== "https:" &&
      !(target.protocol === "http:" && loopback)) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== "/api/v1/health/ready"
  )
    throw new Error("Invalid readiness URL");
  if (!backupDirectory || !Number.isFinite(maxAgeHours) || maxAgeHours <= 0)
    throw new Error("Backup directory and positive max age are required");
  let httpStatus = null;
  let ready = false;
  try {
    const response = await fetch(target, {
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
    });
    httpStatus = response.status;
    const body = await response.json();
    ready =
      httpStatus === 200 &&
      body?.status === "ok" &&
      body?.service === "roomora-api" &&
      body?.database === "up" &&
      body?.schema === "up" &&
      ["up", "disabled"].includes(body?.redis);
  } catch {
    /* Record failure without logging network URLs or credentials. */
  }
  let latest = 0;
  try {
    for (const name of await readdir(backupDirectory)) {
      if (!name.endsWith(".dump")) continue;
      const file = join(backupDirectory, name);
      try {
        const info = await stat(file);
        const hash = (await readFile(`${file}.sha256`, "utf8")).trim();
        if (info.isFile() && info.size > 0 && /^[a-f0-9]{64}$/i.test(hash))
          latest = Math.max(latest, info.mtimeMs);
      } catch {
        /* Incomplete backups are not counted. */
      }
    }
  } catch {
    /* Missing/unreadable backup directories are unhealthy. */
  }
  const backupAgeHours = latest
    ? Math.max(0, (Date.now() - latest) / 3600000)
    : null;
  const backupFresh = backupAgeHours !== null && backupAgeHours <= maxAgeHours;
  return {
    checkedAt: new Date().toISOString(),
    ready,
    httpStatus,
    backupAgeHours,
    backupFresh,
  };
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const result = await checkDeployment({
      url: process.env.MONITOR_URL,
      backupDirectory: process.env.MONITOR_BACKUP_DIRECTORY,
      maxAgeHours: Number(process.env.MONITOR_BACKUP_MAX_AGE_HOURS ?? 24),
    });
    console.log(JSON.stringify(result));
    process.exitCode = result.ready && result.backupFresh ? 0 : 1;
  } catch {
    console.error(
      JSON.stringify({ ready: false, error: "MONITOR_CONFIGURATION_INVALID" }),
    );
    process.exitCode = 1;
  }
}
