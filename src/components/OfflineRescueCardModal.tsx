import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ItineraryItem } from '@/lib/itinerary';
import type { Voucher } from '@/lib/vouchers';
import { EDITORIAL_COLORS } from '@/lib/theme';

type Props = {
  visible: boolean;
  item: ItineraryItem | null;
  vouchers: Voucher[];
  onClose: () => void;
  onPreviewVoucher?: (voucher: Voucher) => void;
};

/** A large-type, already-synced emergency card for use while offline. */
export function OfflineRescueCardModal({ visible, item, vouchers, onClose, onPreviewVoucher }: Props) {
  const itemVouchers = item ? vouchers.filter((voucher) => voucher.item_id === item.id) : [];
  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.eyebrow}>離線備忘／救命卡</Text>
            <Text style={styles.title}>{item?.location_name ?? '尚未選擇景點'}</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="關閉離線救命卡" style={styles.closeButton} onPress={onClose}><Text style={styles.closeText}>關閉</Text></Pressable>
        </View>

        <View style={styles.section}>
          <Text style={styles.label}>當地語言地址</Text>
          <Text selectable style={styles.value}>{item?.address?.trim() || '尚未填寫地址'}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>電話／備註／憑證號碼</Text>
          <Text selectable style={styles.value}>{item?.notes?.trim() || '尚未填寫備註，可回到編輯景點補充。'}</Text>
        </View>
        <View style={styles.section}>
          <Text style={styles.label}>已同步票券</Text>
          {itemVouchers.length ? itemVouchers.map((voucher) => <Pressable key={voucher.id} accessibilityRole="button" style={styles.voucherButton} onPress={() => onPreviewVoucher?.(voucher)}><Text style={styles.voucherText}>🎫 {voucher.title}</Text><Text style={styles.voucherMeta}>{voucher.file_type.toUpperCase()} · 點擊預覽</Text></Pressable>) : <Text style={styles.muted}>目前沒有綁定票券。</Text>}
        </View>
        <Text style={styles.offlineHint}>此頁顯示的是已同步到裝置的資料；無網路時仍可查看。</Text>
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: EDITORIAL_COLORS.paper },
  content: { flexGrow: 1, padding: 24, paddingTop: 48, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: EDITORIAL_COLORS.terracotta, fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  title: { color: EDITORIAL_COLORS.charcoal, fontSize: 32, lineHeight: 40, fontWeight: '900', marginTop: 6 },
  closeButton: { minWidth: 64, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 10, paddingHorizontal: 12 },
  closeText: { color: EDITORIAL_COLORS.charcoal, fontSize: 16, fontWeight: '800' },
  section: { gap: 8, padding: 16, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 14, backgroundColor: EDITORIAL_COLORS.sand },
  label: { color: EDITORIAL_COLORS.taupe, fontSize: 15, fontWeight: '800' },
  value: { color: EDITORIAL_COLORS.charcoal, fontSize: 24, lineHeight: 32, fontWeight: '800' },
  voucherButton: { minHeight: 64, justifyContent: 'center', borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: EDITORIAL_COLORS.paper, gap: 3 },
  voucherText: { color: EDITORIAL_COLORS.charcoal, fontSize: 18, fontWeight: '800' },
  voucherMeta: { color: EDITORIAL_COLORS.terracotta, fontSize: 13, fontWeight: '700' },
  muted: { color: EDITORIAL_COLORS.taupe, fontSize: 18 },
  offlineHint: { color: EDITORIAL_COLORS.taupe, fontSize: 14, lineHeight: 21, textAlign: 'center', marginTop: 'auto' },
});
