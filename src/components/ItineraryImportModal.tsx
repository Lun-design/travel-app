import * as DocumentPicker from 'expo-document-picker';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { filterNoiseItems, mapDraftToTargetTrip, mergeImportedItems, parseImportSource, type ImportedItineraryPayload, type ImportedTripDraft, type ImportSource } from '@/lib/itinerary-import';
import { EDITORIAL_COLORS, getThemeForMode, type ThemeMode } from '@/lib/theme';
import { listItineraryItems } from '@/lib/itinerary-api';
import type { ImportMode } from '@/lib/itinerary-import-service';

export type ImportTripOption = { id: string; title: string; start_date: string; end_date: string; destination?: string };
export type ImportResult = { targetTripId: string; saved: number; skipped: number; failed: number; removed?: number; unresolved?: string[] };

type Props = {
  visible: boolean;
  currentTripId: string;
  trips: ImportTripOption[];
  existingItems?: readonly { id?: string; day_number: number; location_name: string; time?: string | null }[];
  themeMode?: ThemeMode;
  onClose: () => void;
  initialAction?: 'import' | 'clear';
  onClear: () => Promise<ImportResult>;
  onConfirm: (draft: ImportedTripDraft, targetTripId: string, dayOffset: number, payloads: ImportedItineraryPayload[], mode: ImportMode, destination: string) => Promise<ImportResult>;
};

type Stage = 'input' | 'preview' | 'saving' | 'result' | 'clear';
const EMPTY_ITEMS: NonNullable<Props['existingItems']> = [];

export function ItineraryImportModal({ visible, currentTripId, trips, existingItems = EMPTY_ITEMS, themeMode = 'system', onClose, onConfirm, onClear, initialAction = 'import' }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [source, setSource] = useState<ImportSource>('text');
  const [input, setInput] = useState('');
  const [draft, setDraft] = useState<ImportedTripDraft | null>(null);
  const [targetTripId, setTargetTripId] = useState(currentTripId);
  const [dayOffset, setDayOffset] = useState('0');
  const [stage, setStage] = useState<Stage>('input');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [mode, setMode] = useState<ImportMode>('merge');
  const [confirmation, setConfirmation] = useState('');
  const [destination, setDestination] = useState('');
  const [targetItems, setTargetItems] = useState<NonNullable<Props['existingItems']>>([]);
  const [targetLoading, setTargetLoading] = useState(false);
  const [targetError, setTargetError] = useState('');
  const submitting = useRef(false);

  useEffect(() => {
    if (!visible) return;
    setSource('text'); setInput(''); setDraft(null); setTargetTripId(currentTripId); setDayOffset('0'); setStage(initialAction === 'clear' ? 'clear' : 'input'); setError(''); setResult(null);
    setMode('merge'); setConfirmation(''); setDestination('');
  }, [currentTripId, visible, initialAction]);
  useEffect(() => {
    if (!visible) return;
    setTargetError('');
    if (targetTripId === currentTripId) { setTargetItems(existingItems); setTargetLoading(false); return; }
    let active = true;
    setTargetLoading(true);
    void listItineraryItems(targetTripId).then(items => { if (active) setTargetItems(items); })
      .catch(cause => { if (active) setTargetError(cause instanceof Error ? cause.message : '無法讀取目標行程'); })
      .finally(() => { if (active) setTargetLoading(false); });
    return () => { active = false; };
  }, [visible, targetTripId, currentTripId, existingItems]);

  const selectedTrip = useMemo(() => trips.find((trip) => trip.id === targetTripId), [targetTripId, trips]);
  const parsedPayloads = useMemo(() => draft && selectedTrip ? filterNoiseItems(mapDraftToTargetTrip(draft, { startDate: selectedTrip.start_date, dayOffset: Number(dayOffset) || 0 })) : [], [draft, selectedTrip, dayOffset]);
  const mergePreview = useMemo(() => mergeImportedItems(mode === 'overwrite' ? [] : targetItems, parsedPayloads), [mode, targetItems, parsedPayloads]);
  const canConfirm = !targetLoading && !targetError && Number.isInteger(Number(dayOffset)) && Number(dayOffset) >= 0 && Number(dayOffset) <= 3659 && mergePreview.added.length > 0 && (mode !== 'overwrite' || confirmation === selectedTrip?.title);
  function close() { if (!submitting.current) onClose(); }

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
      setDraft(parsed); setDestination(parsed.destination || selectedTrip?.destination || ''); setError(''); setStage('preview');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '行程格式無法解析，請確認內容後再試。');
    }
  }

  async function confirmImport() {
    if (!draft || !selectedTrip || stage === 'saving' || submitting.current || !canConfirm) return;
    submitting.current = true;
    setStage('saving'); setError('');
    try {
      const saved = await onConfirm(draft, selectedTrip.id, Number(dayOffset) || 0, parsedPayloads, mode, destination);
      setResult(saved); setStage('result');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '匯入失敗，請稍後再試。');
      setStage('preview');
    } finally { submitting.current = false; }
  }

  async function confirmClear() {
    if (submitting.current || !selectedTrip || confirmation !== selectedTrip.title) return;
    submitting.current = true; setStage('saving'); setError('');
    try { setResult(await onClear()); setStage('result'); }
    catch (cause) { setError(cause instanceof Error ? cause.message : '清空失敗，請稍後再試。'); setStage('clear'); }
    finally { submitting.current = false; }
  }
  function destructiveNotice() {
    return <View style={styles.dayBlock}><Text style={{ color: theme.colors.text }}>將移除「{selectedTrip?.title}」全行程的 {targetItems.length} 筆景點（含備案），不是只有目前這一天。此操作無法復原，票券的景點綁定也會解除。</Text><Text style={{ color: theme.colors.text }}>請輸入行程名稱「{selectedTrip?.title}」確認：</Text><TextInput accessibilityLabel="確認行程名稱" style={[styles.dayInput, { width: '100%', color: theme.colors.text }]} value={confirmation} onChangeText={setConfirmation} /></View>;
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tripChoices}>{trips.map((trip) => <Pressable key={trip.id} style={[styles.tripChoice, { borderColor: theme.colors.border, backgroundColor: trip.id === targetTripId ? theme.colors.primary : theme.colors.surfaceMuted }]} onPress={() => { setTargetTripId(trip.id); setConfirmation(''); }}><Text numberOfLines={1} style={{ color: trip.id === targetTripId ? theme.colors.surface : theme.colors.text }}>{trip.title}</Text></Pressable>)}</ScrollView>
      <Text style={[styles.label, { color: theme.colors.text }]}>從目標行程第幾天開始（可填 0）</Text>
      <Text style={{ color: theme.colors.muted }}>0 = Day 1，1 = Day 2。不足的行程天數會延長。缺少鐘點的活動會標為建議時間。</Text>
      <TextInput style={[styles.dayInput, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} keyboardType="number-pad" value={dayOffset} onChangeText={setDayOffset} />
      <Text style={[styles.label, { color: theme.colors.text }]}>地點搜尋地區（請確認城市／國家）</Text>
      <TextInput accessibilityLabel="地點搜尋地區" value={destination} onChangeText={setDestination} style={[styles.dayInput, { width: '100%', color: theme.colors.text }]} />
      <View style={styles.sourceTabs}>{(['merge', 'overwrite'] as const).map(value => <Pressable accessibilityRole="radio" accessibilityState={{ checked: mode === value }} key={value} style={[styles.sourceTab, { backgroundColor: mode === value ? theme.colors.surfaceMuted : theme.colors.surface, borderWidth: 1, borderColor: theme.colors.border }]} onPress={() => { setMode(value); setConfirmation(''); }}><Text style={{ color: theme.colors.text }}>{value === 'merge' ? '合併既有行程' : '覆蓋既有行程'}</Text></Pressable>)}</View>
      {mode === 'overwrite' ? destructiveNotice() : null}
      {targetLoading ? <ActivityIndicator /> : null}
      {targetError ? <Text style={styles.error}>{targetError}</Text> : null}
      {draft?.warnings.map((warning, index) => <Text key={index} style={styles.error}>{warning}</Text>)}
      <View style={styles.previewContent}>{draft?.days.map((day) => <View key={day.dayNumber} style={[styles.dayBlock, { borderColor: theme.colors.border }]}><Text style={[styles.dayTitle, { color: theme.colors.text }]}>Day {day.dayNumber}{day.date ? ` · ${day.date}` : ''}{day.label ? `｜${day.label}` : ''}</Text>{day.items.map((item, index) => <Text key={`${item.title}-${index}`} style={[styles.itemText, { color: theme.colors.muted }]}>{item.startTime ?? '—'} · {item.title}{item.notes?.includes('自動安排') ? '（建議時間）' : ''}</Text>)}</View>)}</View>
      <View style={styles.actions}><Pressable style={styles.secondaryButton} onPress={() => setStage('input')}><Text style={{ color: theme.colors.muted }}>返回修改</Text></Pressable><Pressable disabled={!canConfirm} style={[styles.primaryButton, styles.confirmButton, { backgroundColor: theme.colors.primary, opacity: canConfirm ? 1 : 0.4 }]} onPress={() => void confirmImport()}><Text style={styles.primaryText}>確認匯入 {mergePreview.added.length} 筆</Text></Pressable></View>
    </>;
  }

  return <Modal visible={visible} animationType="slide" transparent onRequestClose={close}><View style={styles.backdrop}><View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
    <View style={styles.header}><Text style={[styles.title, { color: theme.colors.text }]}>{initialAction === 'clear' ? '清空全行程景點' : '📥 一鍵匯入行程'}</Text><Pressable disabled={stage === 'saving'} accessibilityRole="button" onPress={close}><Text style={[styles.close, { color: theme.colors.muted }]}>✕</Text></Pressable></View>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12, paddingBottom: 24 }}>
    {stage === 'input' ? renderInput() : stage === 'clear' ? <>{destructiveNotice()}<Pressable disabled={!selectedTrip || confirmation !== selectedTrip.title} style={[styles.primaryButton, { backgroundColor: theme.colors.primary, opacity: confirmation === selectedTrip?.title ? 1 : 0.4 }]} onPress={() => void confirmClear()}><Text style={styles.primaryText}>確認清空全行程景點</Text></Pressable></> : stage === 'saving' ? <View style={styles.loading}><ActivityIndicator color={theme.colors.primary} /><Text style={{ color: theme.colors.muted }}>正在查詢地點並處理行程，請稍候…</Text></View> : stage === 'result' && result ? <View style={styles.result}><Text style={[styles.sectionTitle, { color: theme.colors.text }]}>處理完成</Text><Text style={{ color: theme.colors.muted }}>已新增 {result.saved} 筆，略過 {result.skipped} 筆，移除 {result.removed ?? 0} 筆。</Text>{result.unresolved?.length ? <Text style={styles.error}>以下項目尚無座標，請於編輯景點中確認位置：{result.unresolved.join('、')}</Text> : null}<Pressable style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]} onPress={close}><Text style={styles.primaryText}>完成</Text></Pressable></View> : renderPreview()}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}</ScrollView></View></View></Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(31,31,31,.4)' },
  card: { maxHeight: '94%', minHeight: 420, padding: 20, borderTopLeftRadius: 18, borderTopRightRadius: 18, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontSize: 23, fontWeight: '800' }, close: { fontSize: 22, padding: 8 },
  sourceTabs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, sourceTab: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 9, backgroundColor: EDITORIAL_COLORS.sand },
  fileButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderRadius: 9 },
  textArea: { minHeight: 150, borderWidth: 1, borderRadius: 10, padding: 12, fontSize: 15 },
  primaryButton: { minHeight: 46, justifyContent: 'center', alignItems: 'center', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 11 }, primaryText: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
  sectionTitle: { fontSize: 19, fontWeight: '800' }, summary: { fontSize: 13 }, label: { fontSize: 13, fontWeight: '700', marginTop: 4 }, tripChoices: { gap: 8, paddingVertical: 2 }, tripChoice: { minWidth: 120, maxWidth: 190, minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderWidth: 1, borderRadius: 9 }, dayInput: { width: 100, minHeight: 44, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12 },
  previewList: { flex: 1 }, previewContent: { gap: 9, paddingBottom: 8 }, dayBlock: { borderWidth: 1, borderRadius: 10, padding: 11, gap: 5 }, dayTitle: { fontWeight: '800' }, itemText: { fontSize: 14 }, actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12 }, secondaryButton: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 12 }, confirmButton: { flex: 1 }, loading: { flex: 1, minHeight: 260, alignItems: 'center', justifyContent: 'center', gap: 12 }, result: { gap: 14, paddingVertical: 36 }, error: { color: EDITORIAL_COLORS.dangerText, backgroundColor: EDITORIAL_COLORS.dangerSoft, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, padding: 10, borderRadius: 8 },
});
