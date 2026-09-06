import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { inferTimezoneFromDestination, isValidTimezone, normalizeTimezone } from '@/lib/timezone';

type CreateTripInput = {
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  created_by: string;
  default_departure_time?: string | null;
  timezone?: string | null;
};

type Props = {
  visible: boolean;
  userId: string;
  onClose: () => void;
  onCreate: (input: CreateTripInput) => Promise<void>;
};

export function CreateTripModal({ visible, userId, onClose, onCreate }: Props) {
  const [title, setTitle] = useState('');
  const [destination, setDestination] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [departure, setDeparture] = useState('');
  const [timezone, setTimezone] = useState('Asia/Taipei');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit() {
    setError('');
    if (!title.trim() || !destination.trim() || !start || !end) return setError('請填寫完整行程資料。');
    if (end < start) return setError('結束日期不可早於開始日期。');
    if (departure && !/^([01]\d|2[0-3]):[0-5]\d$/.test(departure)) return setError('每日出發時間請使用 HH:mm 格式。');
    if (!userId) return setError('找不到登入使用者，請重新登入。');
    if (!isValidTimezone(timezone)) return setError('請輸入有效的 IANA 時區，例如 Asia/Tokyo。');
    setBusy(true);
    try {
      await onCreate({ title: title.trim(), destination: destination.trim(), start_date: start, end_date: end, created_by: userId, default_departure_time: departure || null, timezone: normalizeTimezone(timezone) });
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
      <Text style={styles.title}>新增行程</Text>
      <TextInput style={styles.input} placeholder="行程名稱" value={title} onChangeText={setTitle} />
      <TextInput style={styles.input} placeholder="目的地" value={destination} onChangeText={setDestination} />
      <TextInput style={styles.input} placeholder="開始日期 YYYY-MM-DD" value={start} onChangeText={setStart} />
      <TextInput style={styles.input} placeholder="結束日期 YYYY-MM-DD" value={end} onChangeText={setEnd} />
      <TextInput style={styles.input} placeholder="每日出發時間（選填，預設 09:00）" value={departure} onChangeText={setDeparture} autoCapitalize="none" />
      <View style={styles.timezoneRow}><TextInput style={[styles.input, styles.timezoneInput]} placeholder="目的地時區，例如 Asia/Tokyo" value={timezone} onChangeText={setTimezone} autoCapitalize="none" autoCorrect={false} /><Pressable style={styles.detectTimezone} onPress={() => setTimezone(inferTimezoneFromDestination(destination))}><Text style={styles.detectTimezoneText}>自動判定</Text></Pressable></View>
      <Text style={styles.helper}>時區會用於行程日期、營業時間與天氣資料。</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.actions}>
        <Pressable onPress={onClose}><Text>取消</Text></Pressable>
        <Pressable style={styles.save} onPress={() => void submit()} disabled={busy}><Text style={styles.white}>{busy ? '建立中…' : '建立行程'}</Text></Pressable>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  container: { marginTop: 'auto', padding: 24, gap: 14, backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  title: { fontSize: 24, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 10, padding: 13 },
  timezoneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timezoneInput: { flex: 1 },
  detectTimezone: { borderRadius: 10, backgroundColor: '#e0e7ff', paddingHorizontal: 12, paddingVertical: 13 },
  detectTimezoneText: { color: '#3730a3', fontWeight: '700' },
  helper: { color: '#64748b', fontSize: 12 },
  error: { color: '#b91c1c', backgroundColor: '#fef2f2', padding: 10, borderRadius: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 20 },
  save: { backgroundColor: '#2563eb', borderRadius: 10, padding: 13 },
  white: { color: 'white', fontWeight: '700' },
});
