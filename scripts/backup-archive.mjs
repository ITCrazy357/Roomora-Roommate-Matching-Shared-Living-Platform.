import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  randomUUID,
} from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { open, link, unlink, writeFile } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const magic = Buffer.from("ROOMORA_BACKUP_V1\n");
export function backupKey(value) {
  const key = Buffer.from(value ?? "", "base64");
  if (key.length !== 32 || key.toString("base64") !== value)
    throw new Error("Invalid backup key");
  return key;
}

export async function encryptBackup(input, output, key) {
  const temporary = `${output}.${randomUUID()}.partial`;
  let created = false;
  try {
    const iv = randomBytes(12);
    const file = await open(temporary, "wx", 0o600);
    created = true;
    await file.write(Buffer.concat([magic, iv]));
    await file.close();
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    cipher.setAAD(magic);
    await pipeline(
      input,
      cipher,
      createWriteStream(temporary, { flags: "a", mode: 0o600 }),
    );
    const completed = await open(temporary, "a");
    try {
      await completed.write(cipher.getAuthTag());
    } finally {
      await completed.close();
    }
    // Publishing with a hard link is atomic and refuses to overwrite an existing backup.
    await link(temporary, output);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(output)) hash.update(chunk);
    await writeFile(`${output}.sha256`, `${hash.digest("hex")}\n`, {
      flag: "wx",
      mode: 0o600,
    });
  } finally {
    if (created) await unlink(temporary).catch(() => {});
  }
}

export async function decryptBackup(input, output, key) {
  if (resolve(input) === resolve(output))
    throw new Error("Input and output must differ");
  const file = await open(input, "r");
  const temporary = `${output}.${randomUUID()}.partial`;
  let created = false;
  try {
    const { size } = await file.stat();
    if (size <= magic.length + 28) throw new Error("Invalid archive");
    const header = Buffer.alloc(magic.length + 12);
    await file.read(header, 0, header.length, 0);
    if (!header.subarray(0, magic.length).equals(magic))
      throw new Error("Invalid archive");
    const tag = Buffer.alloc(16);
    await file.read(tag, 0, 16, size - 16);
    const cipher = createDecipheriv(
      "aes-256-gcm",
      key,
      header.subarray(magic.length),
    );
    cipher.setAAD(magic);
    cipher.setAuthTag(tag);
    const target = await open(temporary, "wx", 0o600);
    created = true;
    await target.close();
    await pipeline(
      createReadStream(input, { start: header.length, end: size - 17 }),
      cipher,
      createWriteStream(temporary, { flags: "a", mode: 0o600 }),
    );
    // No plaintext is published until GCM authentication succeeds.
    await link(temporary, output);
    const hash = createHash("sha256");
    for await (const chunk of createReadStream(output)) hash.update(chunk);
    await writeFile(`${output}.sha256`, `${hash.digest("hex")}\n`, {
      flag: "wx",
      mode: 0o600,
    });
  } finally {
    await file.close();
    if (created) await unlink(temporary).catch(() => {});
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const [mode, input, output] = process.argv.slice(2);
    if (!input || !output || !["encrypt", "decrypt"].includes(mode))
      throw new Error("Invalid arguments");
    const key = backupKey(process.env.ROOMORA_BACKUP_KEY);
    if (mode === "encrypt")
      await encryptBackup(createReadStream(input), output, key);
    else await decryptBackup(input, output, key);
    console.log(JSON.stringify({ operation: mode, completed: true }));
  } catch {
    console.error(
      JSON.stringify({ completed: false, error: "BACKUP_ARCHIVE_FAILED" }),
    );
    process.exitCode = 1;
  }
}
