const SESSION_ID_COOKIE = 'vetai_session_id';
const SESSION_ALIVE_COOKIE = 'vetai_alive';

function readCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const prefix = `${name}=`;
  const found = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return found ? decodeURIComponent(found.slice(prefix.length)) : null;
}

function writeSessionCookie(name: string, value: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; SameSite=Lax`;
}

function clearSessionCookie(name: string): void {
  if (typeof document === 'undefined') return;
  document.cookie = `${name}=; path=/; max-age=0`;
}

export function hasBrowserSession(): boolean {
  return Boolean(readCookie(SESSION_ALIVE_COOKIE) && readCookie(SESSION_ID_COOKIE));
}

export function markBrowserSession(): void {
  writeSessionCookie(SESSION_ALIVE_COOKIE, '1');
  getOrCreateSessionId();
}

export function clearBrowserSession(): void {
  clearSessionCookie(SESSION_ALIVE_COOKIE);
  clearSessionCookie(SESSION_ID_COOKIE);
  if (typeof sessionStorage !== 'undefined') {
    sessionStorage.removeItem('vetai_session_id');
  }
}

export function getOrCreateSessionId(): string {
  let sid = readCookie(SESSION_ID_COOKIE);
  if (!sid && typeof sessionStorage !== 'undefined') {
    sid = sessionStorage.getItem('vetai_session_id');
  }
  if (!sid) {
    sid = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'sess_' + Math.random().toString(36).substring(2) + '_' + Date.now();
  }
  writeSessionCookie(SESSION_ID_COOKIE, sid);
  return sid;
}
