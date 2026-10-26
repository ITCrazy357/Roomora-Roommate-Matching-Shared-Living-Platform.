import { PasswordService } from './password.service.js';
import { scryptSync } from 'node:crypto';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  it('hashes and verifies the correct password', async () => {
    const hash = await passwords.hash('Mat-khau-rat-dai-2026');

    expect(hash).not.toContain('Mat-khau-rat-dai-2026');
    await expect(passwords.verify('Mat-khau-rat-dai-2026', hash)).resolves.toBe(
      true,
    );
    await expect(passwords.verify('sai-mat-khau', hash)).resolves.toBe(false);
  });

  it('rejects malformed or obsolete parameters', async () => {
    await expect(passwords.verify('anything', 'not-a-hash')).resolves.toBe(
      false,
    );
  });

  it('uses the stronger work factor for new hashes', async () => {
    const hash = await passwords.hash('New-password-2026');
    expect(hash.split('$').slice(0, 4)).toEqual(['scrypt', '32768', '8', '3']);
  });

  it('verifies legacy hashes and identifies them for an upgrade', async () => {
    const salt = Buffer.alloc(16, 7);
    const key = scryptSync('Legacy-password-2026', salt, 64, {
      N: 16384,
      r: 8,
      p: 1,
    });
    const legacy = [
      'scrypt',
      16384,
      8,
      1,
      salt.toString('base64url'),
      key.toString('base64url'),
    ].join('$');
    expect(passwords.needsRehash(legacy)).toBe(true);
    await expect(
      passwords.verify('Legacy-password-2026', legacy),
    ).resolves.toBe(true);
    await expect(passwords.verify('wrong', legacy)).resolves.toBe(false);
    expect(
      passwords.needsRehash(await passwords.hash('Legacy-password-2026')),
    ).toBe(false);
  });

  it('rejects unbounded work factors without executing an expensive hash', async () => {
    const hash = [
      'scrypt',
      1073741824,
      8,
      1,
      Buffer.alloc(16).toString('base64url'),
      Buffer.alloc(64).toString('base64url'),
    ].join('$');
    await expect(passwords.verify('password', hash)).resolves.toBe(false);
  });
});
