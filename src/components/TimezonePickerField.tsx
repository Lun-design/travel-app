import React, { useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { TIMEZONE_REGIONS, detectTravelTimezone } from '../../lib/timezone-options';
import { getAppTheme, type AppTheme } from '../../lib/theme';

type Props = { value: string; onChange: (value: string) => void; disabled?: boolean; destination?: string; theme?: AppTheme };
const CUSTOM = '__custom__';

export function TimezonePickerField({ value, onChange, disabled = false, destination, theme = getAppTheme('light') }: Props) {
  const [advanced, setAdvanced] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [notice, setNotice] = useState('');
  const region = TIMEZONE_REGIONS.find(option => option.value === value);
  const custom = advanced || !region;
  const colors = { color: theme.colors.text, backgroundColor: theme.colors.surface, borderColor: theme.colors.border };
  function select(next: string) {
    if (disabled) return;
    setNotice(''); setExpanded(false);
    if (next === CUSTOM) { setAdvanced(true); return; }
    if (!TIMEZONE_REGIONS.some(option => option.value === next)) return;
    setAdvanced(false); onChange(next);
  }
  function detect() {
    if (disabled) return;
    const next = detectTravelTimezone(destination);
    if (!next) { setNotice('無法確定目的地時區，請選擇城市或使用進階設定。'); return; }
    select(next); setNotice('已依目的地選擇時區，請確認城市是否正確。');
  }
  return <View style={styles.root}>
    <Text style={[styles.label, { color: theme.colors.text }]}>目的地時區</Text>
    {Platform.OS === 'web' ? <select aria-label="目的地時區" disabled={disabled} value={custom ? CUSTOM : value} onChange={event => select(event.currentTarget.value)} style={{ ...colors, width: '100%', minHeight: 48, borderWidth: 1, borderStyle: 'solid', borderRadius: 10, padding: 12, fontSize: 16, boxSizing: 'border-box' }}>
      {TIMEZONE_REGIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      <option value={CUSTOM}>其他／進階（自訂 IANA）</option>
    </select> : <>
      <Pressable accessibilityRole="button" accessibilityLabel="目的地時區" accessibilityState={{ expanded, disabled }} disabled={disabled} onPress={() => setExpanded(v => !v)} style={[styles.field, colors]}><Text style={{ color: theme.colors.text }}>{custom ? '其他／進階（自訂 IANA）' : region?.label} ▾</Text></Pressable>
      {expanded ? <ScrollView style={styles.options} nestedScrollEnabled keyboardShouldPersistTaps="handled">
        {TIMEZONE_REGIONS.map(option => <Pressable key={option.value} accessibilityRole="radio" accessibilityLabel={`時區：${option.label}`} accessibilityState={{ checked: !custom && value === option.value, disabled }} disabled={disabled} style={[styles.option, { backgroundColor: !custom && value === option.value ? theme.colors.surfaceMuted : theme.colors.surface }]} onPress={() => select(option.value)}><Text style={{ color: theme.colors.text }}>{option.label}</Text></Pressable>)}
        <Pressable accessibilityRole="radio" accessibilityLabel="時區：其他／進階" accessibilityState={{ checked: custom, disabled }} disabled={disabled} style={styles.option} onPress={() => select(CUSTOM)}><Text style={{ color: theme.colors.text }}>其他／進階（自訂 IANA）</Text></Pressable>
      </ScrollView> : null}
    </>}
    {custom ? <TextInput accessibilityLabel="自訂 IANA 時區" value={value} onChangeText={next => { if (!disabled) onChange(next); }} editable={!disabled} placeholder="例如 Australia/Adelaide" placeholderTextColor={theme.colors.muted} autoCapitalize="none" autoCorrect={false} style={[styles.field, colors]} /> : null}
    <Text style={[styles.helper, { color: theme.colors.muted }]}>{value || '請選擇時區'} · 僅設定行程時區，不自動換算或改寫已填時間。夏令時間依地區規則處理。</Text>
    {destination !== undefined ? <Pressable accessibilityRole="button" accessibilityLabel="依目的地判定時區" accessibilityState={{ disabled }} disabled={disabled} style={[styles.detect, { backgroundColor: theme.colors.surfaceMuted }]} onPress={detect}><Text style={{ color: theme.colors.primary, fontWeight: '700' }}>依目的地判定</Text></Pressable> : null}
    {notice ? <Text accessibilityLiveRegion="polite" style={[styles.helper, { color: theme.colors.muted }]}>{notice}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  root: { gap: 8 }, label: { fontSize: 13, fontWeight: '700' },
  field: { minHeight: 48, borderWidth: 1, borderRadius: 10, padding: 12, justifyContent: 'center', fontSize: 16 },
  helper: { fontSize: 12, lineHeight: 18 }, options: { maxHeight: 220 },
  option: { minHeight: 44, justifyContent: 'center', padding: 12 },
  detect: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10 },
});
