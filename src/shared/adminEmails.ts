export const ADMIN_EMAILS = [
  'vetassistentai@gmail.com',
  'calgarifabio@gmail.com',
] as const;

export function isListedAdminEmail(email?: string | null): boolean {
  const value = String(email || '').trim().toLowerCase();
  return ADMIN_EMAILS.some((adminEmail) => adminEmail === value);
}
