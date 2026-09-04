import { describe, expect, it, vi } from 'vitest';
import {
  createAuthAwareFetch,
  isJwtRecoveryError,
  isJwtRecoveryResponseBody,
  JWT_RECOVERY_MESSAGE,
} from '../lib/supabase-auth-recovery';

describe('Supabase JWT recovery helpers', () => {
  it('recognizes PGRST303 and JWT issued-at-future errors', () => {
    expect(isJwtRecoveryError({ code: 'PGRST303', message: 'JWT issued at future' })).toBe(true);
    expect(isJwtRecoveryError(new Error('JWT issued at future'))).toBe(true);
    expect(isJwtRecoveryError({ code: 'PGRST116', message: 'No rows found' })).toBe(false);
  });

  it('recognizes the REST error response body', () => {
    expect(isJwtRecoveryResponseBody(JSON.stringify({ code: 'PGRST303', message: 'JWT issued at future' }))).toBe(true);
    expect(isJwtRecoveryResponseBody(JSON.stringify({ code: 'PGRST204', message: 'No content' }))).toBe(false);
    expect(JWT_RECOVERY_MESSAGE).toContain('同步裝置時間');
  });

  it('refreshes the session and retries the failed request with the new token', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const baseFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      if (calls.length === 1) {
        return new Response(JSON.stringify({ code: 'PGRST303', message: 'JWT issued at future' }), { status: 401 });
      }
      return new Response('{}', { status: 200 });
    });
    const refreshSession = vi.fn(async () => 'fresh-token');
    const authFetch = createAuthAwareFetch({ baseFetch, refreshSession });

    const response = await authFetch('https://example.supabase.co/rest/v1/trips', {
      headers: { Authorization: 'Bearer stale-token' },
    });

    expect(response.status).toBe(200);
    expect(refreshSession).toHaveBeenCalledTimes(1);
    expect(new Headers(calls[1].init?.headers).get('Authorization')).toBe('Bearer fresh-token');
  });

  it('notifies recovery when refreshing fails and avoids retrying auth endpoints', async () => {
    const baseFetch = vi.fn(async () => new Response(JSON.stringify({ code: 'PGRST303' }), { status: 401 }));
    const onRecoveryRequired = vi.fn();
    const authFetch = createAuthAwareFetch({
      baseFetch,
      refreshSession: async () => null,
      onRecoveryRequired,
    });

    await authFetch('https://example.supabase.co/auth/v1/token', { method: 'POST' });
    expect(baseFetch).toHaveBeenCalledTimes(1);
    expect(onRecoveryRequired).not.toHaveBeenCalled();

    await authFetch('https://example.supabase.co/rest/v1/trips');
    expect(baseFetch).toHaveBeenCalledTimes(2);
    expect(onRecoveryRequired).toHaveBeenCalledTimes(1);
  });

  it('recovers an auth user request without recursing into the token endpoint', async () => {
    const calls: Array<{ input: RequestInfo | URL; init?: RequestInit }> = [];
    const baseFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ input, init });
      return calls.length === 1
        ? new Response(JSON.stringify({ code: 'PGRST303', message: 'JWT issued at future' }), { status: 401 })
        : new Response('{}', { status: 200 });
    });
    const authFetch = createAuthAwareFetch({ baseFetch, refreshSession: async () => 'fresh-token' });

    const response = await authFetch('https://example.supabase.co/auth/v1/user', {
      headers: { Authorization: 'Bearer stale-token' },
    });

    expect(response.status).toBe(200);
    expect(calls).toHaveLength(2);
  });

  it('reports a JWT recovery error when the refresh token itself fails', async () => {
    const baseFetch = vi.fn(async () => new Response(JSON.stringify({ code: 'PGRST303' }), { status: 401 }));
    const onRecoveryRequired = vi.fn();
    const authFetch = createAuthAwareFetch({
      baseFetch,
      refreshSession: async () => { throw new Error('invalid refresh token'); },
      onRecoveryRequired,
    });

    await authFetch('https://example.supabase.co/rest/v1/trips');

    expect(isJwtRecoveryError(onRecoveryRequired.mock.calls[0]?.[0])).toBe(true);
  });
});
