import React from 'react'; import { Pressable, StyleSheet, Text, View } from 'react-native'; import type { Expense } from '@/lib/expenses-api'; import type { TripMemberWithProfile } from '@/lib/trips';
export function ExpenseList({ expenses, members, onEdit, onDelete }: { expenses: Expense[]; members: TripMemberWithProfile[]; onEdit: (expense: Expense) => void; onDelete: (expense: Expense) => void }) {
  const name = (id: string) => members.find((member) => member.user_id === id)?.profile?.display_name || id.slice(0, 8);
  if (!expenses.length) return <View style={styles.empty}><Text style={styles.icon}>💸</Text><Text style={styles.muted}>還沒有旅費紀錄</Text></View>;

  return <View style={styles.list}>{expenses.map((expense) => <View key={expense.id} style={styles.card}>
    <View style={styles.top}>
      <View style={styles.details}><Text numberOfLines={2} style={styles.title}>{expense.title}</Text><Text style={styles.meta}>{expense.category || '其他'} · 由 {name(expense.payer_id)} 付款 · {expense.splits.length} 人分攤</Text></View>
      <Text numberOfLines={1} adjustsFontSizeToFit style={styles.amount}>{expense.currency} {expense.amount.toFixed(2)}</Text>
    </View>
    <View style={styles.actions}><Pressable onPress={() => onEdit(expense)}><Text style={styles.edit}>編輯</Text></Pressable><Pressable onPress={() => onDelete(expense)}><Text style={styles.delete}>刪除</Text></Pressable></View>
  </View>)}</View>;
}

const styles = StyleSheet.create({
  list: { width: '100%', maxWidth: '100%', gap: 10 },
  card: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', backgroundColor: 'white', borderRadius: 15, padding: 15, borderWidth: 1, borderColor: '#e2e8f0' },
  top: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  details: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '800' },
  meta: { color: '#64748b', fontSize: 12, lineHeight: 18, marginTop: 5 },
  amount: { color: '#0f172a', fontSize: 13, fontWeight: '800', flexShrink: 0, maxWidth: '42%', textAlign: 'right' },
  actions: { flexDirection: 'row', gap: 18, marginTop: 12 },
  edit: { color: '#2563eb', fontWeight: '700' },
  delete: { color: '#dc2626', fontWeight: '700' },
  empty: { width: '100%', maxWidth: '100%', alignItems: 'center', padding: 40, gap: 8, boxSizing: 'border-box' },
  icon: { fontSize: 30 },
  muted: { color: '#64748b' },
});
