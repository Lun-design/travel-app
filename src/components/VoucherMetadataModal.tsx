import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { updateVoucher } from '@/lib/vouchers-api';
import type { Voucher } from '@/lib/vouchers';
import { EDITORIAL_COLORS } from '@/lib/theme';
import { DatePickerField, TimePickerField } from './FormPickers';
import { getVoucherCategoryLabel, voucherCategoryOptions, type VoucherCategory } from '@/lib/voucher-categories';
import { useFormDraft } from '../hooks/useFormDraft';
import { FormDraftNotice } from './FormDraftNotice';
import { FormModalLayout } from './FormModalLayout';
import { getTimeContextLabel } from '@/lib/time-context';

type Props = {
  visible: boolean;
  voucher: Voucher | null;
  userId?: string;
  timezone?: string;
  onClose: () => void;
  onSaved: (voucher: Voucher) => Promise<void> | void;
};

function splitUsageAt(value: string | null | undefined): { date: string; time: string } {
  if (!value) return { date: '', time: '' };
  return { date: value.slice(0, 10), time: value.length >= 16 ? value.slice(11, 16) : '' };
}

export function VoucherMetadataModal({ visible, voucher, userId = '', timezone, onClose, onSaved }: Props) {
  const [reservationNumber, setReservationNumber] = useState('');
  const [usageDate, setUsageDate] = useState('');
  const [usageTime, setUsageTime] = useState('');
  const [notes, setNotes] = useState('');
  const [category, setCategory] = useState<VoucherCategory>('other');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const savingRef = useRef(false);

  useEffect(() => {
    if (!visible || !voucher) return;
    const usage = splitUsageAt(voucher.usage_at);
    setReservationNumber(voucher.reservation_number ?? '');
    setUsageDate(usage.date);
    setUsageTime(usage.time);
    setNotes(voucher.notes ?? '');
    setCategory(voucher.category ?? getVoucherCategoryLabel(null, voucher.title).value);
    setSaveError('');
  }, [visible, voucher?.id]);

  const usage = splitUsageAt(voucher?.usage_at);
  const draftValue = { reservationNumber, usageDate, usageTime, notes, category };
  const protection = useFormDraft({ visible: visible && !!voucher, scope: { userId, tripId: voucher?.trip_id ?? '', form: 'voucher-edit', recordId: voucher?.id ?? 'new' }, initial: { reservationNumber: voucher?.reservation_number ?? '', usageDate: usage.date, usageTime: usage.time, notes: voucher?.notes ?? '', category: voucher?.category ?? getVoucherCategoryLabel(null, voucher?.title ?? '').value }, value: draftValue, busy: saving, onClose,
    validate: (v) => ['reservationNumber', 'usageDate', 'usageTime', 'notes'].every((k) => typeof v[k] === 'string') && voucherCategoryOptions.some((c) => c.value === v.category),
    onRestore: (data) => { const v = data as typeof draftValue; setReservationNumber(v.reservationNumber); setUsageDate(v.usageDate); setUsageTime(v.usageTime); setNotes(v.notes); setCategory(v.category); },
  });

  async function save() {
    if (!voucher || savingRef.current || protection.recovery) return;
    savingRef.current = true; setSaveError(''); setSaving(true);
    try {
      const updated = await updateVoucher(voucher.id, {
        reservation_number: reservationNumber,
        usage_at: usageDate ? `${usageDate}T${usageTime || '00:00'}:00` : null,
        notes,
        category,
      });
      protection.markSaved();
      try { await onSaved(updated); } catch (error) { console.error('[VoucherMetadata] refresh failed after confirmed save', error); }
      onClose();
    } catch (error: any) {
      setSaveError(error?.message ?? '儲存失敗，草稿已保留。');
      Alert.alert('儲存票券資料失敗', error?.message ?? '請稍後再試');
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  }

  const categoryControls = <View style={styles.categoryRow}><Text style={styles.label}>票券類別</Text>{voucherCategoryOptions.map((option) => <Pressable key={option.value} accessibilityRole="button" style={[styles.categoryOption, category === option.value && styles.categorySelected]} onPress={() => setCategory(option.value)}><Text>{option.icon} {option.label}</Text></Pressable>)}</View>;

  const footer = <View style={styles.actions}><Pressable accessibilityRole="button" accessibilityLabel="取消票券編輯" disabled={saving} style={styles.cancel} onPress={protection.requestClose}><Text style={styles.cancelText}>取消</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="儲存票券資料" disabled={saving} style={styles.save} onPress={() => void save()}><Text style={styles.saveText}>{saving ? '儲存中…' : '儲存'}</Text></Pressable></View>;
  return <Modal visible={visible && Boolean(voucher)} transparent animationType="fade" onRequestClose={protection.requestClose}>
    <View style={styles.backdrop}><View style={styles.card}>
      <FormModalLayout contentStyle={{ padding: 18, gap: 14 }} footer={footer} blocked={saving || !!protection.recovery} notice={<FormDraftNotice protection={protection} />}>
      {saveError ? <Text accessibilityRole="alert" style={{ color: EDITORIAL_COLORS.dangerText }}>{saveError}</Text> : null}
      <Text style={styles.title}>編輯票券資料</Text>
      <Text style={styles.subtitle}>{voucher?.title}</Text>
      {categoryControls}
      <TextInput style={styles.input} placeholder="預約編號（選填）" value={reservationNumber} onChangeText={setReservationNumber} />
      <Text style={styles.label}>使用日期與時間（選填）</Text>
      <View style={styles.dateTimeRow}><DatePickerField label="使用日期" value={usageDate} onChange={setUsageDate} style={styles.picker} /><TimePickerField label="使用時間" value={usageTime} onChange={setUsageTime} style={styles.picker} /></View>
      <Text style={styles.subtitle}>{getTimeContextLabel({ location_name: voucher?.title }, timezone)} · 僅標示，不自動換算</Text>
      <TextInput style={[styles.input, styles.notes]} placeholder="備註（選填）" value={notes} onChangeText={setNotes} multiline />
      </FormModalLayout>
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(31,31,31,.5)' },
  card: { backgroundColor: EDITORIAL_COLORS.paper, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 14, height: '88%', maxHeight: '88%', maxWidth: 520, width: '100%', alignSelf: 'center', overflow: 'hidden' },
  title: { fontSize: 22, fontWeight: '800', color: EDITORIAL_COLORS.charcoal },
  subtitle: { color: EDITORIAL_COLORS.taupe, fontSize: 13 },
  label: { color: EDITORIAL_COLORS.charcoal, fontWeight: '700' },
  input: { minHeight: 48, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 10, padding: 13 },
  notes: { minHeight: 76, textAlignVertical: 'top' },
  dateTimeRow: { flexDirection: 'row', gap: 8 },
  picker: { flex: 1, minWidth: 0 },
  categoryRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  categoryOption: { paddingHorizontal: 10, paddingVertical: 8, borderRadius: 9, backgroundColor: EDITORIAL_COLORS.sand },
  categorySelected: { backgroundColor: EDITORIAL_COLORS.terracotta },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 4 },
  cancel: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 14 },
  cancelText: { color: EDITORIAL_COLORS.taupe, fontWeight: '700' },
  save: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 18, borderRadius: 10, backgroundColor: EDITORIAL_COLORS.terracotta },
  saveText: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
});
