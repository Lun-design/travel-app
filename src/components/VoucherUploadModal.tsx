import * as DocumentPicker from 'expo-document-picker';
import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { uploadVoucher } from '@/lib/vouchers-api';
import type { ItineraryItem } from '@/lib/itinerary';
import { EDITORIAL_COLORS } from '@/lib/theme';
import { DatePickerField, TimePickerField } from './FormPickers';
import { getVoucherUploadErrorMessage, resolveVoucherUploadMimeType, validateVoucherUploadSize, VOUCHER_UPLOAD_MIME_TYPES } from '@/lib/vouchers';
import { useFormDraft } from '../hooks/useFormDraft';
import { FormDraftNotice } from './FormDraftNotice';
import { FormModalLayout } from './FormModalLayout';
import { getTimeContextLabel } from '@/lib/time-context';

export function VoucherUploadModal({ visible, tripId, userId, items, timezone, onClose, onUploaded }: {
  visible: boolean;
  tripId: string;
  userId: string;
  timezone?: string;
  items: ItineraryItem[];
  onClose: () => void;
  onUploaded: () => Promise<void> | void;
}) {
  const [title, setTitle] = useState('');
  const [itemId, setItemId] = useState<string | null>(null);
  const [reservationNumber, setReservationNumber] = useState('');
  const [usageDate, setUsageDate] = useState('');
  const [usageTime, setUsageTime] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const busyRef = useRef(false);

  useEffect(() => {
    if (visible) {
      setTitle('');
      setItemId(null);
      setReservationNumber('');
      setUsageDate('');
      setUsageTime('');
      setNotes('');
      setUploadError('');
    }
  }, [visible, tripId, userId]);
  const draftValue = { title, itemId, reservationNumber, usageDate, usageTime, notes };
  const protection = useFormDraft({ visible, scope: { userId, tripId, form: 'voucher-upload', recordId: 'new' }, initial: { title: '', itemId: null, reservationNumber: '', usageDate: '', usageTime: '', notes: '' }, value: draftValue, busy, onClose,
    validate: (v) => ['title', 'reservationNumber', 'usageDate', 'usageTime', 'notes'].every((k) => typeof v[k] === 'string') && (v.itemId === null || items.some((item) => item.id === v.itemId && item.trip_id === tripId)),
    onRestore: (data) => { const v = data as typeof draftValue; setTitle(v.title); setItemId(v.itemId); setReservationNumber(v.reservationNumber); setUsageDate(v.usageDate); setUsageTime(v.usageTime); setNotes(v.notes); },
  });

  async function choose() {
    if (busyRef.current || protection.recovery) return;
    busyRef.current = true;
    setBusy(true);
    setUploadError('');
    try {
      const result = await DocumentPicker.getDocumentAsync({ type: [...VOUCHER_UPLOAD_MIME_TYPES], copyToCacheDirectory: true, base64: false });
      if (result.canceled) return;
      const file = result.assets?.[0];
      if (!file) throw new Error('未取得檔案，請重新選擇。');
      const mimeType = resolveVoucherUploadMimeType(file.name, file.mimeType);
      if (file.size !== undefined) validateVoucherUploadSize(file.size);
      const data = file.file ? await file.file.arrayBuffer() : await (async () => {
        const response = await fetch(file.uri);
        if (!response.ok) throw new Error('無法讀取選取的檔案，請重新選擇。');
        return response.arrayBuffer();
      })();
      await uploadVoucher({ tripId, userId, itemId, title, reservationNumber, usageAt: usageDate && usageTime ? `${usageDate}T${usageTime}:00` : usageDate ? `${usageDate}T00:00:00` : null, notes, fileName: file.name, fileType: mimeType, data });
      protection.markSaved();
      try { await onUploaded(); } catch (error) { console.error('[VoucherUpload] list refresh failed after confirmed upload', error); }
      onClose();
    } catch (error) {
      console.error('[VoucherUpload] failed', error);
      setUploadError(getVoucherUploadErrorMessage(error));
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  const footer = <View style={{ gap: 8 }}><Pressable accessibilityRole="button" accessibilityLabel="選擇圖片或 PDF" style={styles.upload} disabled={busy} onPress={() => void choose()}><Text style={styles.white}>{busy ? '上傳中…' : '選擇圖片或 PDF'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="取消票券上傳" disabled={busy} onPress={protection.requestClose}><Text style={styles.cancel}>取消</Text></Pressable></View>;
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={protection.requestClose}>
    <View style={styles.backdrop}><View style={styles.card}>
      <FormModalLayout contentStyle={{ padding: 18, gap: 14 }} footer={footer} blocked={busy || !!protection.recovery} notice={<FormDraftNotice protection={protection} attachment />}>
      <Text style={styles.title}>新增預約與票券</Text>
      <Text style={styles.hint}>支援 JPG、PNG、WebP 與 PDF（最大 10 MB），可綁定到景點、航班或飯店。</Text>
      {uploadError ? <Text accessibilityRole="alert" style={styles.error}>{uploadError}</Text> : null}
      <TextInput style={styles.input} placeholder="票券名稱（選填）" value={title} onChangeText={setTitle} />
      <TextInput style={styles.input} placeholder="預約編號（選填）" value={reservationNumber} onChangeText={setReservationNumber} />
      <Text style={styles.label}>綁定行程項目（選填）</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Pressable style={[styles.chip, itemId === null && styles.selected]} onPress={() => setItemId(null)}><Text style={itemId === null ? styles.white : undefined}>不綁定</Text></Pressable>
        {items.map((item) => <Pressable key={item.id} style={[styles.chip, itemId === item.id && styles.selected]} onPress={() => setItemId(item.id)}><Text style={itemId === item.id ? styles.white : undefined}>{item.location_name}</Text></Pressable>)}
      </ScrollView>
      <Text style={styles.label}>使用日期與時間（選填）</Text>
      <View style={styles.dateTimeRow}><DatePickerField label="使用日期" value={usageDate} onChange={setUsageDate} style={styles.picker} /><TimePickerField label="使用時間" value={usageTime} onChange={setUsageTime} style={styles.picker} /></View>
      <Text style={styles.hint}>{getTimeContextLabel({ location_name: title }, timezone)} · 僅標示，不自動換算</Text>
      <TextInput style={[styles.input, styles.notes]} placeholder="備註（選填）" value={notes} onChangeText={setNotes} multiline />
      </FormModalLayout>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(31,31,31,.5)' },
  card: { backgroundColor: EDITORIAL_COLORS.paper, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 14, height: '90%', maxHeight: '90%', width: '100%', maxWidth: 720, alignSelf: 'center', overflow: 'hidden' },
  title: { fontSize: 22, fontWeight: '800', color: EDITORIAL_COLORS.charcoal },
  hint: { color: EDITORIAL_COLORS.taupe },
  error: { color: EDITORIAL_COLORS.dangerText, backgroundColor: EDITORIAL_COLORS.dangerSoft, borderRadius: 8, padding: 10, fontSize: 13 },
  label: { color: EDITORIAL_COLORS.charcoal, fontWeight: '700' },
  input: { minHeight: 48, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 10, padding: 13 },
  notes: { minHeight: 76, textAlignVertical: 'top' },
  dateTimeRow: { flexDirection: 'row', gap: 8 },
  picker: { flex: 1, minWidth: 0 },
  chips: { gap: 8 },
  chip: { minHeight: 44, justifyContent: 'center', backgroundColor: EDITORIAL_COLORS.sand, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 },
  selected: { backgroundColor: EDITORIAL_COLORS.terracotta },
  upload: { minHeight: 48, justifyContent: 'center', backgroundColor: EDITORIAL_COLORS.terracotta, borderRadius: 10, padding: 14, alignItems: 'center' },
  white: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
  cancel: { color: EDITORIAL_COLORS.taupe, textAlign: 'center', fontWeight: '700', minHeight: 44, paddingVertical: 12 },
});
