export type UndoAction = { label: string; key?: string; commit: () => Promise<void> };
export function createUndoController<A extends UndoAction = UndoAction>(options: { onChange: (action: A | null) => void; onError: (error: unknown) => void; graceMs?: number }) {
  let pending: A | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let inFlight: Promise<void> | null = null;
  let staging = Promise.resolve();
  let closed = false;
  const clearTimer = () => { if (timer) clearTimeout(timer); timer = null; };
  function flush(): Promise<void> {
    if (inFlight) return inFlight;
    if (!pending) return Promise.resolve();
    clearTimer();
    const action = pending;
    inFlight = Promise.resolve().then(action.commit).catch((error) => {
      options.onError(error);
      throw error;
    }).finally(() => {
      pending = null;
      inFlight = null;
      options.onChange(null);
    });
    return inFlight;
  }
  return {
    stage(action: A): Promise<void> {
      if (closed) return Promise.resolve();
      const next = staging.then(async () => {
        if (pending?.key && pending.key === action.key) return;
        await flush();
        pending = action;
        options.onChange(action);
        timer = setTimeout(() => { void flush().catch(() => undefined); }, options.graceMs ?? 8000);
      });
      staging = next.catch(() => undefined);
      return next;
    },
    undo() {
      if (inFlight || !pending) return false;
      clearTimer();
      pending = null;
      options.onChange(null);
      return true;
    },
    flush,
    async dispose() {
      closed = true;
      await staging;
      await flush();
    },
  };
}
export type SyncInput = { isOffline: boolean; pendingCount: number; syncing?: boolean; undoPending?: boolean; error?: string; conflictCount?: number };
export function isFullySynced(input: SyncInput) {
  return !input.isOffline && input.pendingCount === 0 && !input.syncing && !input.undoPending && !input.error && !input.conflictCount;
}
export function getSyncPresentation(input: SyncInput) {
  if (input.error || input.conflictCount) return { label: '同步失敗，請重試或處理衝突', canRetry: !input.isOffline && !input.syncing };
  if (input.syncing) return { label: '正在同步…', canRetry: false };
  if (input.undoPending) return { label: '變更可復原，稍後自動儲存', canRetry: false };
  if (input.isOffline) return { label: input.pendingCount ? `離線暫存 · ${input.pendingCount} 項待同步` : '離線模式 · 使用快取資料', canRetry: false };
  if (input.pendingCount) return { label: `等待同步 · ${input.pendingCount} 項變更`, canRetry: true };
  return { label: '已同步', canRetry: false };
}
