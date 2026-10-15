import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export type IdentityFields = {
  fullName: string;
  birthDate: string;
  documentNumber: string;
  phone: string;
  contactAddress: string;
};

@Injectable()
export class IdentityCryptoService {
  constructor(private readonly config: ConfigService) {}

  private key() {
    const value = this.config.get<string>('IDENTITY_ENCRYPTION_KEY') ?? '';
    if (!/^[a-fA-F0-9]{64}$/.test(value))
      throw new ServiceUnavailableException({
        code: 'IDENTITY_NOT_CONFIGURED',
      });
    return Buffer.from(value, 'hex');
  }

  encrypt(userId: string, fields: IdentityFields) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAAD(Buffer.from(userId));
    const encrypted = Buffer.concat([
      cipher.update(JSON.stringify(fields), 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), encrypted]);
  }

  decrypt(userId: string, value: Uint8Array): IdentityFields {
    try {
      const bytes = Buffer.from(value);
      const decipher = createDecipheriv(
        'aes-256-gcm',
        this.key(),
        bytes.subarray(0, 12),
      );
      decipher.setAAD(Buffer.from(userId));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(
        Buffer.concat([
          decipher.update(bytes.subarray(28)),
          decipher.final(),
        ]).toString('utf8'),
      ) as IdentityFields;
    } catch {
      throw new ServiceUnavailableException({
        code: 'IDENTITY_NOT_CONFIGURED',
      });
    }
  }
}
