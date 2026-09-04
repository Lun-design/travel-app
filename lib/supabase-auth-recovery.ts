export const JWT_RECOVERY_MESSAGE = '登入憑證時間尚未同步或已失效，系統已嘗試重新整理；請同步裝置時間後重新登入。';

type ErrorLike = {
  code?: unknown;
  error_code?: unknown;
  message?: unknown;
  error?: unknown;
};

function errorText(error: unknown): { code: string; message: string } {
  if (typeof error === 'string') return { code: '', message: error };
  const value = error as ErrorLike | null;
  return {
    code: typeof value?.code === 'string' ? value.code : typeof value?.error_code === 'string' ? value.error_code : '',
    message: typeof value?.message === 'string'
      ? value.message
      : typeof value?.error === 'string'
        ? value.error
        : String(error),
  };
}

/** Identify Supabase/PostgREST responses caused by an invalid or skewed JWT. */
export function isJwtRecoveryError(error: unknown): boolean {
  const { code, message } = errorText(error);
  return code.toUpperCase() === 'PGRST303'
    || code.toLowerCase() === 'bad_jwt'
    || /jwt.*(?:future|expired|invalid)|issued\s+at\s+future|invalid.*jwt|token.*expired/i.test(message);
}

export function isJwtRecoveryResponseBody(body: string): boolean {
  try {
    const parsed: unknown = JSON.parse(body);
    if (isJwtRecoveryError(parsed)) return true;
  } catch {
    // Some gateways return a plain-text error body; inspect it below.
  }
  return /PGRST303|JWT\s+issued\s+at\s+future|invalid\s+JWT|token\s+expired/i.test(body);
}

function recoveryNotice(cause?: unknown) {
  return { code: 'PGRST303', message: JWT_RECOVERY_MESSAGE, cause };
}

async function isJwtRecoveryResponse(response: Response): Promise<boolean> {
  try {
    return isJwtRecoveryResponseBody(await response.clone().text());
  } catch {
    return false;
  }
}

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function isAuthRequest(input: RequestInfo | URL): boolean {
  // Only the token endpoint is excluded; retrying it would recurse into the
  // same refresh flow. `/auth/v1/user` and REST requests remain recoverable.
  return /\/auth\/v1\/token(?:[/?]|$)/i.test(requestUrl(input));
}

function cloneRequest(input: RequestInfo | URL): RequestInfo | URL | null {
  return typeof Request !== 'undefined' && input instanceof Request ? input.clone() : null;
}

function requestHeaders(input: RequestInfo | URL): HeadersInit | undefined {
  return typeof Request !== 'undefined' && input instanceof Request ? input.headers : undefined;
}

export type AuthAwareFetchOptions = {
  baseFetch: typeof fetch;
  refreshSession: () => Promise<string | null>;
  onRecoveryRequired?: (error: unknown) => void;
};

/**
 * Wrap Supabase REST requests with one guarded JWT refresh/retry.
 * Auth endpoints are excluded to avoid recursively refreshing the refresh call.
 */
export function createAuthAwareFetch({ baseFetch, refreshSession, onRecoveryRequired }: AuthAwareFetchOptions): typeof fetch {
  let refreshPromise: Promise<string | null> | null = null;

  const refreshOnce = () => {
    if (!refreshPromise) {
      refreshPromise = refreshSession().finally(() => {
        refreshPromise = null;
      });
    }
    return refreshPromise;
  };

  const notifyRecovery = (error: unknown) => {
    try {
      onRecoveryRequired?.(error);
    } catch (listenerError) {
      console.error('[Supabase] JWT recovery listener failed', listenerError);
    }
  };

  return async (input, init) => {
    const retryInput = cloneRequest(input);
    const response = await baseFetch(input, init);
    if (isAuthRequest(input) || !(await isJwtRecoveryResponse(response))) return response;

    let accessToken: string | null;
    try {
      accessToken = await refreshOnce();
    } catch (error) {
      notifyRecovery(recoveryNotice(error));
      return response;
    }
    if (!accessToken) {
      notifyRecovery(recoveryNotice());
      return response;
    }

    const headers = new Headers(requestHeaders(input));
    if (init?.headers) {
      new Headers(init.headers).forEach((value, key) => headers.set(key, value));
    }
    headers.set('Authorization', `Bearer ${accessToken}`);

    try {
      const retried = await baseFetch(retryInput ?? input, { ...init, headers });
      if (await isJwtRecoveryResponse(retried)) notifyRecovery(recoveryNotice());
      return retried;
    } catch {
      // Preserve the original Supabase response so callers still receive its
      // structured error while AuthGate handles the recovery notification.
      notifyRecovery(recoveryNotice());
      return response;
    }
  };
}
