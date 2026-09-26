export const SESSION_COOKIE = 'roomora_session';
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000;

export function cookieName(baseName: string, production: boolean): string {
  return production ? `__Host-${baseName}` : baseName;
}
