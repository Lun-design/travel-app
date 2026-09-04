export type AuthStatus = 'signedOut' | 'unverified' | 'authenticated';

export function authStatus(user: { id?: string; email_confirmed_at?: string | null } | null): AuthStatus {
  if (!user) return 'signedOut';
  return user.email_confirmed_at ? 'authenticated' : 'unverified';
}

export function friendlyAuthError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/failed to fetch|network request failed|network error/i.test(message)) return '無法連線至 Supabase 伺服器，請檢查網路或 .env 設定。';
  if (/invalid login credentials/i.test(message)) return 'Email 或密碼不正確。';
  if (/already registered|user already exists/i.test(message)) return '這個 Email 已經註冊，請改用登入或其他 Email。';
  if (/rate limit/i.test(message)) return '操作太頻繁，請稍後再試。';
  return '操作失敗，請稍後再試。';
}

export function isInvalidSessionError(error: unknown) {
  const value = error as { code?: string; message?: string } | null;
  const code = value?.code ?? '';
  const message = value?.message ?? String(error);
  return code === 'PGRST303'
    || code === 'bad_jwt'
    || /jwt.*(?:future|expired|invalid)|issued at future|invalid.*jwt|token.*expired/i.test(message);
}

export function authRedirectTarget(status: AuthStatus, pathname: string): '/' | '/login' | null {
  if ((status === 'signedOut' || status === 'unverified') && pathname !== '/login') return '/login';
  if (status === 'authenticated' && pathname === '/login') return '/';
  return null;
}
