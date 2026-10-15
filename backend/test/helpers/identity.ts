import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { IdentityService } from '../../src/modules/identity/identity.service.js';

// Fixtures for successful house/rental flows must satisfy the same identity
// policy as real users. Keep undeclared fixtures in the identity negative tests.
export async function declareIdentity(app: INestApplication, userId: string) {
  const config = app.get(ConfigService);
  if (!config.get<string>('IDENTITY_ENCRYPTION_KEY'))
    config.set('IDENTITY_ENCRYPTION_KEY', randomBytes(32).toString('hex'));

  await app.get(IdentityService).declare(userId, {
    version: 0,
    fullName: 'Người dùng kiểm thử',
    birthDate: '2001-01-01',
    documentNumber: '000000000123',
    phone: '0900000000',
    contactAddress: 'Địa chỉ giả chỉ dùng cho kiểm thử tự động',
    confirmDemo: true,
  });
}
