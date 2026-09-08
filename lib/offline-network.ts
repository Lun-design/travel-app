export type NetworkEnvironment = {
  navigator?: { onLine?: boolean };
  addEventListener?: (event: 'online' | 'offline', listener: () => void) => void;
  removeEventListener?: (event: 'online' | 'offline', listener: () => void) => void;
};

function resolveEnvironment(environment?: NetworkEnvironment): NetworkEnvironment | undefined {
  if (environment) return environment;
  if (typeof window !== 'undefined') return window;
  return undefined;
}

export function getInitialOfflineState(environment?: NetworkEnvironment): boolean {
  return resolveEnvironment(environment)?.navigator?.onLine === false;
}

export function subscribeToNetworkStatus(onChange: (isOffline: boolean) => void, environment?: NetworkEnvironment): () => void {
  const resolved = resolveEnvironment(environment);
  if (!resolved?.addEventListener) return () => undefined;
  const handleOnline = () => onChange(false);
  const handleOffline = () => onChange(true);
  resolved.addEventListener('online', handleOnline);
  resolved.addEventListener('offline', handleOffline);
  return () => {
    resolved.removeEventListener?.('online', handleOnline);
    resolved.removeEventListener?.('offline', handleOffline);
  };
}
