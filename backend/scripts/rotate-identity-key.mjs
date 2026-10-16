import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { IdentityCryptoService } from '../dist/modules/identity/identity-crypto.service.js';
import pg from 'pg';

const normalizeKey = (key) => (typeof key === 'string' ? key.trim() : '');
const validKey = (key) => /^[a-f\d]{64}$/i.test(key);

export function rotationDatabaseUrl(raw) {
  const url = new URL(raw ?? '');
  if (!['postgres:', 'postgresql:'].includes(url.protocol))
    throw new Error('Cần DATABASE_URL PostgreSQL.');
  const externalRender =
    url.hostname.startsWith('dpg-') &&
    url.hostname.endsWith('-postgres.render.com');
  if (externalRender && url.searchParams.get('sslmode') === 'disable')
    throw new Error(
      'External URL của Render bắt buộc TLS; không dùng sslmode=disable.',
    );
  if (externalRender && !url.searchParams.has('sslmode'))
    url.searchParams.set('sslmode', 'verify-full');
  return url;
}

export function rotationErrorMessage(error) {
  if (error.code === 'P1017')
    return 'Kết nối PostgreSQL bị đóng (P1017). Chưa xác nhận được kết quả giao dịch. Nếu vừa chạy --apply, giữ backend dừng, giữ nguyên cả hai khóa và chạy --preview sau khi sửa kết nối để kiểm tra alreadyNew/wouldRotate.';
  if (['P1000', '28P01'].includes(error.code))
    return 'DB từ chối đăng nhập. Cần External Database URL của credential mới còn hoạt động, không dùng credential đã xóa.';
  if (error.code === '28000')
    return 'DB từ chối kết nối (28000). Kiểm tra External URL đầy đủ, TLS, credential và External Access/IP allowlist trên Render.';
  if (['P1001', 'ENOTFOUND', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error.code))
    return `Không kết nối được PostgreSQL (${error.code}). Kiểm tra hostname, cổng, trạng thái database và mạng.`;
  if (/ssl|tls|sni|certificate/i.test(String(error.message)))
    return `Không thiết lập được TLS tới PostgreSQL (${error.code ?? 'TLS_ERROR'}). Dùng External URL đầy đủ và kiểm tra chứng chỉ/kết nối TLS; không đổi hostname thành địa chỉ IP.`;
  if (error.name?.startsWith('Prisma'))
    return `Thao tác DB thất bại (${error.code ?? error.name}); kiểm tra trạng thái bằng --preview trước khi chạy lại --apply.`;
  // pg errors can contain connection details. Only show their code, not raw text.
  if (error.severity)
    return `PostgreSQL từ chối thao tác (${error.code ?? 'PG_ERROR'}). Kiểm tra cấu hình và quyền kết nối.`;
  return error.message;
}

export async function checkRotationDatabase(url) {
  const client = new pg.Client({
    connectionString: url.href,
    connectionTimeoutMillis: 15000,
    application_name: 'roomora_identity_rotation_check',
  });
  try {
    await client.connect();
    const result = await client.query(
      'SELECT current_user AS username, current_database() AS database, (SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()) AS ssl',
    );
    return { connected: true, ...result.rows[0] };
  } finally {
    await client.end();
  }
}

export function identityKeyDiagnostics(oldKey, newKey) {
  const old = normalizeKey(oldKey);
  const next = normalizeKey(newKey);
  return {
    oldKey: { present: !!old, length: old.length, validHex64: validKey(old) },
    newKey: {
      present: !!next,
      length: next.length,
      validHex64: validKey(next),
    },
    sameKey: !!old && !!next && old.toLowerCase() === next.toLowerCase(),
  };
}

export function validateIdentityKeys(oldKey, newKey) {
  const old = normalizeKey(oldKey);
  const next = normalizeKey(newKey);
  if (!old)
    throw new Error(
      'Chưa có IDENTITY_OLD_KEY trong tiến trình Node. Cần nhập và export khóa cũ trong chính terminal đang chạy npm.',
    );
  if (!validKey(old))
    throw new Error(
      `IDENTITY_OLD_KEY sai định dạng (độ dài sau bỏ khoảng trắng: ${old.length}). Cần 64 ký tự 0-9/a-f, không kèm tên biến hoặc dấu nháy.`,
    );
  if (!validKey(next))
    throw new Error(
      `Khóa mới sai định dạng (độ dài sau bỏ khoảng trắng: ${next.length}). Kiểm tra IDENTITY_NEW_KEY hoặc file .verification/identity-key-next.txt.`,
    );
  if (old.toLowerCase() === next.toLowerCase())
    throw new Error(
      'Khóa cũ và khóa mới đang TRÙNG NHAU. IDENTITY_OLD_KEY phải là khóa Render đang dùng trước khi đổi, không phải nội dung identity-key-next.txt.',
    );
  return { oldKey: old, newKey: next };
}

export async function backupIdentityCiphertexts(db, file) {
  const rows = await db.identityDeclaration.findMany({
    select: { userId: true, encryptedData: true },
    orderBy: { userId: 'asc' },
  });
  await writeFile(
    file,
    JSON.stringify(
      {
        format: 'roomora.identity-ciphertexts.v1',
        exportedAt: new Date().toISOString(),
        rows: rows.map((row) => ({
          userId: row.userId,
          encryptedDataBase64: Buffer.from(row.encryptedData).toString(
            'base64',
          ),
        })),
      },
      null,
      2,
    ),
    { flag: 'wx', mode: 0o600 },
  );
  return { backedUp: rows.length };
}

export async function rotateIdentityKey(
  db,
  { oldKey, newKey, apply = false, backendStopped = false },
) {
  ({ oldKey, newKey } = validateIdentityKeys(oldKey, newKey));
  if (apply && !backendStopped)
    throw new Error(
      'Phải dừng mọi backend/worker ghi DB này trước, rồi đặt IDENTITY_ROTATION_BACKEND_STOPPED=true.',
    );
  const oldCrypto = new IdentityCryptoService(
    new ConfigService({ IDENTITY_ENCRYPTION_KEY: oldKey }),
  );
  const newCrypto = new IdentityCryptoService(
    new ConfigService({ IDENTITY_ENCRYPTION_KEY: newKey }),
  );
  return db.$transaction(
    async (tx) => {
      // Operational migration: callers must stop all writers until the new key is deployed.
      // Exclusive lock also blocks concurrent identity reads while the transaction runs.
      if (apply)
        await tx.$executeRawUnsafe(
          'LOCK TABLE identity_declarations IN ACCESS EXCLUSIVE MODE',
        );
      const rows = await tx.identityDeclaration.findMany({
        select: { userId: true, encryptedData: true },
        orderBy: { userId: 'asc' },
      });
      let alreadyNew = 0;
      let rotated = 0;
      for (const row of rows) {
        try {
          newCrypto.decrypt(row.userId, row.encryptedData);
          alreadyNew++;
          continue;
        } catch {}
        let fields;
        try {
          fields = oldCrypto.decrypt(row.userId, row.encryptedData);
        } catch {
          throw new Error(
            `Không giải mã được hồ sơ ${row.userId} bằng cả hai khóa; đã rollback, không tự bỏ qua hồ sơ.`,
          );
        }
        const encrypted = newCrypto.encrypt(row.userId, fields);
        if (
          JSON.stringify(newCrypto.decrypt(row.userId, encrypted)) !==
          JSON.stringify(fields)
        )
          throw new Error(
            'Kiểm tra giải mã bằng khóa mới thất bại; đã rollback.',
          );
        if (apply) {
          // Preserve review/version/timestamps. This is a key migration, not a resubmission.
          await tx.$executeRaw`UPDATE identity_declarations SET encrypted_data = ${encrypted} WHERE user_id = ${row.userId}::uuid`;
        }
        rotated++;
      }
      return {
        mode: apply ? 'applied' : 'preview',
        total: rows.length,
        rotated: apply ? rotated : 0,
        wouldRotate: apply ? 0 : rotated,
        alreadyNew,
      };
    },
    { timeout: 180000, maxWait: 15000, isolationLevel: 'RepeatableRead' },
  );
}

async function main() {
  const args = process.argv.slice(2);
  if (
    args.length > 1 ||
    args.some(
      (arg) =>
        ![
          '--preview',
          '--apply',
          '--generate-key',
          '--backup',
          '--check-keys',
          '--check-db',
        ].includes(arg),
    )
  )
    throw new Error(
      'Dùng --generate-key, --backup, --check-keys, --check-db, --preview hoặc --apply; đọc docs/credential-rotation.md trước.',
    );
  const keyFile = new URL(
    '../../.verification/identity-key-next.txt',
    import.meta.url,
  );
  if (args.includes('--generate-key')) {
    await mkdir(new URL('../../.verification/', import.meta.url), {
      recursive: true,
    });
    await writeFile(keyFile, randomBytes(32).toString('hex') + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
    console.log(
      'Đã tạo .verification/identity-key-next.txt (Git bỏ qua). Không gửi nội dung vào chat hoặc ảnh chụp.',
    );
    return;
  }
  let keys;
  if (!args.includes('--backup') && !args.includes('--check-db')) {
    const configuredNewKey = normalizeKey(process.env.IDENTITY_NEW_KEY);
    const newKey = configuredNewKey || (await readFile(keyFile, 'utf8')).trim();
    if (args.includes('--check-keys')) {
      const report = identityKeyDiagnostics(
        process.env.IDENTITY_OLD_KEY,
        newKey,
      );
      console.log(
        JSON.stringify(
          {
            ...report,
            newKeySource: configuredNewKey
              ? 'IDENTITY_NEW_KEY'
              : '.verification/identity-key-next.txt',
          },
          null,
          2,
        ),
      );
      if (
        !report.oldKey.validHex64 ||
        !report.newKey.validHex64 ||
        report.sameKey
      )
        process.exitCode = 1;
      return;
    }
    keys = validateIdentityKeys(process.env.IDENTITY_OLD_KEY, newKey);
  }
  const url = rotationDatabaseUrl(process.env.DATABASE_URL);
  console.log(
    JSON.stringify({
      host: url.hostname,
      port: url.port || '5432',
      database: url.pathname.slice(1),
      username: decodeURIComponent(url.username),
      sslmode: url.searchParams.get('sslmode'),
    }),
  );
  if (args.includes('--check-db')) {
    console.log(JSON.stringify(await checkRotationDatabase(url), null, 2));
    return;
  }
  const db = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: url.href,
      connectionTimeoutMillis: 15000,
    }),
  });
  try {
    console.log(
      `DB đích: ${url.hostname}:${url.port || '5432'}${url.pathname}`,
    );
    if (args.includes('--backup')) {
      const directory = new URL('../../.verification/', import.meta.url);
      await mkdir(directory, { recursive: true });
      const filename = `identity-before-rotation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
      console.log(
        JSON.stringify(
          {
            ...(await backupIdentityCiphertexts(
              db,
              new URL(filename, directory),
            )),
            file: `.verification/${filename}`,
          },
          null,
          2,
        ),
      );
      return;
    }
    console.log(
      JSON.stringify(
        await rotateIdentityKey(db, {
          ...keys,
          apply: args.includes('--apply'),
          backendStopped:
            process.env.IDENTITY_ROTATION_BACKEND_STOPPED === 'true',
        }),
        null,
        2,
      ),
    );
    if (args.includes('--apply'))
      console.log(
        'Giữ backend dừng cho tới khi IDENTITY_ENCRYPTION_KEY mới được cấu hình trên tất cả instance rồi deploy/resume.',
      );
  } finally {
    await db.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(rotationErrorMessage(error));
    process.exitCode = 1;
  });
