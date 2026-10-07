import React, { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { inferTimezoneFromDestination, isValidTimezone, normalizeTimezone } from '@/lib/timezone';
import { EDITORIAL_COLORS } from '@/lib/theme';
import { DatePickerField, TimePickerField } from './FormPickers';
import type { Trip } from '@/lib/trips';

type CreateTripInput = {
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  created_by: string;
  default_departure_time?: string | null;
  timezone?: string | null;
};
type EditableTripInput = Pick<Trip, 'title' | 'destination' | 'start_date' | 'end_date' | 'default_departure_time' | 'timezone'>;

type Props = {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onCreate?: (input: CreateTripInput) => Promise<void>;
  initialTrip?: Trip | null;
  onUpdate?: (tripId: string, input: EditableTripInput) => Promise<void>;
};

export function CreateTripModal({ visible, userId, onClose, onCreate, initialTrip = null, onUpdate }: Props) {
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [departure, setDeparture] = useState('');
  const [timezone, setTimezone] = useState('Asia/Taipei');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTitle(initialTrip?.title ?? '');
    setDestination(initialTrip?.destination ?? '');
    setStart(initialTrip?.start_date ?? '');
    setEnd(initialTrip?.end_date ?? '');
    setDeparture(initialTrip?.default_departure_time ?? '');
    setTimezone(initialTrip?.timezone ?? 'Asia/Taipei');
    setError('');
  }, [visible, initialTrip]);

  async function submit() {
    setError('');
    if (!title.trim() || !destination.trim() || !start || !end) return setError('請填寫完整行程資料。');
    if (end < start) return setError('結束日期不可早於開始日期。');
    if (departure && !/^([01]\d|2[0-3]):[0-5]\d$/.test(departure)) return setError('每日出發時間請使用 HH:mm 格式。');
    if (!initialTrip && !userId) return setError('找不到登入使用者，請重新登入。');
    if (!isValidTimezone(timezone)) return setError('請輸入有效的 IANA 時區，例如 Asia/Tokyo。');
    setBusy(true);
    try {
      const changes = { title: title.trim(), destination: destination.trim(), start_date: start, end_date: end, default_departure_time: departure || null, timezone: normalizeTimezone(timezone) };
      if (initialTrip) {
        if (!onUpdate) throw new Error('目前無法編輯此行程。');
        await onUpdate(initialTrip.id, changes);
      } else {
        if (!onCreate) throw new Error('目前無法建立行程。');
        await onCreate({ ...changes, created_by: userId });
      }
      setTitle(''); setDestination(''); setStart(''); setEnd(''); setDeparture(''); setTimezone('Asia/Taipei');
      onClose();
    } catch (cause: any) {
      console.error('[CreateTripModal] create trip failed', cause);
      setError(cause?.message ?? '建立行程失敗，請稍後再試。');
    } finally {
      setBusy(false);
    }
  }

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <View style={styles.container}>
      <Text style={styles.title}>{initialTrip ? '編輯行程' : '新增行程'}</Text>
      <TextInput style={styles.input} placeholder="行程名稱" value={title} onChangeText={setTitle} />
      <TextInput style={styles.input} placeholder="目的地" value={destination} onChangeText={setDestination} />
      <DatePickerField label="開始日期" value={start} onChange={setStart} placeholder="2026-01-20" style={styles.input} />
      <DatePickerField label="結束日期" value={end} onChange={setEnd} placeholder="2026-01-23" style={styles.input} />
      <TimePickerField label="預設每日出發時間" value={departure} onChange={setDeparture} placeholder="09:00" style={styles.input} />
      <View style={styles.timezoneRow}><TextInput style={[styles.input, styles.timezoneInput]} placeholder="目的地時區，例如 Asia/Tokyo" value={timezone} onChangeText={setTimezone} autoCapitalize="none" autoCorrect={false} /><Pressable style={styles.detectTimezone} onPress={() => setTimezone(inferTimezoneFromDestination(destination))}><Text style={styles.detectTimezoneText}>自動判定</Text></Pressable></View>
      <Text style={styles.helper}>時區會用於行程日期、營業時間與天氣資料。</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable onPress={onClose}><Text>取消</Text></Pressable>
        <Pressable style={styles.save} onPress={() => void submit()} disabled={busy}><Text style={styles.white}>{busy ? '儲存中…' : initialTrip ? '儲存變更' : '建立行程'}</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  container: { marginTop: 'auto', padding: 24, gap: 14, backgroundColor: EDITORIAL_COLORS.paper, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderWidth: 1, borderColor: EDITORIAL_COLORS.line },
  title: { fontSize: 24, fontWeight: '800', color: EDITORIAL_COLORS.charcoal },
  input: { minHeight: 48, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 10, padding: 13, backgroundColor: EDITORIAL_COLORS.paper },
  timezoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timezoneInput: { flex: 1 },
  detectTimezone: { minHeight: 48, justifyContent: 'center', borderRadius: 10, backgroundColor: EDITORIAL_COLORS.terracottaSoft, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, paddingHorizontal: 12, paddingVertical: 13 },
  detectTimezoneText: { color: EDITORIAL_COLORS.terracotta, fontWeight: '700' },
  helper: { color: EDITORIAL_COLORS.taupe, fontSize: 12 },
  error: { color: EDITORIAL_COLORS.dangerText, backgroundColor: EDITORIAL_COLORS.dangerSoft, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, padding: 10, borderRadius: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 20 },
  save: { minHeight: 48, justifyContent: 'center', backgroundColor: EDITORIAL_COLORS.terracotta, borderRadius: 10, padding: 13 },
  white: { color: EDITORIAL_COLORS.paper, fontWeight: '700' },
});
