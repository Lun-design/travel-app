import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { calculateBalances, type Expense } from '@/lib/expenses-api';
import type { TripMemberWithProfile } from '@/lib/trips';
import type { SupportedCurrency } from '@/lib/exchange-rates';
import type { ThemeMode } from '@/lib/theme';
import { EDITORIAL_COLORS } from '@/lib/theme';
import { ExpenseList } from '@/components/ExpenseList';
import { SettlementCard } from '@/components/SettlementCard';

type Props = {
  expenses: Expense[];
  members: TripMemberWithProfile[];
  rates: Partial<Record<SupportedCurrency, number>>;
  rateLabel: string;
  themeMode: ThemeMode;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => Promise<void>;
  onAdd: () => void;
};

export function ExpensesPanel({ expenses, members, rates, rateLabel, themeMode, onEdit, onDelete, onAdd }: Props) {
  return <ScrollView contentContainerStyle={styles.panel}>
    <SettlementCard themeMode={themeMode} settlements={calculateBalances(expenses, rates)} labelFor={(memberId) => members.find((member) => member.user_id === memberId)?.profile?.display_name || memberId.slice(0, 8)} />
    <ExpenseList themeMode={themeMode} expenses={expenses} members={members} rates={rates} rateLabel={rateLabel} onEdit={onEdit} onDelete={onDelete} />
    <Pressable style={styles.primary} onPress={onAdd}><Text style={styles.buttonText}>＋ 新增旅費</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  panel: { width: '100%', paddingBottom: 100, paddingTop: 8, boxSizing: 'border-box' },
  primary: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', backgroundColor: EDITORIAL_COLORS.terracotta, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 18 },
  buttonText: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
});
