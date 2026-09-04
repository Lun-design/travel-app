import React, { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { deleteVoucher, listVouchers } from '@/lib/vouchers-api';
import type { Voucher } from '@/lib/vouchers';
import type { ItineraryItem } from '@/lib/itinerary';
import { VoucherPreviewModal } from './VoucherPreviewModal';
import { VoucherUploadModal } from './VoucherUploadModal';
import { PuppyMascot } from './PuppyMascot';

export function VouchersPanel({ tripId, userId, items }: { tripId: string; userId: string; items: ItineraryItem[] }) {
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<Voucher | null>(null);

  async function load() {
    try { setVouchers(await listVouchers(tripId)); }
    catch (error: any) { Alert.alert('載入票券失敗', error?.message ?? '請稍後再試。'); }
  }
  useEffect(() => { void load(); }, [tripId]);

  const itemName = (itemId: string | null) => itemId ? items.find((item) => item.id === itemId)?.location_name ?? '已綁定行程項目' : '未綁定行程項目';
  async function remove(voucher: Voucher) {
    try { await deleteVoucher(voucher); await load(); }
    catch (error: any) { Alert.alert('刪除票券失敗', error?.message ?? '請稍後再試。'); }
  }

  return <ScrollView contentContainerStyle={styles.container}>
    <View style={styles.header}><View style={styles.headerCopy}><Text style={styles.title}>🎫 預約與票券</Text><Text style={styles.subtitle}>集中管理門票、機票 QR Code 與飯店預約單。</Text></View><Pressable style={styles.upload} onPress={() => setUploading(true)}><Text style={styles.white}>＋ 新增</Text></Pressable></View>
    {vouchers.length ? vouchers.map((voucher) => <View key={voucher.id} style={styles.card}><Pressable style={styles.info} onPress={() => setPreview(voucher)}><Text style={styles.icon}>{voucher.file_type === 'pdf' ? '📄' : '🖼️'}</Text><View style={styles.content}><Text numberOfLines={2} style={styles.name}>{voucher.title}</Text><Text numberOfLines={2} style={styles.meta}>{voucher.file_type.toUpperCase()} · {itemName(voucher.item_id)}</Text></View></Pressable><Pressable style={styles.deleteButton} onPress={() => Alert.alert('刪除票券', `確定要刪除「${voucher.title}」嗎？`, [{ text: '取消' }, { text: '刪除', style: 'destructive', onPress: () => void remove(voucher) }])}><Text style={styles.delete}>刪除</Text></Pressable></View>) : <View style={styles.empty}><PuppyMascot puppy="-6" size={165} accessibilityLabel="目前沒有預約票券" /><Text style={styles.subtitle}>目前還沒有預約或票券</Text></View>}
    <VoucherUploadModal visible={uploading} tripId={tripId} userId={userId} items={items} onClose={() => setUploading(false)} onUploaded={load} />
    <VoucherPreviewModal voucher={preview} onClose={() => setPreview(null)} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: 4, paddingBottom: 100, gap: 10 },
  header: { width: '100%', maxWidth: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  headerCopy: { flex: 1, minWidth: 0 },
  title: { fontSize: 21, fontWeight: '800' },
  subtitle: { color: '#64748b', marginTop: 3 },
  upload: { flexShrink: 0, backgroundColor: '#2563eb', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 10 },
  white: { color: 'white', fontWeight: '800' },
  card: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', flexDirection: 'row', alignItems: 'center', backgroundColor: 'white', borderRadius: 15, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  info: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  icon: { fontSize: 26 },
  content: { flex: 1, minWidth: 0 },
  name: { fontSize: 16, fontWeight: '800' },
  meta: { color: '#64748b', fontSize: 12, marginTop: 3 },
  deleteButton: { flexShrink: 0, marginLeft: 8 },
  delete: { color: '#dc2626', fontSize: 13, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 45, gap: 8 },
  emptyIcon: { fontSize: 36 },
});
