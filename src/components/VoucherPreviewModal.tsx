import React, { useEffect, useState } from 'react';
import { Alert, Image, Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { getVoucherPreviewUrl } from '@/lib/vouchers-api';
import type { Voucher } from '@/lib/vouchers';
import { EDITORIAL_COLORS } from '@/lib/theme';

export function VoucherPreviewModal({ voucher, onClose }: { voucher: Voucher | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    if (!voucher) return () => { active = false; };
    void getVoucherPreviewUrl(voucher).then((value) => {
      if (active) setUrl(value);
    }).catch((error: any) => {
      if (active) Alert.alert('票券預覽失敗', error?.message ?? '無法產生安全預覽連結。');
    });
    return () => { active = false; };
  }, [voucher]);

  return <Modal visible={Boolean(voucher)} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <View style={styles.card}>
        <Text style={styles.title}>{voucher?.title}</Text>
        {url && voucher?.file_type === 'image' ? <Image source={{ uri: url }} resizeMode="contain" style={styles.image} /> : <View style={styles.pdf}><Text style={styles.pdfIcon}>{voucher?.file_type === 'pdf' ? '📄' : '🎫'}</Text><Text>{url ? '票券已準備好預覽' : '正在產生安全預覽連結…'}</Text></View>}
        <View style={styles.actions}>
          {url ? <Pressable style={styles.open} onPress={() => void Linking.openURL(url)}><Text style={styles.white}>開啟票券</Text></Pressable> : null}
          <Pressable onPress={onClose}><Text style={styles.close}>關閉</Text></Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(31,31,31,.62)' },
  card: { backgroundColor: EDITORIAL_COLORS.paper, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 14, padding: 18, maxHeight: '90%', gap: 14 },
  title: { fontSize: 20, fontWeight: '800', color: EDITORIAL_COLORS.charcoal },
  image: { width: '100%', height: 420, backgroundColor: EDITORIAL_COLORS.sand, borderRadius: 10 },
  pdf: { height: 220, alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: EDITORIAL_COLORS.sand, borderRadius: 10 },
  pdfIcon: { fontSize: 48 },
  actions: { alignItems: 'center', gap: 12 },
  open: { minHeight: 48, justifyContent: 'center', backgroundColor: EDITORIAL_COLORS.terracotta, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12 },
  white: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
  close: { color: EDITORIAL_COLORS.taupe, fontWeight: '700', minHeight: 44, paddingVertical: 12 },
});
