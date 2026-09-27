import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { isEmail } from 'class-validator';
import { CodeChallengeMethod, OAuth2Client } from 'google-auth-library';
import { GoogleAuthError } from './google-auth.error.js';

export interface GoogleIdentity {
  googleId: string;
  email: string;
  displayName: string;
}

@Injectable()
export class GoogleClientService {
  private readonly client: OAuth2Client;
  readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    const clientId = config.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = config.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = config.get<string>('GOOGLE_REDIRECT_URI');
    this.enabled = Boolean(clientId && clientSecret && redirectUri);
    this.client = new OAuth2Client({
      clientId,
      clientSecret,
      redirectUri,
      transporterOptions: { timeout: 10_000, retry: false },
    });
  }

  async createAuthorization(state: string, nonce: string) {
    if (!this.enabled) throw new GoogleAuthError('GOOGLE_DISABLED');
    const { codeVerifier, codeChallenge } =
      await this.client.generateCodeVerifierAsync();
    const url = this.client.generateAuthUrl({
      scope: ['openid', 'email', 'profile'],
      access_type: 'online',
      prompt: 'select_account',
      state,
      nonce,
      code_challenge: codeChallenge,
      code_challenge_method: CodeChallengeMethod.S256,
    });
    return { url, codeVerifier };
  }

  async verifyCode(
    code: string,
    codeVerifier: string,
    nonce: string,
  ): Promise<GoogleIdentity> {
    if (!this.enabled) throw new GoogleAuthError('GOOGLE_DISABLED');

    let idToken: string | null | undefined;
    try {
      const { tokens } = await this.client.getToken({ code, codeVerifier });
      idToken = tokens.id_token;
    } catch {
      // Google errors can contain credentials and tokens. Never forward or log them.
      throw new GoogleAuthError('GOOGLE_UNAVAILABLE');
    }
    if (!idToken) throw new GoogleAuthError('GOOGLE_TOKEN_INVALID');

    try {
      // The library checks the signature, issuer, audience and expiry.
      const ticket = await this.client.verifyIdToken({
        idToken,
        audience: this.config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      });
      const payload = ticket.getPayload();
      if (
        !payload ||
        !('nonce' in payload) ||
        payload.nonce !== nonce ||
        !payload.sub ||
        payload.sub.length > 255 ||
        payload.email_verified !== true ||
        !payload.email ||
        payload.email.length > 320 ||
        !isEmail(payload.email)
      ) {
        throw new GoogleAuthError('GOOGLE_TOKEN_INVALID');
      }
      return {
        googleId: payload.sub,
        email: payload.email.trim().toLowerCase(),
        displayName: payload.name?.trim().slice(0, 80) || 'Bạn Roomora',
      };
    } catch {
      throw new GoogleAuthError('GOOGLE_TOKEN_INVALID');
    }
  }
}
