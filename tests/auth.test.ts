import { describe, expect, it } from 'vitest';
import { authRedirectTarget, authStatus, friendlyAuthError, isInvalidSessionError } from '../lib/auth';

describe('auth helpers', () => {
  it('classifies an unverified user', () => expect(authStatus({ id: '1', email_confirmed_at: null })).toBe('unverified'));
  it('classifies an authenticated verified user', () => expect(authStatus({ id: '1', email_confirmed_at: 'now' })).toBe('authenticated'));
  it('translates invalid credentials', () => expect(friendlyAuthError(new Error('Invalid login credentials'))).toBe('Email 或密碼不正確。'));
  it('explains an already registered email', () => expect(friendlyAuthError(new Error('User already registered'))).toContain('請改用登入或其他 Email'));
  it('explains a network fetch failure', () => expect(friendlyAuthError(new TypeError('Failed to fetch'))).toBe('無法連線至 Supabase 伺服器，請檢查網路或 .env 設定。'));
  it('explains a JWT clock-skew failure and asks for time synchronization', () => {
    expect(friendlyAuthError({ code: 'PGRST303', message: 'JWT issued at future' })).toContain('同步裝置時間');
  });
  it('recognizes a future-issued JWT as an invalid local session', () => {
    expect(isInvalidSessionError({ code: 'PGRST303', message: 'JWT issued at future' })).toBe(true);
  });
  it('does not clear a session for an unrelated network failure', () => {
    expect(isInvalidSessionError(new TypeError('Failed to fetch'))).toBe(false);
  });
  it('redirects signed-out protected routes without rendering them', () => {
    expect(authRedirectTarget('signedOut', '/trips/1')).toBe('/login');
    expect(authRedirectTarget('signedOut', '/login')).toBeNull();
  });
});
