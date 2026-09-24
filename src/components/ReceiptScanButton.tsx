import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { recognizeReceiptWithTesseract, type ReceiptParseResult } from '@/lib/receipt-ocr';
import { EDITORIAL_COLORS } from '@/lib/theme';

export function ReceiptScanButton({ onResult }: { onResult: (result: ReceiptParseResult) => void }) {
  const [busy, setBusy] = useState(false);
  async function scan() {
    if (busy) return;
    setBusy(true);
    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      const result = permission.granted
        ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.85 })
        : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
      if (result.canceled || !result.assets[0]?.uri) return;
      onResult(await recognizeReceiptWithTesseract(result.assets[0].uri));
    } catch (error) {
      Alert.alert('收據辨識失敗', error instanceof Error ? error.message : '請改用手動輸入。');
    } finally {
      setBusy(false);
    }
  }
  return <Pressable accessibilityRole="button" disabled={busy} onPress={() => void scan()} style={[styles.button, busy && styles.disabled]}><Text style={styles.text}>{busy ? '辨識中…' : '📷 掃描收據'}</Text></Pressable>;
}

const styles = StyleSheet.create({
  button: { minHeight: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 14, borderRadius: 10, backgroundColor: EDITORIAL_COLORS.sand },
  disabled: { opacity: 0.55 },
  text: { color: EDITORIAL_COLORS.terracotta, fontWeight: '800' },
});
