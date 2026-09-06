import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { isValidTripDateRange } from '@/lib/trip-dates';
import { EDITORIAL_COLORS, getThemeForMode, type ThemeMode } from '@/lib/theme';
import { isValidTimezone, normalizeTimezone } from '@/lib/timezone';

type Props = {
  visible: boolean;
  startDate: string;
  endDate: string;
  departureTime: string | null | undefined;
  timezone: string | null | undefined;
  themeMode?: ThemeMode;
  onThemeModeChange?: (mode: ThemeMode) => void;
  onClose: () => void;
  onSave: (changes: { start_date: string; end_date: string; default_departure_time: string | null; timezone: string }) => Promise<void>;
};

const themeOptions: { mode: ThemeMode; label: string }[] = [
  { mode: 'light', label: '☀️ 明亮' },
  { mode: 'dark', label: '🌙 暗黑' },
  { mode: 'system', label: '📱 跟隨系統' },
];

export function TripSettingsModal({ visible, startDate, endDate, departureTime, timezone: initialTimezone, themeMode = 'system', onThemeModeChange, onClose, onSave }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [departure, setDeparture] = useState('');
  const [timezone, setTimezone] = useState('Asia/Taipei');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) { setStart(startDate); setEnd(endDate); setDeparture(departureTime ?? ''); setTimezone(normalizeTimezone(initialTimezone)); setError(''); }
  }, [departureTime, endDate, initialTimezone, startDate, visible]);

  async function save() {
    const trimmedStart = start.trim(); const trimmedEnd = end.trim(); const trimmedDeparture = departure.trim();
    if (!isValidTripDateRange(trimmedStart, trimmedEnd)) { setError('請輸入有效日期，且結束日期不可早於開始日期（YYYY-MM-DD）。'); return; }
    if (trimmedDeparture && !/^([01]\d|2[0-3]):[0-5]\d$/.test(trimmedDeparture)) { setError('請使用 HH:mm 格式，例如 09:00。'); return; }
    if (!isValidTimezone(timezone)) { setError('請輸入有效的 IANA 時區，例如 Asia/Tokyo。'); return; }
    setSaving(true); setError('');
    try { await onSave({ start_date: trimmedStart, end_date: trimmedEnd, default_departure_time: trimmedDeparture || null, timezone: normalizeTimezone(timezone) }); onClose(); }
    catch (cause: any) { console.error('[TripSettingsModal] save failed', cause); setError(cause?.message ?? '儲存行程設定失敗。'); }
    finally { setSaving(false); }
  }

  return <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>行程設定</Text>
      <Text style={[styles.label, { color: theme.colors.text }]}>開始日期</Text><TextInput style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]} value={start} onChangeText={setStart} placeholder="2026-01-20" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
      <Text style={[styles.label, { color: theme.colors.text }]}>結束日期</Text><TextInput style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]} value={end} onChangeText={setEnd} placeholder="2026-01-23" autoCapitalize="none" keyboardType="numbers-and-punctuation" />
      <Text style={[styles.helper, { color: theme.colors.muted }]}>請使用 YYYY-MM-DD 格式；結束日期不可早於開始日期。</Text>
      <Text style={[styles.label, { color: theme.colors.text }]}>預設每日出發時間</Text><TextInput style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]} value={departure} onChangeText={setDeparture} placeholder="09:00" autoCapitalize="none" /><Text style={[styles.helper, { color: theme.colors.muted }]}>若景點沒有填開始時間，會依此時間推算；留白時使用 09:00。</Text>
      <Text style={[styles.label, { color: theme.colors.text }]}>介面主題</Text><View style={styles.themeOptions}>{themeOptions.map((option) => <Pressable key={option.mode} accessibilityRole="radio" accessibilityState={{ selected: themeMode === option.mode }} style={[styles.themeOption, { borderColor: theme.colors.border, backgroundColor: themeMode === option.mode ? theme.colors.primary : theme.colors.surfaceMuted }]} onPress={() => onThemeModeChange?.(option.mode)}><Text style={{ color: themeMode === option.mode ? theme.colors.surface : theme.colors.text }}>{option.label}</Text></Pressable>)}</View>
      <Text style={[styles.label, { color: theme.colors.text }]}>目的地時區（IANA）</Text><TextInput style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]} value={timezone} onChangeText={setTimezone} placeholder="Asia/Tokyo" autoCapitalize="none" autoCorrect={false} /><Text style={[styles.helper, { color: theme.colors.muted }]}>例如 Asia/Tokyo、Europe/Paris；會影響日期、營業時間與天氣。</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}><Pressable onPress={onClose}><Text style={[styles.cancel, { color: theme.colors.muted }]}>取消</Text></Pressable><Pressable style={styles.save} onPress={() => void save()} disabled={saving}><Text style={styles.white}>{saving ? '儲存中…' : '儲存設定'}</Text></Pressable></View>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(31, 31, 31, 0.35)' }, card: { padding: 24, gap: 12, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderWidth: 1, borderColor: EDITORIAL_COLORS.line }, title: { fontSize: 24, fontWeight: '800' }, label: { fontWeight: '700', fontSize: 13 }, input: { minHeight: 48, borderWidth: 1, borderRadius: 10, padding: 13, fontSize: 16 }, helper: { fontSize: 12, lineHeight: 17 }, themeOptions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, themeOption: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9 }, error: { color: EDITORIAL_COLORS.dangerText, backgroundColor: EDITORIAL_COLORS.dangerSoft, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, padding: 10, borderRadius: 8 }, actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 18, marginTop: 8 }, cancel: { fontWeight: '700' }, save: { minHeight: 48, justifyContent: 'center', backgroundColor: EDITORIAL_COLORS.terracotta, borderRadius: 10, paddingHorizontal: 18, paddingVertical: 12 }, white: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
});
