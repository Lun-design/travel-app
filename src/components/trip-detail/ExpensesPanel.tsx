import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { Expense } from '@/lib/expenses-api';
import type { SupportedCurrency } from '@/lib/exchange-rates';
import type { TripMemberWithProfile } from '@/lib/trips';
import type { ThemeMode } from '@/lib/theme';
import { EDITORIAL_COLORS } from '@/lib/theme';
import { ExpenseList } from '@/components/ExpenseList';
import { BudgetDashboard } from '@/components/BudgetDashboard';

type Props = {
  tripId: string;
  userId?: string;
  expenses: Expense[];
  members: TripMemberWithProfile[];
  rates: Partial<Record<SupportedCurrency, number>>;
  rateLabel: string;
  themeMode: ThemeMode;
  onEdit: (expense: Expense) => void;
  onDelete: (expense: Expense) => Promise<void>;
  onExpenseSettled?: () => void | Promise<void>;
  onAdd: () => void;
};

export function ExpensesPanel({ tripId, userId, expenses, members, rates, rateLabel, themeMode, onEdit, onDelete, onExpenseSettled, onAdd }: Props) {
  const [settlementRefreshKey, setSettlementRefreshKey] = useState(0);
  async function handleExpenseSettled() {
    setSettlementRefreshKey((value) => value + 1);
    await onExpenseSettled?.();
  }

  return <ScrollView contentContainerStyle={styles.panel}>
    <BudgetDashboard key={`budget-${settlementRefreshKey}`} tripId={tripId} userId={userId} expenses={expenses} members={members} rates={rates} rateLabel={rateLabel} themeMode={themeMode} />
    <ExpenseList tripId={tripId} userId={userId} themeMode={themeMode} expenses={expenses} members={members} rates={rates} rateLabel={rateLabel} onEdit={onEdit} onDelete={onDelete} onExpenseSettled={handleExpenseSettled} />
    <Pressable style={styles.primary} onPress={onAdd}><Text style={styles.buttonText}>新增費用</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  panel: { width: '100%', paddingBottom: 100, paddingTop: 8, boxSizing: 'border-box' },
  primary: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', backgroundColor: EDITORIAL_COLORS.terracotta, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 18 },
  buttonText: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
});
