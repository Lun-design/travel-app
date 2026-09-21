import React, { useEffect, useState } from 'react';
import { Modal, Image, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { deleteVoucher, getVoucherPreviewUrl, listVouchers, updateVoucher } from '@/lib/vouchers-api';
import type { Voucher } from '@/lib/vouchers';
import type { ItineraryItem } from '@/lib/itinerary';
import { VoucherPreviewModal } from './VoucherPreviewModal';
import { VoucherUploadModal } from './VoucherUploadModal';
import { VoucherMetadataModal } from './VoucherMetadataModal';
import { PuppyMascot } from './PuppyMascot';
import { EDITORIAL_COLORS, getThemeForMode, type ThemeMode } from '@/lib/theme';
import { updateItineraryItemReservationTags } from '@/lib/itinerary-api';
import { normalizeReservationTags } from '@/lib/reservation-tags';

export function VouchersPanel({ tripId, userId, items, themeMode = 'system', onChanged }: { tripId: string; userId: string; items: ItineraryItem[]; themeMode?: ThemeMode; onChanged?: () => void | Promise<void> }) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [previewUrls, setPreviewUrls] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Voucher | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Voucher | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [bindingVoucher, setBindingVoucher] = useState<Voucher | null>(null);
  const [bindingDay, setBindingDay] = useState(1);
  const [bindingItemId, setBindingItemId] = useState<string | null>(null);
  const [bindingBusy, setBindingBusy] = useState(false);
  const [editingVoucher, setEditingVoucher] = useState<Voucher | null>(null);

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
  const days = Array.from(new Set(items.map((item) => Number(item.day_number)).filter((day) => Number.isFinite(day) && day > 0))).sort((a, b) => a - b);
  const bindingItems = items.filter((item) => item.day_number === bindingDay);

  function openBinding(voucher: Voucher) {
    setBindingVoucher(voucher);
    const initialItem = items.find((item) => item.id === voucher.item_id) ?? null;
    setBindingDay(initialItem?.day_number ?? days[0] ?? 1);
    setBindingItemId(voucher.item_id);
  }

  async function bindVoucher() {
    if (!bindingVoucher || bindingBusy) return;
    setBindingBusy(true);
    try {
      const updated = await updateVoucher(bindingVoucher.id, { item_id: bindingItemId });
      if (bindingItemId) {
        const target = items.find((item) => item.id === bindingItemId);
        const tags = normalizeReservationTags(target?.reservation_tags);
        if (!tags.includes('ticketed')) await updateItineraryItemReservationTags(bindingItemId, [...tags, 'ticketed']);
      }
      setVouchers((current) => current.map((entry) => entry.id === updated.id ? { ...entry, ...updated } : entry));
      setBindingVoucher(null);
      await onChanged?.();
    } catch (error: any) {
      setToast(error?.message ? `綁定景點失敗：${error.message}` : '綁定景點失敗，請稍後再試。');
    } finally {
      setBindingBusy(false);
    }
  }
  async function remove(voucher: Voucher) {
    if (deleting) return;
    setDeleting(true);
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
      setPendingDelete(null);
      await onChanged?.();
    } catch (error: any) {
      setToast(error?.message ? `刪除票券失敗：${error.message}` : '刪除票券失敗，請稍後再試。');
    } finally {
      setDeleting(false);
    }
  }

  return <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.colors.background }]} style={{ backgroundColor: theme.colors.background }}>
    {toast ? <Pressable accessibilityRole="alert" style={styles.toast} onPress={() => setToast(null)}><Text style={styles.toastText}>{toast}</Text></Pressable> : null}
    <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.title}>🎫 預約與票券</Text><Text style={styles.subtitle}>集中管理門票、機票 QR Code 與飯店預約單。</Text></View><Pressable style={styles.upload} onPress={() => setUploading(true)}><Text style={styles.white}>＋ 新增</Text></Pressable></View>
    {vouchers.length ? vouchers.map((voucher) => <View key={voucher.id} style={styles.card}><Pressable style={styles.info} onPress={() => setPreview(voucher)}>{voucher.file_type === 'image' && previewUrls[voucher.id] ? <Image source={{ uri: previewUrls[voucher.id] }} accessibilityLabel={`${voucher.title} 預覽縮圖`} resizeMode="cover" style={styles.thumbnail} /> : <View style={styles.iconBox}><Text style={styles.icon}>{voucher.file_type === 'pdf' ? '📄' : '🖼️'}</Text></View>}<View style={styles.content}><Text numberOfLines={2} style={styles.name}>{voucher.title}</Text><Text numberOfLines={2} style={styles.meta}>{voucher.file_type.toUpperCase()} · {itemName(voucher.item_id)}</Text>{voucher.reservation_number ? <Text numberOfLines={1} style={styles.meta}>預約編號：{voucher.reservation_number}</Text> : null}{voucher.usage_at ? <Text numberOfLines={1} style={styles.meta}>使用時間：{voucher.usage_at.replace('T', ' ').slice(0, 16)}</Text> : null}{voucher.notes ? <Text numberOfLines={1} style={styles.meta}>{voucher.notes}</Text> : null}</View></Pressable><View style={styles.cardActions}><Pressable accessibilityRole="button" style={styles.bindButton} onPress={() => setEditingVoucher(voucher)}><Text style={styles.bindText}>編輯資料</Text></Pressable><Pressable accessibilityRole="button" style={styles.bindButton} onPress={() => openBinding(voucher)}><Text style={styles.bindText}>{voucher.item_id ? '重新綁定景點' : '綁定至景點'}</Text></Pressable><Pressable style={styles.deleteButton} onPress={(event) => { event.stopPropagation(); setToast(null); setPendingDelete(voucher); }}><Text style={styles.delete}>刪除</Text></Pressable></View></View>) : <View style={styles.empty}><PuppyMascot puppy="-6" size={165} accessibilityLabel="目前沒有預約票券" /><Text style={styles.subtitle}>目前還沒有預約或票券</Text></View>}
    <Modal transparent visible={pendingDelete !== null} animationType="fade" onRequestClose={() => { if (!deleting) setPendingDelete(null); }}>
      <View style={styles.confirmOverlay}><View style={styles.confirmCard}>
        <Text style={styles.title}>刪除票券</Text>
        <Text>確定要刪除「{pendingDelete?.title}」嗎？</Text>
        {toast ? <Text accessibilityRole="alert" style={styles.toastText}>{toast}</Text> : null}
        <Pressable accessibilityRole="button" disabled={deleting} style={styles.deleteButton} onPress={() => { if (pendingDelete) void remove(pendingDelete); }}><Text style={styles.delete}>{deleting ? '刪除中…' : '確認刪除'}</Text></Pressable>
        <Pressable accessibilityRole="button" disabled={deleting} style={styles.deleteButton} onPress={() => setPendingDelete(null)}><Text>取消</Text></Pressable>
      </View></View>
    </Modal>
    <Modal transparent visible={bindingVoucher !== null} animationType="fade" onRequestClose={() => { if (!bindingBusy) setBindingVoucher(null); }}>
      <View style={styles.confirmOverlay}><View style={styles.confirmCard}>
        <Text style={styles.title}>綁定至行程景點</Text>
        <Text style={styles.meta}>{bindingVoucher?.title}</Text>
        <Text style={styles.label}>選擇 Day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayChips}>{(days.length ? days : [1]).map((day) => <Pressable key={day} style={[styles.chip, day === bindingDay && styles.chipSelected]} onPress={() => { setBindingDay(day); setBindingItemId(null); }}><Text style={day === bindingDay ? styles.white : undefined}>Day {day}</Text></Pressable>)}</ScrollView>
        <Text style={styles.label}>選擇景點</Text>
        <ScrollView style={styles.bindingList}>{bindingItems.map((item) => <Pressable key={item.id} style={[styles.bindingOption, item.id === bindingItemId && styles.chipSelected]} onPress={() => setBindingItemId(item.id)}><Text style={item.id === bindingItemId ? styles.white : undefined}>{item.time ? `${item.time} · ` : ''}{item.location_name}</Text></Pressable>)}</ScrollView>
        <View style={styles.modalActions}><Pressable disabled={bindingBusy} style={styles.deleteButton} onPress={() => setBindingVoucher(null)}><Text>取消</Text></Pressable><Pressable disabled={bindingBusy} style={styles.bindButton} onPress={() => void bindVoucher()}><Text style={styles.bindText}>{bindingBusy ? '儲存中…' : '確認綁定'}</Text></Pressable></View>
      </View></View>
    </Modal>
    <VoucherUploadModal visible={uploading} tripId={tripId} userId={userId} items={items} onClose={() => setUploading(false)} onUploaded={async () => { await load(); await onChanged?.(); }} />
    <VoucherMetadataModal visible={editingVoucher !== null} voucher={editingVoucher} onClose={() => setEditingVoucher(null)} onSaved={async (updated) => { setVouchers((current) => current.map((entry) => entry.id === updated.id ? { ...entry, ...updated } : entry)); await onChanged?.(); }} />
    <VoucherPreviewModal voucher={preview} onClose={() => setPreview(null)} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  confirmOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  confirmCard: { width: '100%', maxWidth: 420, padding: 24, gap: 16, backgroundColor: EDITORIAL_COLORS.paper, borderRadius: 14 },
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
  label: { color: EDITORIAL_COLORS.charcoal, fontWeight: '700', marginTop: 4 },
  cardActions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, marginLeft: 8 },
  bindButton: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 9, backgroundColor: EDITORIAL_COLORS.sand },
  bindText: { color: EDITORIAL_COLORS.terracotta, fontWeight: '800', fontSize: 12 },
  dayChips: { gap: 8, paddingVertical: 4 },
  chip: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 9, backgroundColor: EDITORIAL_COLORS.sand },
  chipSelected: { backgroundColor: EDITORIAL_COLORS.terracotta },
  bindingList: { maxHeight: 220 },
  bindingOption: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 9, backgroundColor: EDITORIAL_COLORS.sand, marginBottom: 6 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10, marginTop: 8 },
  deleteButton: { flexShrink: 0, marginLeft: 8, minHeight: 44, minWidth: 52, zIndex: 2, elevation: 2 },
  delete: { color: EDITORIAL_COLORS.dangerText, fontSize: 13, fontWeight: '700', minHeight: 44, paddingVertical: 12 },
  toast: { width: '100%', minHeight: 42, justifyContent: 'center', borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 9, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: EDITORIAL_COLORS.sand },
  toastText: { color: EDITORIAL_COLORS.charcoal, fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 45, gap: 8 },
  emptyIcon: { fontSize: 36 },
});
