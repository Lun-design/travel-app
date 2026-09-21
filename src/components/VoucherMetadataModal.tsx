import React, { useEffect, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { updateVoucher } from '@/lib/vouchers-api';
import type { Voucher } from '@/lib/vouchers';
import { EDITORIAL_COLORS } from '@/lib/theme';
import { DatePickerField, TimePickerField } from './FormPickers';

type Props = {
  visible: boolean;
  voucher: Voucher | null;
  onClose: () => void;
  onSaved: (voucher: Voucher) => Promise<void> | void;
};

function splitUsageAt(value: string | null | undefined): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  return { date: value.slice(0, 10), time: value.length >= 16 ? value.slice(11, 16) : '' };
}

export function VoucherMetadataModal({ visible, voucher, onClose, onSaved }: Props) {
  const [reservationNumber, setReservationNumber] = useState('');
  const [usageDate, setUsageDate] = useState('');
  const [usageTime, setUsageTime] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!visible || !voucher) return;
    const usage = splitUsageAt(voucher.usage_at);
    setReservationNumber(voucher.reservation_number ?? '');
    setUsageDate(usage.date);
    setUsageTime(usage.time);
    setNotes(voucher.notes ?? '');
  }, [visible, voucher]);

  async function save() {
    if (!voucher || saving) return;
    setSaving(true);
    try {
      const updated = await updateVoucher(voucher.id, {
        reservation_number: reservationNumber,
        usage_at: usageDate ? `${usageDate}T${usageTime || '00:00'}:00` : null,
        notes,
      });
      await onSaved(updated);
      onClose();
    } catch (error: any) {
      Alert.alert('儲存票券資料失敗', error?.message ?? '請稍後再試');
    } finally {
      setSaving(false);
    }
  }

  return <Modal visible={visible && Boolean(voucher)} transparent animationType="fade" onRequestClose={() => { if (!saving) onClose(); }}>
    <View style={styles.backdrop}><View style={styles.card}>
      <Text style={styles.title}>編輯票券資料</Text>
      <Text style={styles.subtitle}>{voucher?.title}</Text>
      <TextInput style={styles.input} placeholder="預約編號（選填）" value={reservationNumber} onChangeText={setReservationNumber} />
      <Text style={styles.label}>使用日期與時間（選填）</Text>
      <View style={styles.dateTimeRow}><DatePickerField label="使用日期" value={usageDate} onChange={setUsageDate} style={styles.picker} /><TimePickerField label="使用時間" value={usageTime} onChange={setUsageTime} style={styles.picker} /></View>
      <TextInput style={[styles.input, styles.notes]} placeholder="備註（選填）" value={notes} onChangeText={setNotes} multiline />
      <View style={styles.actions}>
        <Pressable disabled={saving} style={styles.cancel} onPress={onClose}><Text style={styles.cancelText}>取消</Text></Pressable>
        <Pressable disabled={saving} style={styles.save} onPress={() => void save()}><Text style={styles.saveText}>{saving ? '儲存中…' : '儲存'}</Text></Pressable>
      </View>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(31,31,31,.5)' },
  card: { backgroundColor: EDITORIAL_COLORS.paper, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 14, padding: 22, gap: 14, maxWidth: 440, width: '100%' },
  title: { fontSize: 22, fontWeight: '800', color: EDITORIAL_COLORS.charcoal },
  subtitle: { color: EDITORIAL_COLORS.taupe, fontSize: 13 },
  label: { color: EDITORIAL_COLORS.charcoal, fontWeight: '700' },
  input: { minHeight: 48, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 10, padding: 13 },
  notes: { minHeight: 76, textAlignVertical: 'top' },
  dateTimeRow: { flexDirection: 'row', gap: 8 },
  picker: { flex: 1, minWidth: 0 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  cancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 },
  cancelText: { color: EDITORIAL_COLORS.taupe, fontWeight: '700' },
  save: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 10, backgroundColor: EDITORIAL_COLORS.terracotta },
  saveText: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
});
