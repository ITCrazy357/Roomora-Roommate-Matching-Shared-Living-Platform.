import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import pg from 'pg';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../dist/generated/prisma/client.js';
import { IdentityCryptoService } from '../dist/modules/identity/identity-crypto.service.js';
import {
  rotateIdentityKey,
  backupIdentityCiphertexts,
  checkRotationDatabase,
} from './rotate-identity-key.mjs';
import { mkdir, readFile, unlink } from 'node:fs/promises';

const target = new URL(process.env.IDENTITY_ROTATION_TEST_DATABASE_URL ?? '');
if (
  !['localhost', '127.0.0.1'].includes(target.hostname) ||
  target.pathname !== '/roomora_identity_rotation_test'
)
  throw new Error(
    'Chỉ chạy test với PostgreSQL local /roomora_identity_rotation_test qua IDENTITY_ROTATION_TEST_DATABASE_URL.',
  );

test('Xoay khóa trên PostgreSQL riêng, không đổi hồ sơ hoặc làm mất dữ liệu khi lỗi', async (t) => {
  const sql = new pg.Client({ connectionString: target.href });
  await sql.connect();
  try {
    await sql.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public');
  } finally {
    await sql.end();
  }
  execFileSync(
    process.execPath,
    [
      'node_modules/prisma/build/index.js',
      'migrate',
      'deploy',
      '--config',
      'prisma7.config.ts',
    ],
    {
      cwd: new URL('../', import.meta.url),
      env: { ...process.env, DATABASE_URL: target.href },
      stdio: 'pipe',
      timeout: 180000,
    },
  );
  const db = new PrismaClient({
    adapter: new PrismaPg({ connectionString: target.href }),
  });
  const oldKey = randomBytes(32).toString('hex');
  const newKey = randomBytes(32).toString('hex');
  const oldCrypto = new IdentityCryptoService(
    new ConfigService({ IDENTITY_ENCRYPTION_KEY: oldKey }),
  );
  const newCrypto = new IdentityCryptoService(
    new ConfigService({ IDENTITY_ENCRYPTION_KEY: newKey }),
  );
  const options = { oldKey, newKey };
  const fields = {
    fullName: 'Người dùng test riêng',
    birthDate: '2000-01-01',
    documentNumber: '000000000123',
    phone: '0000000000',
    contactAddress: 'Test only',
  };
  const userIds = [randomUUID(), randomUUID()].sort();
  try {
    await t.test(
      'Kiểm tra kết nối chỉ SELECT, không cần khóa và không đổi hồ sơ',
      async () => {
        const check = await checkRotationDatabase(target);
        assert.equal(check.connected, true);
        assert.equal(check.database, 'roomora_identity_rotation_test');
        assert.equal(check.username, decodeURIComponent(target.username));
        assert.equal(await db.identityDeclaration.count(), 0);
      },
    );
    for (const userId of userIds)
      await db.user.create({
        data: {
          id: userId,
          email: `${userId}@example.test`,
          identityDeclaration: {
            create: {
              encryptedData: oldCrypto.encrypt(userId, fields),
              documentLast4: '0123',
              status: 'PENDING',
              version: 3,
            },
          },
        },
      });
    const original = await db.identityDeclaration.findMany({
      orderBy: { userId: 'asc' },
    });
    await t.test(
      'Backup giữ nguyên ciphertext, không xuất plaintext hoặc ghi đè file cũ',
      async () => {
        const directory = new URL('../../.verification/', import.meta.url);
        await mkdir(directory, { recursive: true });
        const file = new URL(
          `identity-backup-test-${randomUUID()}.json`,
          directory,
        );
        try {
          assert.deepEqual(await backupIdentityCiphertexts(db, file), {
            backedUp: 2,
          });
          const raw = await readFile(file, 'utf8');
          assert.equal(raw.includes(fields.fullName), false);
          const backup = JSON.parse(raw);
          assert.equal(backup.format, 'roomora.identity-ciphertexts.v1');
          for (const [i, row] of backup.rows.entries()) {
            const bytes = Buffer.from(row.encryptedDataBase64, 'base64');
            assert.deepEqual(bytes, Buffer.from(original[i].encryptedData));
            assert.deepEqual(oldCrypto.decrypt(row.userId, bytes), fields);
          }
          await assert.rejects(backupIdentityCiphertexts(db, file), {
            code: 'EEXIST',
          });
          assert.equal(await readFile(file, 'utf8'), raw);
        } finally {
          await unlink(file);
        }
      },
    );
    await t.test(
      'Preview chỉ kiểm tra; apply bắt buộc xác nhận backend đã dừng',
      async () => {
        assert.deepEqual(await rotateIdentityKey(db, options), {
          mode: 'preview',
          total: 2,
          rotated: 0,
          wouldRotate: 2,
          alreadyNew: 0,
        });
        await assert.rejects(
          rotateIdentityKey(db, { ...options, apply: true }),
          /Phải dừng/,
        );
        assert.deepEqual(
          await db.identityDeclaration.findMany({ orderBy: { userId: 'asc' } }),
          original,
        );
      },
    );
    await t.test(
      'Một hồ sơ sai khóa làm rollback cả hồ sơ trước đó đã cập nhật',
      async () => {
        const last = userIds[1];
        const wrong = new IdentityCryptoService(
          new ConfigService({
            IDENTITY_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
          }),
        );
        await db.identityDeclaration.update({
          where: { userId: last },
          data: { encryptedData: wrong.encrypt(last, fields) },
        });
        const before = await db.identityDeclaration.findMany({
          orderBy: { userId: 'asc' },
        });
        await assert.rejects(
          rotateIdentityKey(db, {
            ...options,
            apply: true,
            backendStopped: true,
          }),
          /đã rollback/,
        );
        assert.deepEqual(
          await db.identityDeclaration.findMany({ orderBy: { userId: 'asc' } }),
          before,
        );
        await db.identityDeclaration.update({
          where: { userId: last },
          data: {
            encryptedData: original[1].encryptedData,
            updatedAt: original[1].updatedAt,
          },
        });
      },
    );
    await t.test(
      'Mã hóa lại đọc được bằng khóa mới; giữ version, ngày, trạng thái, nội dung',
      async () => {
        const before = await db.identityDeclaration.findMany({
          orderBy: { userId: 'asc' },
        });
        assert.equal(
          (
            await rotateIdentityKey(db, {
              ...options,
              apply: true,
              backendStopped: true,
            })
          ).rotated,
          2,
        );
        const after = await db.identityDeclaration.findMany({
          orderBy: { userId: 'asc' },
        });
        for (const [i, row] of after.entries()) {
          assert.deepEqual(
            newCrypto.decrypt(row.userId, row.encryptedData),
            fields,
          );
          assert.throws(() => oldCrypto.decrypt(row.userId, row.encryptedData));
          const { encryptedData: _a, ...metadataAfter } = row;
          const { encryptedData: _b, ...metadataBefore } = before[i];
          assert.deepEqual(metadataAfter, metadataBefore);
        }
        assert.deepEqual(
          await rotateIdentityKey(db, {
            ...options,
            apply: true,
            backendStopped: true,
          }),
          {
            mode: 'applied',
            total: 2,
            rotated: 0,
            wouldRotate: 0,
            alreadyNew: 2,
          },
        );
      },
    );
  } finally {
    await db.$disconnect();
  }
});
