import { Injectable } from '@nestjs/common';
import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
  type ScryptOptions,
} from 'node:crypto';
const KEY_LENGTH = 64;
const COST = 32_768;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 3;
const LEGACY_COST = 16_384;

function deriveKey(
  password: string,
  salt: Buffer,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, options, (error, key) => {
      if (error) reject(error);
      else resolve(key);
    });
  });
}

@Injectable()
export class PasswordService {
  private dummyHash?: Promise<string>;

  needsRehash(encodedHash: string): boolean {
    const parts = encodedHash.split('$');
    return (
      parts.length === 6 &&
      parts[0] === 'scrypt' &&
      parts[1] === String(LEGACY_COST) &&
      parts[2] === '8' &&
      parts[3] === '1'
    );
  }

  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await deriveKey(password, salt, {
      cost: COST,
      blockSize: BLOCK_SIZE,
      parallelization: PARALLELIZATION,
      maxmem: 64 * 1024 * 1024,
    });

    return [
      'scrypt',
      COST,
      BLOCK_SIZE,
      PARALLELIZATION,
      salt.toString('base64url'),
      key.toString('base64url'),
    ].join('$');
  }

  async verify(password: string, encodedHash: string): Promise<boolean> {
    const parts = encodedHash.split('$');
    if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

    const cost = Number(parts[1]);
    const blockSize = Number(parts[2]);
    const parallelization = Number(parts[3]);
    const salt = Buffer.from(parts[4], 'base64url');
    const expected = Buffer.from(parts[5], 'base64url');

    if (
      !(
        (cost === COST && parallelization === PARALLELIZATION) ||
        (cost === LEGACY_COST && parallelization === 1)
      ) ||
      blockSize !== BLOCK_SIZE ||
      salt.length !== 16 ||
      expected.length !== KEY_LENGTH ||
      salt.toString('base64url') !== parts[4] ||
      expected.toString('base64url') !== parts[5]
    ) {
      return false;
    }

    const actual = await deriveKey(password, salt, {
      cost,
      blockSize,
      parallelization,
      maxmem: 64 * 1024 * 1024,
    });

    return timingSafeEqual(actual, expected);
  }

  verifyAgainstDummy(password: string): Promise<boolean> {
    this.dummyHash ??= this.hash('roomora-invalid-account-password');
    return this.dummyHash.then((hash) => this.verify(password, hash));
  }
}
