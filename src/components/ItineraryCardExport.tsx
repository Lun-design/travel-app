import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { buildItineraryExportText, exportItineraryCard, normalizeItineraryExportItems, type ItineraryExportData, type ItineraryExportFormat } from '@/lib/export-image';
import { getThemeForMode, type ThemeMode } from '@/lib/theme';

type Props = {
  visible: boolean;
  data: ItineraryExportData;
  themeMode?: ThemeMode;
  onClose: () => void;
};

/** Preview and download/share surface for the magazine-style daily itinerary card. */
export function ItineraryCardExport({ visible, data, themeMode = 'system', onClose }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [format, setFormat] = useState<ItineraryExportFormat>('png');
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => normalizeItineraryExportItems(data.items), [data.items]);

  async function runExport(selectedFormat: ItineraryExportFormat) {
    if (busy) return;
    setBusy(true);
    try {
      await exportItineraryCard(data, selectedFormat);
      onClose();
    } catch (error) {
      Alert.alert('匯出失敗', error instanceof Error ? error.message : '請稍後再試。');
    } finally {
      setBusy(false);
    }
  }

  async function openPdfExport() {
    if (busy) return;
    await runExport('pdf');
  }

  async function handleExport() {
    if (format === 'pdf') {
      await openPdfExport();
      return;
    }
    await runExport('png');
  }

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onClose(); }}>
    <View style={styles.backdrop}><View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={styles.header}><View style={styles.headerCopy}><Text style={[styles.title, { color: theme.colors.text }]}>匯出行程圖卡</Text><Text style={[styles.subtitle, { color: theme.colors.muted }]}>預覽後下載 PNG 或 PDF 檔案。</Text></View><Pressable accessibilityRole="button" accessibilityLabel="關閉匯出預覽" disabled={busy} onPress={onClose}><Text style={[styles.close, { color: theme.colors.muted }]}>×</Text></Pressable></View>
      <ScrollView style={styles.preview} contentContainerStyle={styles.previewContent}>
        <View style={[styles.previewCard, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
          <Text style={[styles.previewTitle, { color: theme.colors.text }]}>{data.title}</Text>
          <Text style={[styles.previewMeta, { color: theme.colors.muted }]}>{[data.destination, `Day ${data.dayNumber}`, data.date].filter(Boolean).join(' · ')}</Text>
          {items.length ? items.map((item, index) => <View key={item.id} style={[styles.item, { borderColor: theme.colors.border }]}><Text style={[styles.index, { color: theme.colors.primary }]}>{index + 1}</Text><View style={styles.itemCopy}><Text style={[styles.itemTitle, { color: theme.colors.text }]}>{item.time ?? '未設定'} · {item.title}</Text><Text style={[styles.itemMeta, { color: theme.colors.muted }]}>停留 {item.durationMinutes} 分鐘{item.address ? ` · ${item.address}` : ''}</Text>{item.navigationUrl ? <Text numberOfLines={1} style={[styles.itemLink, { color: theme.colors.primary }]}>導航連結已附上</Text> : null}</View></View>) : <Text style={[styles.empty, { color: theme.colors.muted }]}>尚未安排景點</Text>}
        </View>
      </ScrollView>
      <Text selectable numberOfLines={2} style={[styles.accessibleText, { color: theme.colors.muted }]}>{buildItineraryExportText(data)}</Text>
      <View style={styles.formatRow}><Pressable accessibilityRole="radio" accessibilityState={{ selected: format === 'png' }} disabled={busy} onPress={() => setFormat('png')} style={[styles.formatButton, { borderColor: format === 'png' ? theme.colors.primary : theme.colors.border, backgroundColor: format === 'png' ? theme.colors.primary : theme.colors.surfaceMuted }]}><Text style={{ color: format === 'png' ? theme.colors.surface : theme.colors.text }}>圖片 PNG</Text></Pressable><Pressable accessibilityRole="radio" accessibilityState={{ selected: format === 'pdf' }} disabled={busy} onPress={() => setFormat('pdf')} style={[styles.formatButton, { borderColor: format === 'pdf' ? theme.colors.primary : theme.colors.border, backgroundColor: format === 'pdf' ? theme.colors.primary : theme.colors.surfaceMuted }]}><Text style={{ color: format === 'pdf' ? theme.colors.surface : theme.colors.text }}>文件 PDF</Text></Pressable></View>
      <View style={styles.actions}><Pressable disabled={busy} onPress={onClose} style={[styles.cancel, { borderColor: theme.colors.border }]}><Text style={{ color: theme.colors.text }}>取消</Text></Pressable><Pressable accessibilityLabel={busy ? (format === 'pdf' ? '產生 PDF 中' : '匯出中') : (format === 'png' ? '下載 PNG' : '下載 PDF')} disabled={busy} onPress={() => void handleExport()} style={[styles.export, { backgroundColor: theme.colors.primary, opacity: busy ? 0.6 : 1 }]}>{busy ? <><ActivityIndicator color={theme.colors.surface} /><Text style={styles.exportText}>{format === 'pdf' ? '列印準備中…' : '匯出中…'}</Text></> : <Text style={styles.exportText}>{format === 'png' ? '下載 PNG' : '下載 PDF'}</Text>}</Pressable></View>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 18, backgroundColor: 'rgba(31,31,31,.48)' },
  card: { width: '100%', maxWidth: 620, maxHeight: '92%', alignSelf: 'center', borderWidth: 1, borderRadius: 16, padding: 18, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  headerCopy: { flex: 1, minWidth: 0, gap: 3 },
  title: { fontSize: 21, fontWeight: '900' },
  subtitle: { fontSize: 12 },
  close: { fontSize: 28, lineHeight: 30, paddingHorizontal: 8 },
  preview: { maxHeight: 460 },
  previewContent: { paddingBottom: 2 },
  previewCard: { borderWidth: 1, borderRadius: 12, padding: 16, gap: 10 },
  previewTitle: { fontSize: 24, fontWeight: '900' },
  previewMeta: { fontSize: 13, marginBottom: 4 },
  item: { flexDirection: 'row', gap: 10, borderTopWidth: 1, paddingTop: 10 },
  index: { fontSize: 18, fontWeight: '900', width: 24 },
  itemCopy: { flex: 1, minWidth: 0, gap: 3 },
  itemTitle: { fontSize: 15, fontWeight: '800' },
  itemMeta: { fontSize: 12, lineHeight: 17 },
  itemLink: { fontSize: 11, fontWeight: '700' },
  empty: { paddingVertical: 22, textAlign: 'center' },
  accessibleText: { fontSize: 10, lineHeight: 14, maxHeight: 30 },
  formatRow: { flexDirection: 'row', gap: 8 },
  formatButton: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 10 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  cancel: { minHeight: 44, minWidth: 80, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14 },
  export: { minHeight: 44, minWidth: 160, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 14 },
  exportText: { color: '#FFFFFF', fontWeight: '800' },
});
