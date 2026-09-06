import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import type { Expense } from '@/lib/expenses-api';
import type { TripMemberWithProfile } from '@/lib/trips';
import { buildSplitAmounts, convertToTwd, normalizeCurrency, SUPPORTED_CURRENCIES, type ExchangeRateSnapshot, type SplitMode } from '@/lib/exchange-rates';
import { EDITORIAL_COLORS, getThemeForMode, type ThemeMode } from '@/lib/theme';

type Props = {
  visible: boolean;
  tripId?: string;
  expense?: Expense | null;
  members: TripMemberWithProfile[];
  userId: string;
  themeMode?: ThemeMode;
  rateSnapshot?: ExchangeRateSnapshot;
  onLockRate?: (currency: string, rate: number) => Promise<void>;
  onClose: () => void;
  onSave: (expense: Partial<Expense> & { trip_id: string; payer_id: string }, splits: { user_id: string; amount: number }[]) => Promise<void>;
};

const EXPENSE_CATEGORIES = ['門票', '餐飲', '交通', '購物', '其他'] as const;

export function ExpenseModal({ visible, tripId, expense, members, userId, themeMode = 'system', rateSnapshot, onLockRate, onClose, onSave }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('TWD');
  const [payer, setPayer] = useState(userId);
  const [selected, setSelected] = useState<string[]>([]);
  const [splitMode, setSplitMode] = useState<SplitMode>('amount');
  const [splitValues, setSplitValues] = useState<Record<string, string>>({});
  const [category, setCategory] = useState<string>('其他');
  const [saving, setSaving] = useState(false);
  const [manualRate, setManualRate] = useState('');

  useEffect(() => {
    if (!visible) return;
    setTitle(expense?.title ?? '');
    setAmount(expense ? String(expense.amount) : '');
    setCurrency(normalizeCurrency(expense?.currency));
    setPayer(expense?.payer_id ?? userId);
    const expenseSplits = expense?.splits ?? [];
    setSelected(expenseSplits.length ? expenseSplits.map((split) => split.user_id) : members.map((member) => member.user_id));
    setSplitValues(Object.fromEntries(expenseSplits.map((split) => [split.user_id, String(split.amount)])));
    setSplitMode('amount');
    setCategory(expense?.category && expense.category !== 'general' ? expense.category : '其他');
  }, [visible, expense, userId, members]);

  const total = Number(amount);
  const splitAmounts = useMemo(() => {
    try { return buildSplitAmounts(total, selected, splitValues, splitMode); } catch { return {}; }
  }, [total, selected, splitValues, splitMode]);

  async function save() {
    const currentTripId = tripId || expense?.trip_id || members[0]?.trip_id || '';
    if (!title.trim()) return Alert.alert('欄位未完成', '請輸入旅費項目名稱。');
    if (!Number.isFinite(total) || total <= 0) return Alert.alert('金額格式錯誤', '請輸入大於 0 的數字。');
    if (!payer) return Alert.alert('付款人未選擇', '請選擇付款人。');
    if (!selected.length) return Alert.alert('分攤成員未選擇', '請至少勾選一位分攤成員。');
    let amounts: Record<string, number>;
    try { amounts = buildSplitAmounts(total, selected, splitValues, splitMode); } catch (error) {
      Alert.alert('分攤設定錯誤', error instanceof Error ? error.message : '請檢查自訂分攤金額或比例。');
      return;
    }
    setSaving(true);
    try {
      await onSave({ ...(expense?.id ? { id: expense.id } : {}), trip_id: currentTripId, payer_id: payer, title: title.trim(), amount: total, currency: normalizeCurrency(currency), category }, selected.map((user_id) => ({ user_id, amount: amounts[user_id] })));
      onClose();
    } catch (error: any) {
      console.error('[ExpenseModal] save failed', error);
      Alert.alert('儲存旅費失敗', error?.message || '請確認付款人與分攤成員是有效的 Supabase UUID。');
    } finally { setSaving(false); }
  }

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <ScrollView contentContainerStyle={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>{expense ? '編輯旅費' : '新增旅費'}</Text>
      <TextInput style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} placeholder="項目名稱，例如：晚餐" placeholderTextColor={theme.colors.muted} value={title} onChangeText={setTitle} />
      <View style={styles.row}><TextInput style={[styles.input, styles.flex, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} placeholder="金額" placeholderTextColor={theme.colors.muted} keyboardType="decimal-pad" value={amount} onChangeText={setAmount} /><View style={styles.currencyChoices}>{SUPPORTED_CURRENCIES.map((option) => <Pressable key={option} style={[styles.currencyChip, normalizeCurrency(currency) === option && styles.selected]} onPress={() => setCurrency(option)}><Text style={normalizeCurrency(currency) === option ? styles.white : { color: theme.colors.text }}>{option}</Text></Pressable>)}</View></View>
      <Text style={[styles.conversion, { color: theme.colors.muted }]}>≈ TWD {Number.isFinite(total) ? convertToTwd(total, currency, rateSnapshot?.rates).toFixed(2) : '—'}</Text><View style={styles.rateRow}><Text style={[styles.rateHint, { color: theme.colors.muted }]}>1 {normalizeCurrency(currency)} ≈ TWD {rateSnapshot?.rates[normalizeCurrency(currency)]?.toFixed(4) ?? '—'} {rateSnapshot?.source === 'manual' && rateSnapshot.lockedCurrencies.includes(normalizeCurrency(currency)) ? '（已鎖定）' : ''}</Text>{onLockRate && normalizeCurrency(currency) !== 'TWD' ? <><TextInput style={[styles.rateInput, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} keyboardType="decimal-pad" placeholder="自訂匯率" placeholderTextColor={theme.colors.muted} value={manualRate} onChangeText={setManualRate} /><Pressable style={styles.lockRateButton} onPress={() => { const value = Number(manualRate); if (Number.isFinite(value) && value > 0) void onLockRate(currency, value).then(() => setManualRate('')); }}><Text style={styles.lockRateText}>鎖定</Text></Pressable></> : null}</View>
      <Text style={[styles.label, { color: theme.colors.text }]}>費用類別</Text>
      <View style={styles.chips}>{EXPENSE_CATEGORIES.map((option) => <Pressable key={option} style={[styles.chip, { backgroundColor: theme.colors.surfaceMuted }, category === option && styles.selected]} onPress={() => setCategory(option)}><Text style={category === option ? styles.white : { color: theme.colors.text }}>{option}</Text></Pressable>)}</View>
      <Text style={[styles.label, { color: theme.colors.text }]}>付款人</Text>
      <View style={styles.chips}>{members.map((member) => <Pressable key={member.user_id} style={[styles.chip, { backgroundColor: theme.colors.surfaceMuted }, payer === member.user_id && styles.selected]} onPress={() => setPayer(member.user_id)}><Text style={payer === member.user_id ? styles.white : { color: theme.colors.text }}>{member.profile?.display_name || member.user_id.slice(0, 8)}</Text></Pressable>)}</View>
      <Text style={[styles.label, { color: theme.colors.text }]}>分攤方式：自訂分攤</Text>
      <View style={styles.chips}><Pressable style={[styles.chip, { backgroundColor: theme.colors.surfaceMuted }, splitMode === 'amount' && styles.selected]} onPress={() => setSplitMode('amount')}><Text style={splitMode === 'amount' ? styles.white : { color: theme.colors.text }}>金額</Text></Pressable><Pressable style={[styles.chip, { backgroundColor: theme.colors.surfaceMuted }, splitMode === 'ratio' && styles.selected]} onPress={() => setSplitMode('ratio')}><Text style={splitMode === 'ratio' ? styles.white : { color: theme.colors.text }}>比例 %</Text></Pressable></View>
      <View style={styles.memberRows}>{members.map((member) => { const checked = selected.includes(member.user_id); return <View key={member.user_id} style={styles.memberRow}><Pressable style={[styles.chip, { backgroundColor: theme.colors.surfaceMuted }, checked && styles.selected]} onPress={() => setSelected((current) => checked ? current.filter((id) => id !== member.user_id) : [...current, member.user_id])}><Text style={checked ? styles.white : { color: theme.colors.text }}>{checked ? '✓ ' : ''}{member.profile?.display_name || member.user_id.slice(0, 8)}</Text></Pressable>{checked ? <TextInput style={[styles.splitInput, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]} keyboardType="decimal-pad" placeholder={splitMode === 'ratio' ? '比例 %' : '自訂金額'} placeholderTextColor={theme.colors.muted} value={splitValues[member.user_id] ?? ''} onChangeText={(value) => setSplitValues((current) => ({ ...current, [member.user_id]: value }))} /> : null}<Text style={[styles.previewAmount, { color: theme.colors.muted }]}>{splitAmounts[member.user_id] === undefined ? '' : `≈ ${splitAmounts[member.user_id].toFixed(2)}`}</Text></View>; })}</View>
      <View style={styles.actions}><Pressable onPress={onClose}><Text style={{ color: theme.colors.muted }}>取消</Text></Pressable><Pressable style={styles.save} disabled={saving} onPress={() => void save()}><Text style={styles.white}>{saving ? '儲存中…' : '儲存旅費'}</Text></Pressable></View>
    </ScrollView>
  </Modal>;
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, padding: 24, gap: 12, paddingBottom: 40 }, title: { fontSize: 27, fontWeight: '800' },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, padding: 13 }, row: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' }, flex: { flex: 1 },
  currencyChoices: { width: 128, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }, currencyChip: { minHeight: 36, justifyContent: 'center', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 7, backgroundColor: EDITORIAL_COLORS.sand }, conversion: { fontSize: 12, fontWeight: '700' }, rateRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }, rateHint: { fontSize: 11, flexShrink: 1 }, rateInput: { width: 82, minHeight: 40, borderWidth: 1, borderRadius: 8, paddingHorizontal: 7, fontSize: 12 }, lockRateButton: { minHeight: 40, justifyContent: 'center', borderRadius: 8, backgroundColor: EDITORIAL_COLORS.terracottaSoft, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, paddingHorizontal: 9, paddingVertical: 8 }, lockRateText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '700' },
  label: { fontWeight: '700', marginTop: 5 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, chip: { minHeight: 44, justifyContent: 'center', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9 }, selected: { backgroundColor: EDITORIAL_COLORS.terracotta }, white: { color: EDITORIAL_COLORS.paper, fontWeight: '700' },
  memberRows: { gap: 8 }, memberRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }, splitInput: { width: 92, minHeight: 40, borderWidth: 1, borderRadius: 10, paddingHorizontal: 9 }, previewAmount: { marginLeft: 'auto', fontSize: 12 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 18, alignItems: 'center', marginTop: 12 }, save: { minHeight: 48, justifyContent: 'center', backgroundColor: EDITORIAL_COLORS.terracotta, borderRadius: 10, padding: 13 },
});
