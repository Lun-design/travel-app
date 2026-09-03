import { describe, expect, it } from 'vitest';
import { authStatus, friendlyAuthError } from '../lib/auth';

describe('auth helpers', () => {
  it('classifies an unverified user', () => expect(authStatus({ id: '1', email_confirmed_at: null })).toBe('unverified'));
  it('classifies an authenticated verified user', () => expect(authStatus({ id: '1', email_confirmed_at: 'now' })).toBe('authenticated'));
  it('translates invalid credentials', () => expect(friendlyAuthError(new Error('Invalid login credentials'))).toBe('Email 或密碼不正確。'));
});
