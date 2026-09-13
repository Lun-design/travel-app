import * as DocumentPicker from 'expo-document-picker';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { mapDraftToTargetTrip, mergeImportedItems, parseImportSource, type ImportedItineraryPayload, type ImportedTripDraft, type ImportSource } from '@/lib/itinerary-import';
import { EDITORIAL_COLORS, getThemeForMode, type ThemeMode } from '@/lib/theme';

export type ImportTripOption = { id: string; title: string; start_date: string; end_date: string };
export type ImportResult = { targetTripId: string; saved: number; skipped: number; failed: number };

type Props = {
  visible: boolean;
  currentTripId: string;
  trips: ImportTripOption[];
  existingItems?: readonly { id?: string; day_number: number; location_name: string; time?: string | null }[];
  themeMode?: ThemeMode;
  onClose: () => void;
  onConfirm: (draft: ImportedTripDraft, targetTripId: string, dayOffset: number, payloads: ImportedItineraryPayload[]) => Promise<ImportResult>;
};

type Stage = 'input' | 'preview' | 'saving' | 'result';

export function ItineraryImportModal({ visible, currentTripId, trips, existingItems = [], themeMode = 'system', onClose, onConfirm }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [source, setSource] = useState<ImportSource>('text');
  const [input, setInput] = useState('');
  const [draft, setDraft] = useState<ImportedTripDraft | null>(null);
  const [targetTripId, setTargetTripId] = useState(currentTripId);
  const [dayOffset, setDayOffset] = useState('0');
  const [stage, setStage] = useState<Stage>('input');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSource('text'); setInput(''); setDraft(null); setTargetTripId(currentTripId); setDayOffset('0'); setStage('input'); setError(''); setResult(null);
  }, [currentTripId, visible]);

  const selectedTrip = useMemo(() => trips.find((trip) => trip.id === targetTripId) ?? trips[0], [targetTripId, trips]);
  const parsedPayloads = useMemo(() => draft && selectedTrip ? mapDraftToTargetTrip(draft, { startDate: selectedTrip.start_date, dayOffset: Number(dayOffset) || 0 }) : [], [draft, selectedTrip, dayOffset]);
  const mergePreview = useMemo(() => mergeImportedItems(existingItems, parsedPayloads), [existingItems, parsedPayloads]);

  async function chooseIcsFile() {
    try {
      const picked = await DocumentPicker.getDocumentAsync({ type: ['text/calendar', 'text/plain', '*/*'], copyToCacheDirectory: true, multiple: false });
      if (picked.canceled) return;
      const file = picked.assets[0];
      const text = await (await fetch(file.uri)).text();
      setInput(text);
      setSource('ics');
      parseText(text, 'ics');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '無法讀取行事曆檔案。');
    }
  }

  function parseText(value = input, selectedSource = source) {
    if (!value.trim()) { setError('請貼上行程文字或選擇 ICS 檔案。'); return; }
    try {
      const parsed = parseImportSource(value, selectedSource);
      if (!parsed.days.some((day) => day.items.length)) { setError(parsed.warnings[0] ?? '找不到可匯入的景點或活動。'); return; }
      setDraft(parsed); setError(''); setStage('preview');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '行程格式無法解析，請確認內容後再試。');
    }
  }

  async function confirmImport() {
    if (!draft || !selectedTrip || stage === 'saving') return;
    setStage('saving'); setError('');
    try {
      const saved = await onConfirm(draft, selectedTrip.id, Number(dayOffset) || 0, mergePreview.added as ImportedItineraryPayload[]);
      setResult(saved); setStage('result');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '匯入失敗，請稍後再試。');
      setStage('preview');
    }
  }

  function renderInput() {
    return <>
      <View style={styles.sourceTabs}>
        <Pressable style={[styles.sourceTab, source === 'text' && { backgroundColor: theme.colors.primary }]} onPress={() => setSource('text')}><Text style={{ color: source === 'text' ? theme.colors.surface : theme.colors.text }}>貼上文字／AI 行程</Text></Pressable>
        <Pressable style={[styles.sourceTab, source === 'ics' && { backgroundColor: theme.colors.primary }]} onPress={() => setSource('ics')}><Text style={{ color: source === 'ics' ? theme.colors.surface : theme.colors.text }}>上傳 .ics</Text></Pressable>
      </View>
      {source === 'ics' ? <Pressable style={[styles.fileButton, { borderColor: theme.colors.border }]} onPress={() => void chooseIcsFile()}><Text style={{ color: theme.colors.primary }}>選擇行事曆檔案</Text></Pressable> : null}
      <TextInput multiline textAlignVertical="top" style={[styles.textArea, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} value={input} onChangeText={setInput} placeholder="貼上航班、訂房或完整行程，例如：Day 1｜東京鐵塔…" placeholderTextColor={theme.colors.muted} />
      <Pressable style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]} onPress={() => parseText()}><Text style={styles.primaryText}>解析並預覽</Text></Pressable>
    </>;
  }

  function renderPreview() {
    return <>
      <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>匯入預覽</Text>
      <Text style={[styles.summary, { color: theme.colors.muted }]}>{draft?.title ?? '未命名行程'} · {draft?.days.length ?? 0} 天 · 新增 {mergePreview.added.length} 筆 · 略過重複 {mergePreview.skipped.length} 筆</Text>
      <Text style={[styles.label, { color: theme.colors.text }]}>匯入到哪份行程？</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tripChoices}>{trips.map((trip) => <Pressable key={trip.id} style={[styles.tripChoice, { borderColor: theme.colors.border, backgroundColor: trip.id === targetTripId ? theme.colors.primary : theme.colors.surfaceMuted }]} onPress={() => setTargetTripId(trip.id)}><Text numberOfLines={1} style={{ color: trip.id === targetTripId ? theme.colors.surface : theme.colors.text }}>{trip.title}</Text></Pressable>)}</ScrollView>
      <Text style={[styles.label, { color: theme.colors.text }]}>從目標行程第幾天開始（可填 0）</Text>
      <TextInput style={[styles.dayInput, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} keyboardType="number-pad" value={dayOffset} onChangeText={setDayOffset} />
      <ScrollView style={styles.previewList} contentContainerStyle={styles.previewContent}>{draft?.days.map((day) => <View key={day.dayNumber} style={[styles.dayBlock, { borderColor: theme.colors.border }]}><Text style={[styles.dayTitle, { color: theme.colors.text }]}>Day {day.dayNumber}{day.date ? ` · ${day.date}` : ''}{day.label ? `｜${day.label}` : ''}</Text>{day.items.map((item, index) => <Text key={`${item.title}-${index}`} style={[styles.itemText, { color: theme.colors.muted }]}>{item.startTime ?? '—'} · {item.title}</Text>)}</View>)}</ScrollView>
      <View style={styles.actions}><Pressable style={styles.secondaryButton} onPress={() => setStage('input')}><Text style={{ color: theme.colors.muted }}>返回修改</Text></Pressable><Pressable style={[styles.primaryButton, styles.confirmButton, { backgroundColor: theme.colors.primary }]} onPress={() => void confirmImport()}><Text style={styles.primaryText}>確認匯入 {mergePreview.added.length} 筆</Text></Pressable></View>
    </>;
  }

  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}><View style={styles.backdrop}><View style={[styles.card, { backgroundColor: theme.colors.surface }]}><View style={styles.header}><Text style={[styles.title, { color: theme.colors.text }]}>📥 一鍵匯入行程</Text><Pressable accessibilityRole="button" onPress={onClose}><Text style={[styles.close, { color: theme.colors.muted }]}>✕</Text></Pressable></View>{stage === 'input' ? renderInput() : stage === 'saving' ? <View style={styles.loading}><ActivityIndicator color={theme.colors.primary} /><Text style={{ color: theme.colors.muted }}>正在寫入行程…</Text></View> : stage === 'result' && result ? <View style={styles.result}><Text style={[styles.sectionTitle, { color: theme.colors.text }]}>匯入完成</Text><Text style={{ color: theme.colors.muted }}>已新增 {result.saved} 筆，略過 {result.skipped} 筆重複資料。</Text><Pressable style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]} onPress={onClose}><Text style={styles.primaryText}>完成</Text></Pressable></View> : renderPreview()}{error ? <Text style={styles.error}>{error}</Text> : null}</View></View></Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(31,31,31,.4)' },
  card: { maxHeight: '94%', minHeight: 420, padding: 20, borderTopLeftRadius: 18, borderTopRightRadius: 18, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 23, fontWeight: '800' }, close: { fontSize: 22, padding: 8 },
  sourceTabs: { flexDirection: 'row', gap: 8 }, sourceTab: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 9, backgroundColor: EDITORIAL_COLORS.sand },
  fileButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderRadius: 9 },
  textArea: { minHeight: 150, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  primaryButton: { minHeight: 46, justifyContent: 'center', alignItems: 'center', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 }, primaryText: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
  sectionTitle: { fontSize: 19, fontWeight: '800' }, summary: { fontSize: 13 }, label: { fontSize: 13, fontWeight: '700', marginTop: 4 }, tripChoices: { gap: 8, paddingVertical: 2 }, tripChoice: { minWidth: 120, maxWidth: 190, minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: 9 }, dayInput: { width: 100, minHeight: 44, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12 },
  previewList: { flex: 1 }, previewContent: { gap: 9, paddingBottom: 8 }, dayBlock: { borderWidth: 1, borderRadius: 10, padding: 11, gap: 5 }, dayTitle: { fontWeight: '800' }, itemText: { fontSize: 14 }, actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }, secondaryButton: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 12 }, confirmButton: { flex: 1 }, loading: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 12 }, result: { gap: 14, paddingVertical: 36 }, error: { color: EDITORIAL_COLORS.dangerText, backgroundColor: EDITORIAL_COLORS.dangerSoft, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, padding: 10, borderRadius: 8 },
});
