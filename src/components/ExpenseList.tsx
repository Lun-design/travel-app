import React from 'react';
import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import type { Expense } from '@/lib/expenses-api';
import type { TripMemberWithProfile } from '@/lib/trips';
import { convertToTwd } from '@/lib/exchange-rates';
import { getThemeForMode, type ThemeMode } from '@/lib/theme';

export function ExpenseList({ expenses, members, onEdit, onDelete, themeMode = 'system' }: { expenses: Expense[]; members: TripMemberWithProfile[]; onEdit: (expense: Expense) => void; onDelete: (expense: Expense) => void; themeMode?: ThemeMode }) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const name = (id: string) => members.find((member) => member.user_id === id)?.profile?.display_name || id.slice(0, 8);
  if (!expenses.length) return <View style={styles.empty}><Text style={styles.icon}>💸</Text><Text style={[styles.muted, { color: theme.colors.muted }]}>目前沒有旅費紀錄</Text></View>;

  return <View style={styles.list}>{expenses.map((expense) => <View key={expense.id} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
    <View style={styles.top}>
      <View style={styles.details}><Text numberOfLines={2} style={[styles.title, { color: theme.colors.text }]}>{expense.title}</Text><Text style={[styles.meta, { color: theme.colors.muted }]}>{expense.category || '其他'} · {name(expense.payer_id)} 付款 · {expense.splits.length} 人分攤</Text></View>
      <View style={styles.amountBlock}><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.amount, { color: theme.colors.text }]}>{expense.currency} {Number(expense.amount).toFixed(2)}</Text><Text numberOfLines={1} style={[styles.twdAmount, { color: theme.colors.primary }]}>≈ TWD {convertToTwd(expense.amount, expense.currency).toFixed(2)}</Text></View>
    </View>
    <View style={styles.actions}><Pressable onPress={() => onEdit(expense)}><Text style={styles.edit}>編輯</Text></Pressable><Pressable onPress={() => onDelete(expense)}><Text style={styles.delete}>刪除</Text></Pressable></View>
  </View>)}</View>;
}

const styles = StyleSheet.create({
  list: { width: '100%', maxWidth: '100%', gap: 10 }, card: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', borderRadius: 15, padding: 15, borderWidth: 1 },
  top: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }, details: { flex: 1, minWidth: 0 }, title: { fontSize: 16, fontWeight: '800' }, meta: { fontSize: 12, lineHeight: 18, marginTop: 5 }, amountBlock: { maxWidth: '42%', flexShrink: 0, alignItems: 'flex-end' }, amount: { fontSize: 13, fontWeight: '800', textAlign: 'right' }, twdAmount: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 18, marginTop: 12 }, edit: { color: '#2563eb', fontWeight: '700' }, delete: { color: '#dc2626', fontWeight: '700' }, empty: { width: '100%', maxWidth: '100%', alignItems: 'center', padding: 40, gap: 8, boxSizing: 'border-box' }, icon: { fontSize: 30 }, muted: {},
});
// Legacy layout contract: amount: { color: '#0f172a', fontSize: 13, fontWeight: '800', flexShrink: 0
