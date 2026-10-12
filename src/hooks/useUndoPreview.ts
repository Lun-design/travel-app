import { useCallback, useEffect, useRef, useState } from 'react';
import { createUndoController, type UndoAction } from '@/lib/undo-sync';

export type PreviewAction<T> = UndoAction & { apply: (items: T[]) => T[]; returnDay?: number };

/** Keep the undo preview separate from server data so reload/Realtime cannot
 * lose it, and undo never writes an old full-row snapshot over a teammate's edit. */
export function useUndoPreview<T>(scope: string, items: T[], onError: (error: unknown) => void) {
  const [pendingState, setPending] = useState<{ scope: string; action: PreviewAction<T> } | null>(null);
  const controllerRef = useRef<ReturnType<typeof createUndoController<PreviewAction<T>>> | null>(null);
  useEffect(() => {
    let active = true;
    const controller = createUndoController<PreviewAction<T>>({
      onChange: (action) => { if (active) setPending(action ? { scope, action } : null); },
      onError: (error) => { if (active) onError(error); },
    });
    controllerRef.current = controller;
    setPending(null);
    const flushOnHide = () => {
      if (typeof document === 'undefined' || document.visibilityState === 'hidden') void controller.flush().catch(() => undefined);
    };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', flushOnHide);
    return () => {
      active = false;
      if (controllerRef.current === controller) controllerRef.current = null;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', flushOnHide);
      void controller.dispose().catch(() => undefined);
    };
  }, [scope, onError]);
  const stage = useCallback((action: PreviewAction<T>) => controllerRef.current?.stage(action) ?? Promise.resolve(), []);
  const undo = useCallback(() => controllerRef.current?.undo() ?? false, []);
  const flush = useCallback(() => controllerRef.current?.flush() ?? Promise.resolve(), []);
  const pending = pendingState?.scope === scope ? pendingState.action : null;
  return {
    items: pending ? pending.apply(items) : items,
    label: pending?.label ?? '',
    pending: Boolean(pending),
    returnDay: pending?.returnDay,
    stage,
    undo,
    flush,
  };
}
