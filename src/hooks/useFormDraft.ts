import { useEffect, useRef, useState } from 'react';
import { browserDraftStorage, draftKey, readDraft, removeMatchingDraft, serializeDraft, writeDraft, type DraftData, type DraftScope, type DraftStorage } from '@/lib/form-drafts';

type Options = { visible: boolean; scope: DraftScope; initial: DraftData; value: DraftData; onRestore: (data: DraftData) => void; onClose: () => void; busy?: boolean; storage?: DraftStorage | null; validate?: (value: DraftData) => boolean };
function json(value: DraftData) { try { return serializeDraft(value); } catch { return null; } }
export function useFormDraft({ visible, scope, initial, value, onRestore, onClose, busy = false, storage, validate }: Options) {
  const key = draftKey(scope), store = storage === undefined ? browserDraftStorage() : storage;
  const identity = key ?? `${scope.form}:${scope.recordId}:${scope.tripId}`;
  const baseline = useRef({ identity, value: initial });
  const pendingLeave = useRef<(() => void) | null>(null);
  const [ready, setReady] = useState<string | null>(null);
  const [recovery, setRecovery] = useState<ReturnType<typeof readDraft>>(null);
  const [confirmClose, setConfirmClose] = useState(false);
  const [status, setStatus] = useState('');
  const latest = useRef({ value, initial, busy, onClose, onRestore, validate });
  latest.current = { value, initial, busy, onClose, onRestore, validate };
  const valueJson = json(value);
  const dirty = ready === identity && (valueJson === null || valueJson !== json(baseline.current.value));

  useEffect(() => {
    setConfirmClose(false); setRecovery(null); setStatus(''); setReady(null);
    pendingLeave.current = null;
    if (!visible) return;
    baseline.current = { identity, value: initial };
    try { if (key && store) { const found = readDraft(store, key, initial); setRecovery(found && scope.recordId === 'new' ? { ...found, conflict: false } : found); } }
    catch { setStatus('尚未保留草稿：此裝置無法讀取本機儲存。'); }
    setReady(identity);
  }, [visible, identity, store]);

  function persist(data = latest.current.value): boolean {
    try {
      if (!key || !store) throw new Error('此裝置無法儲存本機草稿。');
      writeDraft(store, key, baseline.current.value, data);
      setStatus('已保留本機草稿 · 尚未送出儲存，不代表已同步');
      return true;
    } catch { setStatus('尚未保留草稿：裝置儲存不可用或資料格式尚未完成，請勿直接關閉。'); return false; }
  }
  useEffect(() => {
    if (!visible || ready !== identity || recovery || busy) return;
    if (dirty) persist(value);
    else {
      try { if (key && store) store.removeItem(key); } catch { /* No unsaved data to lose. */ }
      setStatus('');
    }
  }, [visible, identity, ready, valueJson, recovery, busy, store]);

  useEffect(() => {
    if (!visible || typeof window === 'undefined') return;
    const flush = () => {
      if (ready === identity && !recovery && json(latest.current.value) !== json(baseline.current.value)) persist();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (ready !== identity || recovery || json(latest.current.value) === json(baseline.current.value)) return;
      flush(); event.preventDefault(); event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('pagehide', flush);
    const hidden = () => { if (document.visibilityState === 'hidden') flush(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', hidden);
    return () => { window.removeEventListener('beforeunload', beforeUnload); window.removeEventListener('pagehide', flush); if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', hidden); };
  }, [visible, identity, ready, recovery, store]);

  function restore() {
    if (!key || !store || !recovery || busy) return;
    try {
      const current = readDraft(store, key, latest.current.initial);
      if (!current) { setRecovery(null); return; }
      if (current.conflict && scope.recordId !== 'new') { setRecovery(current); setStatus('線上資料已更新，不能直接恢復舊草稿。請捨棄舊稿後重新編輯。'); return; }
      if (validate && !validate(current.data)) { setStatus('草稿格式已不相容，請捨棄後重新編輯。'); return; }
      onRestore(current.data); setRecovery(null); setStatus('已恢復本機草稿 · 尚未送出儲存，不代表已同步');
    } catch { setStatus('無法恢復草稿，原表單已保留。'); }
  }
  function discardRecovery() {
    try { if (key && store) store.removeItem(key); setRecovery(null); setStatus(''); }
    catch { setStatus('無法清除本機草稿，請稍後再試。'); }
  }
  function requestClose() {
    if (latest.current.busy) { setStatus('儲存處理中，請稍候。'); return; }
    if (dirty) setConfirmClose(true); else onClose();
  }
  function finishClose() { const leave = pendingLeave.current; pendingLeave.current = null; onClose(); leave?.(); }
  function requestLeave(leave: () => void) {
    if (latest.current.busy) { setStatus('儲存處理中，請稍候再離開。'); return; }
    pendingLeave.current = leave;
    if (dirty) setConfirmClose(true); else finishClose();
  }
  function keepAndClose() { if (!latest.current.busy && persist()) { setConfirmClose(false); finishClose(); } }
  function discardAndClose() {
    if (latest.current.busy) return;
    try { if (key && store) store.removeItem(key); baseline.current = { identity, value: latest.current.value }; setConfirmClose(false); finishClose(); }
    catch { setStatus('無法清除本機草稿，請稍後再試。'); }
  }
  /** Captures this rendered submission, so an old request cannot clear a newly entered draft. */
  function markSaved(nextBaseline?: DraftData) {
    try { if (key && store) removeMatchingDraft(store, key, recovery?.data ?? value); } catch { setStatus('資料已儲存，但本機草稿清理失敗。'); }
    if (baseline.current.identity === identity && json(latest.current.value) === valueJson) {
      baseline.current = { identity, value: nextBaseline ?? value }; setRecovery(null); setConfirmClose(false); setStatus('');
    }
  }
  return { dirty, recovery, status, confirmClose, shouldBlockNavigation: visible && (dirty || busy), requestClose, requestLeave, keepAndClose, discardAndClose, cancelClose: () => { pendingLeave.current = null; setConfirmClose(false); }, restore, discardRecovery, markSaved };
}
export type FormDraftProtection = ReturnType<typeof useFormDraft>;
