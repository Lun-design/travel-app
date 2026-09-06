import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import type { OpeningHours, OpeningPeriod, Weekday } from '@/lib/itinerary';
import { draftToOpeningHours, toOpeningHoursDraft, WEEKDAYS, type OpeningHoursDraft } from '@/lib/opening-hours';
import { EDITORIAL_COLORS } from '@/lib/theme';

type PickerState = { day: Weekday; periodIndex: number; field: 'open' | 'close' } | null;
const TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => `${String(Math.floor(index / 2)).padStart(2, '0')}:${index % 2 ? '30' : '00'}`);

type Props = {
  value: OpeningHours | null | undefined;
  onChange: (value: OpeningHours | null) => void;
};

export function OpeningHoursEditor({ value, onChange }: Props) {
  const [draft, setDraft] = useState<OpeningHoursDraft>(() => toOpeningHoursDraft(value));
  const [picker, setPicker] = useState<PickerState>(null);
  const pickerValue = useMemo(() => picker ? draft[picker.day].periods[picker.periodIndex]?.[picker.field] : '', [draft, picker]);

  useEffect(() => setDraft(toOpeningHoursDraft(value)), [value]);

  function updateDay(day: Weekday, changes: Partial<OpeningHoursDraft[Weekday]>) {
    const next = { ...draft, [day]: { ...draft[day], ...changes } };
    setDraft(next);
    onChange(draftToOpeningHours(next));
  }

  function updatePeriod(day: Weekday, periodIndex: number, changes: Partial<OpeningPeriod>) {
    const periods = draft[day].periods.map((period, index) => index === periodIndex ? { ...period, ...changes } : period);
    updateDay(day, { periods });
  }

  function addPeriod(day: Weekday) {
    if (draft[day].periods.length >= 2) return;
    updateDay(day, { periods: [...draft[day].periods, { open: '13:00', close: '17:00' }] });
  }

  function removePeriod(day: Weekday, periodIndex: number) {
    updateDay(day, { periods: draft[day].periods.filter((_, index) => index !== periodIndex) });
  }

  function chooseTime(valueToSet: string) {
    if (!picker) return;
    updatePeriod(picker.day, picker.periodIndex, { [picker.field]: valueToSet });
    setPicker(null);
  }

  return <View style={styles.container}>
    <Text style={styles.helper}>未設定的日期不會觸發營業時間預警；可新增最多兩段營業時段。</Text>
    {WEEKDAYS.map(({ key, label }) => {
      const day = draft[key];
      return <View key={key} style={styles.dayRow}>
        <View style={styles.dayHeader}>
          <Text style={styles.dayLabel}>{label}</Text>
          <View style={styles.closedControl}><Text style={styles.closedLabel}>公休</Text><Switch value={day.closed} onValueChange={(closed) => updateDay(key, { closed, periods: closed ? [] : day.periods })} /></View>
        </View>
        {day.closed ? <Text style={styles.closedText}>休息</Text> : day.periods.length ? day.periods.map((period, index) => <View style={styles.periodRow} key={`${key}-${index}`}>
          <Pressable style={styles.timeButton} onPress={() => setPicker({ day: key, periodIndex: index, field: 'open' })}><Text style={styles.timeText}>{period.open}</Text></Pressable>
          <Text style={styles.dash}>—</Text>
          <Pressable style={styles.timeButton} onPress={() => setPicker({ day: key, periodIndex: index, field: 'close' })}><Text style={styles.timeText}>{period.close}</Text></Pressable>
          <Pressable style={styles.removeButton} onPress={() => removePeriod(key, index)}><Text style={styles.removeText}>移除</Text></Pressable>
        </View>) : <Text style={styles.unsetText}>尚未設定時段</Text>}
        {!day.closed && day.periods.length < 2 ? <Pressable style={styles.addButton} onPress={() => addPeriod(key)}><Text style={styles.addText}>＋ 新增時段</Text></Pressable> : null}
      </View>;
    })}
    <Modal visible={Boolean(picker)} transparent animationType="fade" onRequestClose={() => setPicker(null)}>
      <View style={styles.pickerBackdrop}><View style={styles.pickerCard}>
        <Text style={styles.pickerTitle}>選擇{picker?.field === 'open' ? '開始' : '結束'}時間</Text>
        <ScrollView style={styles.options} contentContainerStyle={styles.optionsContent}>{TIME_OPTIONS.map((time) => <Pressable key={time} style={[styles.option, pickerValue === time && styles.optionSelected]} onPress={() => chooseTime(time)}><Text style={pickerValue === time ? styles.optionSelectedText : styles.optionText}>{time}</Text></Pressable>)}</ScrollView>
        <Pressable onPress={() => setPicker(null)}><Text style={styles.cancel}>取消</Text></Pressable>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { gap: 8 },
  helper: { color: EDITORIAL_COLORS.taupe, fontSize: 12, lineHeight: 17 },
  dayRow: { padding: 10, borderRadius: 10, backgroundColor: EDITORIAL_COLORS.sand, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, gap: 7 },
  dayHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dayLabel: { color: EDITORIAL_COLORS.charcoal, fontWeight: '800', fontSize: 15 },
  closedControl: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  closedLabel: { color: EDITORIAL_COLORS.taupe, fontSize: 12 },
  closedText: { color: '#94a3b8', fontSize: 13 },
  unsetText: { color: '#94a3b8', fontSize: 13 },
  periodRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  timeButton: { minWidth: 75, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingVertical: 9, paddingHorizontal: 11, backgroundColor: EDITORIAL_COLORS.paper, borderWidth: 1, borderColor: EDITORIAL_COLORS.line },
  timeText: { color: EDITORIAL_COLORS.terracotta, fontWeight: '800' },
  dash: { color: EDITORIAL_COLORS.taupe },
  removeButton: { marginLeft: 'auto', minHeight: 44, justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 5 },
  removeText: { color: EDITORIAL_COLORS.dangerText, fontSize: 12, fontWeight: '700' },
  addButton: { alignSelf: 'flex-start', paddingVertical: 5 },
  addText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800' },
  pickerBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(31, 31, 31, 0.4)', padding: 24 },
  pickerCard: { width: '100%', maxWidth: 360, maxHeight: '80%', padding: 18, borderRadius: 14, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, backgroundColor: EDITORIAL_COLORS.paper, gap: 10 },
  pickerTitle: { color: EDITORIAL_COLORS.charcoal, fontSize: 18, fontWeight: '800' },
  options: { maxHeight: 360 },
  optionsContent: { gap: 4 },
  option: { alignItems: 'center', borderRadius: 9, paddingVertical: 9 },
  optionSelected: { backgroundColor: EDITORIAL_COLORS.terracottaSoft },
  optionText: { color: EDITORIAL_COLORS.charcoal, fontSize: 16 },
  optionSelectedText: { color: EDITORIAL_COLORS.terracotta, fontWeight: '800', fontSize: 16 },
  cancel: { alignSelf: 'flex-end', color: EDITORIAL_COLORS.taupe, fontWeight: '700', minHeight: 44, padding: 12 },
});
