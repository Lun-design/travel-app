import React, { useEffect, useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { deleteVoucher, getVoucherPreviewUrl, listVouchers } from '@/lib/vouchers-api';
import type { Voucher } from '@/lib/vouchers';
import type { ItineraryItem } from '@/lib/itinerary';
import { VoucherPreviewModal } from './VoucherPreviewModal';
import { VoucherUploadModal } from './VoucherUploadModal';
import { PuppyMascot } from './PuppyMascot';
import { EDITORIAL_COLORS, getThemeForMode, type ThemeMode } from '@/lib/theme';

export function VouchersPanel({ tripId, userId, items, themeMode = 'system' }: { tripId: string; userId: string; items: ItineraryItem[]; themeMode?: ThemeMode }) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Voucher | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  async function load() {
    try {
      const nextVouchers = await listVouchers(tripId);
      setVouchers(nextVouchers);
      const signedEntries = await Promise.all(nextVouchers
        .filter((voucher) => voucher.file_type === 'image' && Boolean(voucher.file_path))
        .map(async (voucher) => {
          try { return [voucher.id, await getVoucherPreviewUrl(voucher)] as const; }
          catch { return null; }
        }));
      setPreviewUrls(Object.fromEntries(signedEntries.filter((entry): entry is readonly [string, string] => Boolean(entry))));
    } catch (error: any) {
      setToast(error?.message ? `載入票券失敗：${error.message}` : '載入票券失敗，請稍後再試。');
    }
  }
  useEffect(() => { void load(); }, [tripId]);
  useEffect(() => {
    if (!toast) return;
    const timeout = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(timeout);
  }, [toast]);

  const itemName = (itemId: string | null) => itemId ? items.find((item) => item.id === itemId)?.location_name ?? '已綁定行程項目' : '未綁定行程項目';
  async function remove(voucher: Voucher) {
    try {
      await deleteVoucher({ id: voucher.id, file_path: voucher.file_path });
      setVouchers((current) => current.filter((entry) => entry.id !== voucher.id));
      setPreviewUrls((current) => {
        const next = { ...current };
        delete next[voucher.id];
        return next;
      });
      if (preview?.id === voucher.id) setPreview(null);
      setToast('票券已刪除。');
      await load();
    } catch (error: any) {
      setToast(error?.message ? `刪除票券失敗：${error.message}` : '刪除票券失敗，請稍後再試。');
    }
  }

  return <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.colors.background }]} style={{ backgroundColor: theme.colors.background }}>
    {toast ? <Pressable accessibilityRole="alert" style={styles.toast} onPress={() => setToast(null)}><Text style={styles.toastText}>{toast}</Text></Pressable> : null}
    <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.title}>🎫 預約與票券</Text><Text style={styles.subtitle}>集中管理門票、機票 QR Code 與飯店預約單。</Text></View><Pressable style={styles.upload} onPress={() => setUploading(true)}><Text style={styles.white}>＋ 新增</Text></Pressable></View>
    {vouchers.length ? vouchers.map((voucher) => <View key={voucher.id} style={styles.card}><Pressable style={styles.info} onPress={() => setPreview(voucher)}>{voucher.file_type === 'image' && previewUrls[voucher.id] ? <Image source={{ uri: previewUrls[voucher.id] }} accessibilityLabel={`${voucher.title} 預覽縮圖`} resizeMode="cover" style={styles.thumbnail} /> : <View style={styles.iconBox}><Text style={styles.icon}>{voucher.file_type === 'pdf' ? '📄' : '🖼️'}</Text></View>}<View style={styles.content}><Text numberOfLines={2} style={styles.name}>{voucher.title}</Text><Text numberOfLines={2} style={styles.meta}>{voucher.file_type.toUpperCase()} · {itemName(voucher.item_id)}</Text></View></Pressable><Pressable style={styles.deleteButton} onPress={(event) => { event.stopPropagation(); void Alert.alert('刪除票券', `確定要刪除「${voucher.title}」嗎？`, [{ text: '取消' }, { text: '刪除', style: 'destructive', onPress: () => void remove(voucher) }]); }}><Text style={styles.delete}>刪除</Text></Pressable></View>) : <View style={styles.empty}><PuppyMascot puppy="-6" size={165} accessibilityLabel="目前沒有預約票券" /><Text style={styles.subtitle}>目前還沒有預約或票券</Text></View>}
    <VoucherUploadModal visible={uploading} tripId={tripId} userId={userId} items={items} onClose={() => setUploading(false)} onUploaded={load} />
    <VoucherPreviewModal voucher={preview} onClose={() => setPreview(null)} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: 4, paddingBottom: 100, gap: 10 },
  header: { width: '100%', maxWidth: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 21, fontWeight: '800' },
  subtitle: { color: EDITORIAL_COLORS.taupe, marginTop: 3 },
  upload: { flexShrink: 0, minHeight: 44, justifyContent: 'center', backgroundColor: EDITORIAL_COLORS.terracotta, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10 },
  white: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
  card: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', flexDirection: 'row', alignItems: 'center', backgroundColor: EDITORIAL_COLORS.paper, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: EDITORIAL_COLORS.line },
  info: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  thumbnail: { width: 58, height: 58, flexShrink: 0, borderRadius: 9, backgroundColor: EDITORIAL_COLORS.sand },
  iconBox: { width: 58, height: 58, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: EDITORIAL_COLORS.sand },
  icon: { fontSize: 26 },
  content: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '800' },
  meta: { color: EDITORIAL_COLORS.taupe, fontSize: 12, marginTop: 3 },
  deleteButton: { flexShrink: 0, marginLeft: 8, minHeight: 44, minWidth: 52, zIndex: 2, elevation: 2 },
  delete: { color: EDITORIAL_COLORS.dangerText, fontSize: 13, fontWeight: '700', minHeight: 44, paddingVertical: 12 },
  toast: { width: '100%', minHeight: 42, justifyContent: 'center', borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: EDITORIAL_COLORS.sand },
  toastText: { color: EDITORIAL_COLORS.charcoal, fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 45, gap: 8 },
  emptyIcon: { fontSize: 36 },
});
