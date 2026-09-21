import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import type { Expense } from '@/lib/expenses-api';
import type { TripMemberWithProfile } from '@/lib/trips';
import { convertToTwd, type SupportedCurrency } from '@/lib/exchange-rates';
import { getThemeForMode, type ThemeMode, EDITORIAL_COLORS } from '@/lib/theme';
import { getProfileDisplayName } from '@/lib/profiles';
import { ProfileAvatar } from './ProfileAvatar';
import { settleExpense } from '@/lib/settlement-api';

type Props = {
  expenses: Expense[];
  members: TripMemberWithProfile[];
  tripId?: string;
  userId?: string;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => void | Promise<void>;
  onExpenseSettled?: (expenseId: string) => void | Promise<void>;
  themeMode?: ThemeMode;
  rates?: Partial<Record<SupportedCurrency, number>>;
  rateLabel?: string;
};

export function ExpenseList({ expenses, members, tripId, userId, onEdit, onDelete, onExpenseSettled, themeMode = 'system', rates, rateLabel }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [settledIds, setSettledIds] = useState<Set<string>>(new Set());
  const memberFor = (id: string) => members.find((member) => member.user_id === id);
  const name = (id: string) => getProfileDisplayName(memberFor(id)?.profile, id.slice(0, 8));

  async function remove(expense: Expense) {
    if (deletingId || settlingId) return;
    setDeletingId(expense.id);
    try { await onDelete(expense); }
    catch (error) { Alert.alert('刪除失敗', error instanceof Error ? error.message : '無法刪除費用。'); }
    finally { setDeletingId(null); }
  }

  async function settle(expense: Expense) {
    if (settlingId || expense.is_settled || settledIds.has(expense.id)) return;
    if (!tripId || !userId) {
      Alert.alert('無法結清', '缺少行程或登入資訊，請重新開啟行程後再試。');
      return;
    }
    setSettlingId(expense.id);
    try {
      await settleExpense(expense, userId);
      setSettledIds((previous) => new Set(previous).add(expense.id));
      await onExpenseSettled?.(expense.id);
    } catch (error) {
      Alert.alert('逐筆結清失敗', error instanceof Error ? error.message : '無法建立結清紀錄。');
    } finally {
      setSettlingId(null);
    }
  }

  if (!expenses.length) return <View style={styles.empty}><Text style={styles.icon}>💸</Text><Text style={[styles.muted, { color: theme.colors.muted }]}>目前沒有旅費紀錄</Text></View>;

  return <View style={styles.list}>
    {rateLabel ? <Text style={[styles.rateLabel, { color: theme.colors.muted }]}>{rateLabel}</Text> : null}
    {expenses.map((expense) => {
      const isSettled = Boolean(expense.is_settled) || settledIds.has(expense.id);
      return <View key={expense.id} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <View style={styles.top}>
          <View style={styles.details}>
            <Text numberOfLines={2} style={[styles.title, { color: theme.colors.text }]}>{expense.title}</Text>
            <View style={styles.metaRow}>
              <Text style={[styles.meta, { color: theme.colors.muted }]}>{expense.category || '其他'} · </Text>
              <View style={styles.payer}><ProfileAvatar profile={memberFor(expense.payer_id)?.profile} userId={expense.payer_id} size={24} /><Text numberOfLines={1} style={[styles.meta, { color: theme.colors.muted }]}>{name(expense.payer_id)} 墊付</Text></View>
              <Text style={[styles.meta, { color: theme.colors.muted }]}> · {expense.splits.length} 人分攤</Text>
              <Text style={[styles.status, { color: isSettled ? theme.colors.primary : EDITORIAL_COLORS.terracotta }]}>{isSettled ? '✓ 已結清' : '待結清'}</Text>
            </View>
          </View>
          <View style={styles.amountBlock}><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.amount, { color: theme.colors.text }]}>{expense.currency} {Number(expense.amount).toFixed(2)}</Text><Text numberOfLines={1} style={[styles.twdAmount, { color: theme.colors.primary }]}>≈ TWD {convertToTwd(expense.amount, expense.currency, rates).toFixed(2)}</Text></View>
        </View>
        <View style={styles.actions}>
          <Pressable disabled={Boolean(deletingId) || Boolean(settlingId)} onPress={() => onEdit(expense)}><Text style={styles.edit}>編輯</Text></Pressable>
          {!isSettled ? <Pressable accessibilityRole="button" disabled={Boolean(settlingId) || Boolean(deletingId)} onPress={() => void settle(expense)}><Text style={[styles.settle, settlingId === expense.id && styles.disabled]}>{settlingId === expense.id ? '結清中…' : '結清此筆'}</Text></Pressable> : null}
          <Pressable disabled={deletingId === expense.id} onPress={() => { if (!settlingId) void remove(expense); }}><Text style={[styles.delete, deletingId === expense.id && styles.disabled]}>刪除</Text></Pressable>
        </View>
      </View>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  list: { width: '100%', maxWidth: '100%', gap: 10 }, rateLabel: { fontSize: 12, fontWeight: '700' }, card: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', borderRadius: 15, padding: 15, borderWidth: 1 },
  top: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }, details: { flex: 1, minWidth: 0 }, title: { fontSize: 16, fontWeight: '800' }, metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 5 }, payer: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '55%' }, meta: { fontSize: 12, lineHeight: 18 }, status: { fontSize: 11, fontWeight: '800', marginLeft: 4 }, amountBlock: { maxWidth: '42%', flexShrink: 0, alignItems: 'flex-end' }, amount: { fontSize: 13, fontWeight: '800', textAlign: 'right' }, twdAmount: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 18, marginTop: 12 }, edit: { color: EDITORIAL_COLORS.terracotta, fontWeight: '700', minHeight: 44, paddingVertical: 12 }, settle: { color: EDITORIAL_COLORS.terracotta, fontWeight: '800', minHeight: 44, paddingVertical: 12 }, delete: { color: EDITORIAL_COLORS.dangerText, fontWeight: '700', minHeight: 44, paddingVertical: 12 }, disabled: { opacity: 0.5 }, empty: { width: '100%', maxWidth: '100%', alignItems: 'center', padding: 40, gap: 8, boxSizing: 'border-box' }, icon: { fontSize: 30 }, muted: {},
});
