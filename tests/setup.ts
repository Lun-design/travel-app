import { beforeEach, vi } from 'vitest';

export const blockedNetworkFetch = vi.fn(async (input: RequestInfo | URL) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  throw new Error(`[Test Network Guard] 未 Mock 的外部網路請求已封鎖：${url}`);
});

function installNetworkGuard() {
  vi.stubGlobal('fetch', blockedNetworkFetch);
}

// Run before test modules are imported so module-level clients cannot capture
// Node's real fetch implementation. Individual tests may still stub fetch.
installNetworkGuard();
beforeEach(() => {
  blockedNetworkFetch.mockClear();
  installNetworkGuard();
});
