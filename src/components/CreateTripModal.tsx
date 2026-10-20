import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { isValidTimezone, normalizeTimezone } from '@/lib/timezone';
import { EDITORIAL_COLORS } from '@/lib/theme';
import { DatePickerField, TimePickerField } from './FormPickers';
import { TimezonePickerField } from './TimezonePickerField';
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
  const [confirmClose, setConfirmClose] = useState(false);
  const baseline = useRef<string[]>([]);
  const session = useRef<{ scope: string; token: object } | null>(null);
  const saving = useRef(false);
  const scope = JSON.stringify([userId, initialTrip?.id ?? null]);

  useEffect(() => {
    if (!visible) { session.current = null; saving.current = false; return; }
    if (session.current?.scope === scope) return;
    session.current = { scope, token: {} };
    baseline.current = [initialTrip?.title ?? '', initialTrip?.destination ?? '', initialTrip?.start_date ?? '', initialTrip?.end_date ?? '', initialTrip?.default_departure_time ?? '', initialTrip?.timezone ?? 'Asia/Taipei'];
    const [nextTitle, nextDestination, nextStart, nextEnd, nextDeparture, nextTimezone] = baseline.current;
    setTitle(nextTitle); setDestination(nextDestination); setStart(nextStart); setEnd(nextEnd); setDeparture(nextDeparture); setTimezone(nextTimezone);
    saving.current = false;
    setBusy(false);
    setConfirmClose(false);
    setError('');
  }, [visible, initialTrip, scope]);

  useEffect(() => () => { session.current = null; }, []);

  function requestClose() {
    if (saving.current) return;
    if (confirmClose) { setConfirmClose(false); return; }
    const dirty = [title, destination, start, end, departure, timezone].some((value, index) => value !== baseline.current[index]);
    if (dirty) setConfirmClose(true);
    else onClose();
  }

  async function submit() {
    if (saving.current || confirmClose || !visible || session.current?.scope !== scope) return;
    setError('');
    if (!title.trim() || !destination.trim() || !start || !end) return setError('請填寫完整行程資料。');
    if (end < start) return setError('結束日期不可早於開始日期。');
    if (departure && !/^([01]\d|2[0-3]):[0-5]\d$/.test(departure)) return setError('每日出發時間請使用 HH:mm 格式。');
    if (!initialTrip && !userId) return setError('找不到登入使用者，請重新登入。');
    if (!isValidTimezone(timezone)) return setError('請輸入有效的 IANA 時區，例如 Asia/Tokyo。');
    saving.current = true;
    setBusy(true);
    const token = session.current.token;
    try {
      const changes = { title: title.trim(), destination: destination.trim(), start_date: start, end_date: end, default_departure_time: departure || null, timezone: normalizeTimezone(timezone) };
      if (initialTrip) {
        if (!onUpdate) throw new Error('目前無法編輯此行程。');
        await onUpdate(initialTrip.id, changes);
      } else {
        if (!onCreate) throw new Error('目前無法建立行程。');
        await onCreate({ ...changes, created_by: userId });
      }
      if (session.current?.token !== token) return;
      baseline.current = ['', '', '', '', '', 'Asia/Taipei'];
      setTitle(''); setDestination(''); setStart(''); setEnd(''); setDeparture(''); setTimezone('Asia/Taipei');
      onClose();
    } catch (cause: unknown) {
      if (session.current?.token !== token) return;
      console.error('[CreateTripModal] create trip failed', cause);
      setError(cause && typeof cause === 'object' && 'message' in cause && typeof cause.message === 'string' ? cause.message : '建立行程失敗，請稍後再試。');
    } finally {
      if (session.current?.token === token) { saving.current = false; setBusy(false); }
    }
  }

  return <Modal visible={visible} animationType="slide" onRequestClose={requestClose}>
    <View style={styles.container}>
      <Text style={styles.title}>{initialTrip ? '編輯行程' : '新增行程'}</Text>
      <ScrollView style={styles.form} contentContainerStyle={styles.fields} keyboardShouldPersistTaps="handled">
      <TextInput style={styles.input} placeholder="行程名稱" value={title} onChangeText={setTitle} editable={!busy && !confirmClose} />
      <TextInput style={styles.input} placeholder="目的地" value={destination} onChangeText={setDestination} editable={!busy && !confirmClose} />
      <DatePickerField label="開始日期" value={start} onChange={setStart} placeholder="2026-01-20" style={styles.input} disabled={busy || confirmClose} />
      <DatePickerField label="結束日期" value={end} onChange={setEnd} placeholder="2026-01-23" style={styles.input} disabled={busy || confirmClose} />
      <TimePickerField label="預設每日出發時間" value={departure} onChange={setDeparture} placeholder="09:00" style={styles.input} disabled={busy || confirmClose} />
      <TimezonePickerField value={timezone} onChange={setTimezone} destination={destination} disabled={busy || confirmClose} />
      <Text style={styles.helper}>時區會用於行程日期、營業時間與天氣資料。</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
      {confirmClose ? <View style={styles.confirmation}>
        <Text accessibilityRole="alert" style={styles.confirmTitle}>尚有未儲存的變更</Text>
        <Text style={styles.helper}>放棄後將不會保留這次修改。</Text>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="繼續編輯" style={styles.button} onPress={() => setConfirmClose(false)}><Text>繼續編輯</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="放棄修改" style={styles.button} onPress={() => { if (!saving.current) { setConfirmClose(false); onClose(); } }}><Text style={{ color: EDITORIAL_COLORS.dangerText }}>放棄修改</Text></Pressable>
        </View>
      </View> : <View style={styles.actions}>
        <Pressable accessibilityRole="button" accessibilityLabel="取消" style={styles.button} onPress={requestClose} disabled={busy}><Text>取消</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel={initialTrip ? '儲存變更' : '建立行程'} accessibilityState={{ disabled: busy, busy }} style={styles.save} onPress={() => void submit()} disabled={busy}><Text style={styles.white}>{busy ? '儲存中…' : initialTrip ? '儲存變更' : '建立行程'}</Text></Pressable>
      </View>}
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  container: { marginTop: 'auto', maxHeight: '95%', padding: 24, gap: 14, backgroundColor: EDITORIAL_COLORS.paper, borderTopLeftRadius: 14, borderTopRightRadius: 14, borderWidth: 1, borderColor: EDITORIAL_COLORS.line },
  form: { flexShrink: 1 }, fields: { gap: 14, paddingBottom: 8 },
  title: { fontSize: 24, fontWeight: '800', color: EDITORIAL_COLORS.charcoal },
  input: { minHeight: 48, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 10, padding: 13, backgroundColor: EDITORIAL_COLORS.paper },
  helper: { color: EDITORIAL_COLORS.taupe, fontSize: 12 },
  error: { color: EDITORIAL_COLORS.dangerText, backgroundColor: EDITORIAL_COLORS.dangerSoft, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, padding: 10, borderRadius: 8 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 20 },
  button: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' },
  confirmation: { gap: 8, padding: 12, borderRadius: 10, backgroundColor: EDITORIAL_COLORS.dangerSoft },
  confirmTitle: { fontWeight: '700', color: EDITORIAL_COLORS.charcoal },
  save: { minHeight: 48, justifyContent: 'center', backgroundColor: EDITORIAL_COLORS.terracotta, borderRadius: 10, padding: 13 },
  white: { color: EDITORIAL_COLORS.paper, fontWeight: '700' },
});
