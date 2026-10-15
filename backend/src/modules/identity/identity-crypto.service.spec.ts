import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { IdentityCryptoService } from './identity-crypto.service.js';

describe('Private identity fields', () => {
  const service = new IdentityCryptoService(
    new ConfigService({
      IDENTITY_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
    }),
  );
  const fields = {
    fullName: 'Tên riêng demo',
    birthDate: '2001-01-01',
    documentNumber: '000000000123',
    phone: '0900000000',
    contactAddress: 'Địa chỉ demo',
  };
  it('encrypts private fields and uses a new nonce for each write', () => {
    const first = service.encrypt('owner', fields),
      second = service.encrypt('owner', fields);
    expect(first.equals(second)).toBe(false);
    expect(first.includes(Buffer.from(fields.documentNumber))).toBe(false);
    expect(first.includes(Buffer.from(fields.fullName))).toBe(false);
    expect(service.decrypt('owner', first)).toEqual(fields);
  });
  it('rejects swapping ciphertext between users and ciphertext tampering', () => {
    const data = service.encrypt('owner', fields);
    expect(() => service.decrypt('another-user', data)).toThrow();
    data[data.length - 1] ^= 1;
    expect(() => service.decrypt('owner', data)).toThrow();
  });
  it('does not fall back to plaintext when the key is absent', () => {
    const unconfigured = new IdentityCryptoService(new ConfigService());
    expect(() => unconfigured.encrypt('owner', fields)).toThrow();
  });
});
