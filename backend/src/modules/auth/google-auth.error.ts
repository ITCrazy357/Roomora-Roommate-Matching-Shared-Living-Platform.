import { HttpException, HttpStatus } from '@nestjs/common';

export type GoogleErrorCode =
  | 'GOOGLE_DISABLED'
  | 'GOOGLE_CANCELLED'
  | 'GOOGLE_STATE_INVALID'
  | 'GOOGLE_TOKEN_INVALID'
  | 'GOOGLE_CODE_INVALID'
  | 'GOOGLE_CLIENT_INVALID'
  | 'GOOGLE_AUTHORIZATION_FAILED'
  | 'GOOGLE_TOKEN_EXCHANGE_FAILED'
  | 'GOOGLE_NETWORK_ERROR'
  | 'GOOGLE_CALLBACK_FAILED'
  | 'GOOGLE_UNAVAILABLE'
  | 'GOOGLE_ACCOUNT_EXISTS'
  | 'GOOGLE_LINK_CONFLICT'
  | 'GOOGLE_EMAIL_MISMATCH'
  | 'GOOGLE_LINK_SESSION_EXPIRED'
  | 'RATE_LIMITED';

// Only these fixed codes may be sent back to the frontend.
export class GoogleAuthError extends HttpException {
  constructor(readonly code: GoogleErrorCode) {
    const status =
      code === 'RATE_LIMITED'
        ? HttpStatus.TOO_MANY_REQUESTS
        : HttpStatus.BAD_REQUEST;
    super({ code, message: code }, status);
  }
}
