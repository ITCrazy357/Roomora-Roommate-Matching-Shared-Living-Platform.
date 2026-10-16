import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import {
  identityKeyDiagnostics,
  validateIdentityKeys,
  rotationDatabaseUrl,
  rotationErrorMessage,
} from './rotate-identity-key.mjs';

test('Render External URL thiếu SSL được bật TLS, cấu hình khác được giữ nguyên', () => {
  const raw =
    'postgresql://fixture:fake-test-password@dpg-fixture.oregon-postgres.render.com/fixture';
  assert.equal(
    rotationDatabaseUrl(raw).searchParams.get('sslmode'),
    'verify-full',
  );
  assert.equal(new URL(raw).searchParams.has('sslmode'), false);
  assert.equal(
    rotationDatabaseUrl(raw + '?sslmode=require').searchParams.get('sslmode'),
    'require',
  );
  assert.throws(
    () => rotationDatabaseUrl(raw + '?sslmode=disable'),
    /bắt buộc TLS/,
  );
  assert.equal(
    rotationDatabaseUrl(
      'postgresql://fixture:test@localhost:5432/test',
    ).searchParams.has('sslmode'),
    false,
  );
});

test('Mất kết nối không khẳng định rollback, lỗi xác thực không in chi tiết chứa secret', () => {
  const secret = 'fake-sensitive-value';
  const error = {
    name: 'PrismaClientKnownRequestError',
    code: 'P1017',
    message: secret,
  };
  assert.match(rotationErrorMessage(error), /Chưa xác nhận được/);
  assert.equal(rotationErrorMessage(error).includes(secret), false);
  assert.match(
    rotationErrorMessage({ code: '28P01', message: secret }),
    /credential mới/,
  );
  assert.equal(
    rotationErrorMessage({ code: '28000', message: secret }).includes(secret),
    false,
  );
});

test('Phân biệt thiếu khóa cũ, sai định dạng, sai khóa mới và hai khóa trùng', () => {
  const oldKey = randomBytes(32).toString('hex');
  const newKey = randomBytes(32).toString('hex');
  assert.throws(
    () => validateIdentityKeys(undefined, newKey),
    /Chưa có IDENTITY_OLD_KEY/,
  );
  assert.throws(
    () => validateIdentityKeys('a'.repeat(63), newKey),
    /IDENTITY_OLD_KEY sai định dạng.*63/,
  );
  assert.throws(
    () => validateIdentityKeys('g'.repeat(64), newKey),
    /IDENTITY_OLD_KEY sai định dạng/,
  );
  assert.throws(
    () => validateIdentityKeys(oldKey, 'not-a-key'),
    /Khóa mới sai định dạng/,
  );
  assert.throws(
    () => validateIdentityKeys(oldKey, oldKey.toUpperCase()),
    /TRÙNG NHAU/,
  );
  assert.deepEqual(validateIdentityKeys(` ${oldKey}\r\n`, `\n${newKey} `), {
    oldKey,
    newKey,
  });
  const output = JSON.stringify(identityKeyDiagnostics(oldKey, newKey));
  assert.equal(output.includes(oldKey), false);
  assert.equal(output.includes(newKey), false);
  assert.deepEqual(identityKeyDiagnostics(oldKey, newKey), {
    oldKey: { present: true, length: 64, validHex64: true },
    newKey: { present: true, length: 64, validHex64: true },
    sameKey: false,
  });
});

test('CLI kiểm tra khóa mà không kết nối DB và không in secret', () => {
  const oldKey = randomBytes(32).toString('hex');
  const newKey = randomBytes(32).toString('hex');
  const output = execFileSync(
    process.execPath,
    ['scripts/rotate-identity-key.mjs', '--check-keys'],
    {
      cwd: new URL('../', import.meta.url),
      encoding: 'utf8',
      env: {
        ...process.env,
        DOTENV_CONFIG_QUIET: 'true',
        DATABASE_URL: 'not-a-database-url',
        IDENTITY_OLD_KEY: oldKey,
        IDENTITY_NEW_KEY: newKey,
      },
    },
  );
  assert.equal(output.includes(oldKey), false);
  assert.equal(output.includes(newKey), false);
  assert.deepEqual(JSON.parse(output), {
    ...identityKeyDiagnostics(oldKey, newKey),
    newKeySource: 'IDENTITY_NEW_KEY',
  });
});
