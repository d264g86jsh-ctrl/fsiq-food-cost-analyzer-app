// Server-only — ADMIN_ACCESS_TOKEN never exposed to browser.
export const ADMIN_COOKIE_NAME = 'admin_session';
export const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 8; // 8 hours

export function validateAdminToken(token: string): boolean {
  const expected = process.env.ADMIN_ACCESS_TOKEN;
  if (!expected || !token) return false;
  return token === expected;
}
