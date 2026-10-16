import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { listPackingItems } from '@/lib/packing-api';
import { packingProgress } from '@/lib/packing-utils';
import { checkVoucherAvailability } from '@/lib/trip-preparation';
import { canStoreVoucherOffline, createBrowserVoucherFileStore, type VoucherFileStore } from '@/lib/voucher-files';
import type { Voucher } from '@/lib/vouchers';
import { getAppTheme, type AppTheme } from '@/lib/theme';

const files = createBrowserVoucherFileStore();
type Status = { key: string; progress: { total: number; completed: number } | null; tickets: Awaited<ReturnType<typeof checkVoucherAvailability>> | null };
export function TripPreparationOverview({ tripId, userId, vouchers, revision = 0, theme = getAppTheme('light'), onPacking, onDocuments, onVoucher, fileStore = files }: {
  tripId: string; userId: string; vouchers: Voucher[]; revision?: number; theme?: AppTheme;
  onPacking: () => void; onDocuments: () => void; onVoucher: (voucher: Voucher) => void; fileStore?: VoucherFileStore;
}) {
  const [open, setOpen] = useState(false);
  const [focusRevision, setFocusRevision] = useState(0);
  const [status, setStatus] = useState<Status | null>(null);
  const key = `${userId}:${tripId}`;
  const signature = JSON.stringify(vouchers.filter((v) => v?.trip_id === tripId).map((v) => [v.id, v.file_path]));
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const refresh = () => setFocusRevision((v) => v + 1);
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);
  useEffect(() => {
    let active = true;
    setStatus(null);
    const scope = { userId, tripId };
    void Promise.all([
      listPackingItems(tripId, { offlineScope: scope }).then((items) => packingProgress(items)).catch(() => null),
      checkVoucherAvailability(vouchers, scope, fileStore).catch(() => null),
    ]).then(([progress, tickets]) => { if (active) setStatus({ key, progress, tickets }); });
    return () => { active = false; };
  }, [key, signature, revision, focusRevision, fileStore]);
  const current = status?.key === key ? status : null;
  const progressText = !current ? '打包檢查中…' : !current.progress ? '打包狀態無法確認' : current.progress.total === 0 ? '尚未建立打包清單' : `打包 ${current.progress.completed} / ${current.progress.total}`;
  const supported = fileStore !== files || canStoreVoucherOffline();
  const ticketText = !current ? '票券檢查中…' : !supported ? '此裝置不支援離線票券' : !current.tickets || current.tickets.unknown ? '票券離線狀態無法確認' : current.tickets.total === 0 ? '尚未上傳票券' : current.tickets.missingIds.length ? `尚有 ${current.tickets.missingIds.length} 張未離線` : '票券全部已離線';
  const missing = vouchers.find((v) => v.trip_id === tripId && current?.tickets?.missingIds.includes(v.id));
  return <View style={[styles.container, { backgroundColor: theme.colors.card }]}>
    <Pressable accessibilityRole="button" accessibilityLabel={open ? '收合行前準備' : '展開行前準備'} accessibilityState={{ expanded: open }} style={styles.header} onPress={() => setOpen((v) => !v)}><Text style={[styles.title, { color: theme.colors.text }]}>行前準備 {open ? '⌃' : '⌄'}</Text><Text style={[styles.summary, { color: theme.colors.muted }]}>{progressText} · {ticketText}</Text></Pressable>
    {open ? <View style={styles.body}>
      <Text style={[styles.hint, { color: theme.colors.muted }]}>離線票券僅檢查目前裝置，登出後需重新儲存。</Text>
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="前往打包清單" style={[styles.button, { backgroundColor: theme.colors.surfaceMuted }]} onPress={onPacking}><Text style={{ color: theme.colors.primary }}>整理打包清單</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="處理未離線票券" style={[styles.button, { backgroundColor: theme.colors.surfaceMuted }]} onPress={() => missing ? onVoucher(missing) : onDocuments()}><Text style={{ color: theme.colors.primary }}>{missing ? '儲存下一張票券' : '查看預約與票券'}</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="重新檢查行前準備" style={styles.button} onPress={() => setFocusRevision((v) => v + 1)}><Text style={{ color: theme.colors.muted }}>重新檢查</Text></Pressable>
      </View>
    </View> : null}
  </View>;
}
const styles = StyleSheet.create({
  container: { borderRadius: 16, marginVertical: 6, overflow: 'hidden' },
  header: { minHeight: 52, padding: 12, gap: 4 }, title: { fontSize: 14, fontWeight: '700' },
  summary: { fontSize: 12, lineHeight: 18 }, body: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  hint: { fontSize: 12, lineHeight: 18 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 22 },
});
