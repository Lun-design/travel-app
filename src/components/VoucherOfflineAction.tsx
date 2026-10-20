import React, { useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Voucher } from '@/lib/vouchers';
import { canStoreVoucherOffline, createBrowserVoucherFileStore, getVoucherFileKey, saveVoucherOffline, type VoucherFileStore } from '@/lib/voucher-files';
import { getVoucherPreviewUrl } from '@/lib/vouchers-api';
import { EDITORIAL_COLORS } from '@/lib/theme';

const browserFiles = createBrowserVoucherFileStore();
type Status = 'checking' | 'ready' | 'missing' | 'unknown' | 'unsupported';
const labels: Record<Status, string> = {
  checking: '正在檢查離線狀態…', ready: '✓ 已離線備用（此裝置）', missing: '尚未儲存離線備用',
  unknown: '無法確認離線狀態', unsupported: '此裝置不支援離線票券儲存',
};

/** Local device state only; neither checks nor downloads update the voucher DB. */
export function VoucherOfflineAction({ voucher, userId, revision = 0, fileStore = browserFiles }: {
  voucher: Voucher; userId: string; revision?: number; fileStore?: VoucherFileStore;
}) {
  const key = JSON.stringify([userId, voucher.trip_id, voucher.id, voucher.file_path]);
  const activeVisit = useRef({ key, fileStore });
  if (activeVisit.current.key !== key || activeVisit.current.fileStore !== fileStore) activeVisit.current = { key, fileStore };
  const visit = activeVisit.current;
  const [state, setState] = useState({ visit, status: 'checking' as Status, message: '', busy: false });
  const mounted = useRef(true), saving = useRef(false), checkRequest = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const current = () => mounted.current && activeVisit.current === visit;
  const shown = state.visit === visit ? state : { visit, status: 'checking' as Status, message: '', busy: false };
  const identified = Boolean(userId?.trim() && userId !== 'anonymous');
  const scope = { userId, tripId: voucher.trip_id };
  const offline = () => typeof navigator !== 'undefined' && navigator.onLine === false;
  const update = (patch: Partial<Omit<typeof state, 'visit'>>) => {
    if (current()) setState((previous) => ({ ...(previous.visit === visit ? previous : { visit, status: 'checking' as Status, message: '', busy: false }), ...patch }));
  };
  async function exists() {
    const fileKey = getVoucherFileKey(voucher, scope);
    return fileStore.has ? fileStore.has(fileKey) : Boolean(await fileStore.read(fileKey));
  }
  async function check() {
    if (!current() || saving.current) return;
    const request = ++checkRequest.current;
    update({ status: 'checking', message: '' });
    if (!canStoreVoucherOffline()) { update({ status: 'unsupported' }); return; }
    try {
      const ready = await exists();
      if (request === checkRequest.current) update({ status: ready ? 'ready' : 'missing' });
    } catch {
      if (request === checkRequest.current) update({ status: 'unknown', message: '無法確認本機檔案，可重新檢查或連線後重試。' });
    }
  }
  useEffect(() => {
    mounted.current = true; saving.current = false;
    void check();
    const refresh = () => { void check(); };
    const visibility = () => { if (document.visibilityState === 'visible') refresh(); };
    if (typeof window !== 'undefined') { window.addEventListener('focus', refresh); window.addEventListener('online', refresh); }
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility);
    const subscription = AppState?.addEventListener?.('change', (value) => { if (value === 'active') refresh(); });
    return () => {
      mounted.current = false; checkRequest.current++;
      abort.current?.abort(); abort.current = null; saving.current = false;
      if (typeof window !== 'undefined') { window.removeEventListener('focus', refresh); window.removeEventListener('online', refresh); }
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility);
      subscription?.remove();
    };
  }, [key, fileStore]);
  const lastRevision = useRef(revision);
  useEffect(() => {
    if (lastRevision.current !== revision) { lastRevision.current = revision; void check(); }
  }, [revision]);

  async function download() {
    if (!current() || saving.current || !identified || !canStoreVoucherOffline()) return;
    saving.current = true; checkRequest.current++;
    const controller = new AbortController(); abort.current = controller;
    const ownsDownload = () => current() && abort.current === controller && !controller.signal.aborted;
    update({ busy: true, message: '' });
    try {
      await saveVoucherOffline(voucher, scope, { store: fileStore, signal: controller.signal, isOffline: offline(), getRemoteUrl: () => getVoucherPreviewUrl(voucher) });
      const ready = await exists();
      if (!ready) throw new Error('無法確認檔案已儲存，請重試。');
      if (ownsDownload()) update({ status: 'ready', message: '已儲存離線備用，僅限此裝置；登出時會清除。' });
    } catch (cause) {
      if (ownsDownload()) update({ status: 'unknown', message: cause instanceof Error ? cause.message : '儲存失敗，請稍後重試。' });
    } finally {
      if (ownsDownload()) { saving.current = false; abort.current = null; update({ busy: false }); }
    }
  }

  return <View style={styles.container}>
    <Text accessibilityLiveRegion="polite" style={styles.status}>{shown.busy ? '正在儲存離線票券…' : labels[shown.status]}</Text>
    {shown.message ? <Text accessibilityRole={shown.status === 'unknown' ? 'alert' : undefined} style={styles.status}>{shown.message}</Text> : null}
    {identified && (shown.status === 'missing' || shown.status === 'unknown' || shown.busy) ? <Pressable accessibilityRole="button" accessibilityLabel={`儲存離線備用：${voucher.title}`} accessibilityState={{ busy: shown.busy }} disabled={shown.busy} style={styles.button} onPress={() => void download()}><Text style={styles.action}>{shown.busy ? '儲存中…' : '儲存離線備用'}</Text></Pressable> : null}
    {shown.status === 'unknown' ? <Pressable accessibilityRole="button" accessibilityLabel={`重新檢查離線狀態：${voucher.title}`} style={styles.button} onPress={() => void check()}><Text style={styles.action}>重新檢查</Text></Pressable> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  status: { flexShrink: 1, color: EDITORIAL_COLORS.taupe, fontSize: 12 },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 22, backgroundColor: EDITORIAL_COLORS.sand },
  action: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '700' },
});
