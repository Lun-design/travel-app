import * as DocumentPicker from 'expo-document-picker';
import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { uploadVoucher } from '@/lib/vouchers-api';
import type { ItineraryItem } from '@/lib/itinerary';
import { EDITORIAL_COLORS } from '@/lib/theme';

export function VoucherUploadModal({ visible, tripId, userId, items, onClose, onUploaded }: {
  visible: boolean;
  tripId: string;
  userId: string;
  items: ItineraryItem[];
  onClose: () => void;
  onUploaded: () => Promise<void> | void;
}) {
  const [title, setTitle] = useState('');
  const [itemId, setItemId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setItemId(null);
    }
  }, [visible]);

  async function choose() {
    setBusy(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: ['image/*', 'application/pdf'], copyToCacheDirectory: true });
      if (result.canceled) return;
      const file = result.assets[0];
      const data = await (await fetch(file.uri)).arrayBuffer();
      await uploadVoucher({ tripId, userId, itemId, title, fileName: file.name, fileType: file.mimeType ?? 'application/octet-stream', data });
      await onUploaded();
      onClose();
    } catch (error: any) {
      console.error('[VoucherUpload] failed', error);
      Alert.alert('上傳票券失敗', error?.message ?? '請稍後再試。');
    } finally {
      setBusy(false);
    }
  }

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={styles.card}>
      <Text style={styles.title}>新增預約與票券</Text>
      <Text style={styles.hint}>支援圖片與 PDF，可綁定到時間軸上的景點、航班或飯店。</Text>
      <TextInput style={styles.input} placeholder="票券名稱（選填）" value={title} onChangeText={setTitle} />
      <Text style={styles.label}>綁定行程項目（選填）</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Pressable style={[styles.chip, itemId === null && styles.selected]} onPress={() => setItemId(null)}><Text style={itemId === null ? styles.white : undefined}>不綁定</Text></Pressable>
        {items.map((item) => <Pressable key={item.id} style={[styles.chip, itemId === item.id && styles.selected]} onPress={() => setItemId(item.id)}><Text style={itemId === item.id ? styles.white : undefined}>{item.location_name}</Text></Pressable>)}
      </ScrollView>
      <Pressable style={styles.upload} disabled={busy} onPress={() => void choose()}><Text style={styles.white}>{busy ? '上傳中…' : '選擇圖片或 PDF'}</Text></Pressable>
      <Pressable onPress={onClose}><Text style={styles.cancel}>取消</Text></Pressable>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(31,31,31,.5)' },
  card: { backgroundColor: EDITORIAL_COLORS.paper, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 14, padding: 22, gap: 14, maxHeight: '90%' },
  title: { fontSize: 22, fontWeight: '800', color: EDITORIAL_COLORS.charcoal },
  hint: { color: EDITORIAL_COLORS.taupe },
  label: { color: EDITORIAL_COLORS.charcoal, fontWeight: '700' },
  input: { minHeight: 48, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 10, padding: 13 },
  chips: { gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', backgroundColor: EDITORIAL_COLORS.sand, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  selected: { backgroundColor: EDITORIAL_COLORS.terracotta },
  upload: { minHeight: 48, justifyContent: 'center', backgroundColor: EDITORIAL_COLORS.terracotta, borderRadius: 10, padding: 14, alignItems: 'center' },
  white: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
  cancel: { color: EDITORIAL_COLORS.taupe, textAlign: 'center', fontWeight: '700', minHeight: 44, paddingVertical: 12 },
});
