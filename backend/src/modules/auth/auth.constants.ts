export const SESSION_COOKIE = 'roomora_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const PASSWORD_RESET_TOKEN_TTL_MS = 5 * 60 * 1000;

export function cookieName(baseName: string, production: boolean): string {
  return production ? `__Host-${baseName}` : baseName;
}
