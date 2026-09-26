import { PasswordService } from './password.service.js';

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
});
