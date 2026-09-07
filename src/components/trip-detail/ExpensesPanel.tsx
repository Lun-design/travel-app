import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import type { Expense } from '@/lib/expenses-api';
import { convertToTwd, SUPPORTED_CURRENCIES, type SupportedCurrency } from '@/lib/exchange-rates';
import type { TripMemberWithProfile } from '@/lib/trips';
import type { ThemeMode } from '@/lib/theme';
import { EDITORIAL_COLORS, getThemeForMode } from '@/lib/theme';
import { getProfileDisplayName } from '@/lib/profiles';
import { ExpenseList } from '@/components/ExpenseList';
import { SettlementCard } from '@/components/SettlementCard';
import { calculateMinSettlements } from '@/lib/settlement';
import { getTripBudget, saveTripBudget, type TripBudget } from '@/lib/budget-api';

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
  onAdd: () => void;
};

const categoryLabel = (category: string | null | undefined) => category?.trim() || '其他';

export function ExpensesPanel({ tripId, userId, expenses, members, rates, rateLabel, themeMode, onEdit, onDelete, onAdd }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [budget, setBudget] = useState<TripBudget | null>(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState<SupportedCurrency>('TWD');
  const [budgetLoading, setBudgetLoading] = useState(true);
  const [budgetSaving, setBudgetSaving] = useState(false);

  useEffect(() => {
    let active = true;
    setBudgetLoading(true);
    void getTripBudget(tripId).then((loaded) => {
      if (!active) return;
      setBudget(loaded);
      setBudgetInput(loaded ? String(loaded.total_amount) : '');
      setBudgetCurrency(loaded?.currency ?? 'TWD');
    }).catch(() => {
      // A missing budget should not prevent the expense list from rendering.
    }).finally(() => { if (active) setBudgetLoading(false); });
    return () => { active = false; };
  }, [tripId]);

  const totalTwd = useMemo(() => expenses.reduce((sum, expense) => sum + convertToTwd(expense.amount, expense.currency, rates), 0), [expenses, rates]);
  const budgetTwd = budget ? convertToTwd(budget.total_amount, budget.currency, rates) : 0;
  const progress = budgetTwd > 0 ? Math.min(1, totalTwd / budgetTwd) : 0;
  const categoryTotals = useMemo(() => {
    const totals = new Map<string, number>();
    expenses.forEach((expense) => {
      const category = categoryLabel(expense.category);
      totals.set(category, (totals.get(category) ?? 0) + convertToTwd(expense.amount, expense.currency, rates));
    });
    return [...totals.entries()].sort(([, a], [, b]) => b - a);
  }, [expenses, rates]);

  async function handleSaveBudget() {
    const amount = Number(budgetInput);
    if (!Number.isFinite(amount) || amount < 0) {
      Alert.alert('預算格式錯誤', '請輸入 0 或以上的數字。');
      return;
    }
    if (!userId) {
      Alert.alert('無法儲存預算', '請先登入後再設定旅費預算。');
      return;
    }
    setBudgetSaving(true);
    try {
      const saved = await saveTripBudget({ trip_id: tripId, total_amount: amount, currency: budgetCurrency, updated_by: userId });
      setBudget(saved);
      setBudgetInput(String(saved.total_amount));
    } catch (error) {
      Alert.alert('預算儲存失敗', error instanceof Error ? error.message : '請稍後再試。');
    } finally {
      setBudgetSaving(false);
    }
  }

  const labelFor = (memberId: string) => getProfileDisplayName(members.find((member) => member.user_id === memberId)?.profile, memberId.slice(0, 8));
  const settlements = calculateMinSettlements(expenses, members, rates);

  return <ScrollView contentContainerStyle={styles.panel}>
    <View style={[styles.budgetCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={styles.budgetHeader}>
        <View style={styles.budgetCopy}>
          <Text style={[styles.sectionTitle, { color: theme.colors.text }]}>預算儀表板</Text>
          <Text style={[styles.muted, { color: theme.colors.muted }]}>{budget ? `已用 ${totalTwd.toFixed(0)} / 預算 ${budgetTwd.toFixed(0)} TWD` : '設定總預算，即時掌握旅費進度'}</Text>
        </View>
        {budgetLoading ? <ActivityIndicator color={theme.colors.primary} /> : null}
      </View>
      <View style={styles.budgetInputRow}>
        <TextInput value={budgetInput} onChangeText={setBudgetInput} keyboardType="decimal-pad" placeholder="輸入總預算" placeholderTextColor={theme.colors.muted} style={[styles.budgetInput, { color: theme.colors.text, borderColor: theme.colors.border }]} />
        <Pressable accessibilityRole="button" disabled={budgetSaving} onPress={() => void handleSaveBudget()} style={[styles.saveBudget, { backgroundColor: theme.colors.primary, opacity: budgetSaving ? 0.6 : 1 }]}>
          {budgetSaving ? <ActivityIndicator color={EDITORIAL_COLORS.paper} /> : <Text style={styles.saveBudgetText}>儲存</Text>}
        </Pressable>
      </View>
      <View style={styles.currencyRow}>
        {SUPPORTED_CURRENCIES.map((currency) => <Pressable key={currency} accessibilityRole="button" onPress={() => setBudgetCurrency(currency)} style={[styles.currencyChip, { borderColor: currency === budgetCurrency ? theme.colors.primary : theme.colors.border, backgroundColor: currency === budgetCurrency ? theme.colors.primary : 'transparent' }]}><Text style={{ color: currency === budgetCurrency ? EDITORIAL_COLORS.paper : theme.colors.muted, fontSize: 12, fontWeight: '800' }}>{currency}</Text></Pressable>)}
      </View>
      {budgetTwd > 0 ? <>
        <View style={[styles.progressTrack, { backgroundColor: theme.colors.border }]}><View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%`, backgroundColor: totalTwd > budgetTwd ? EDITORIAL_COLORS.dangerText : theme.colors.primary }]} /></View>
        <Text style={[styles.progressLabel, { color: theme.colors.text }]}>{Math.round(totalTwd / budgetTwd * 100)}% 已使用</Text>
      </> : <Text style={[styles.muted, { color: theme.colors.muted }]}>尚未設定預算，先輸入金額開始追蹤。</Text>}
      {categoryTotals.length ? <View style={styles.categoryList}>{categoryTotals.map(([category, amount]) => <View key={category} style={styles.categoryRow}><Text style={[styles.categoryName, { color: theme.colors.text }]}>{category}</Text><Text style={[styles.categoryAmount, { color: theme.colors.primary }]}>TWD {amount.toFixed(0)}</Text></View>)}</View> : null}
    </View>
    <SettlementCard themeMode={themeMode} members={members} settlements={settlements} labelFor={labelFor} />
    <ExpenseList themeMode={themeMode} expenses={expenses} members={members} rates={rates} rateLabel={rateLabel} onEdit={onEdit} onDelete={onDelete} />
    <Pressable style={styles.primary} onPress={onAdd}><Text style={styles.buttonText}>＋ 新增支出</Text></Pressable>
  </ScrollView>;
}

const styles = StyleSheet.create({
  panel: { width: '100%', paddingBottom: 100, paddingTop: 8, boxSizing: 'border-box' },
  budgetCard: { width: '100%', borderWidth: 1, borderRadius: 14, padding: 16, gap: 10, marginBottom: 14, boxSizing: 'border-box' },
  budgetHeader: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  budgetCopy: { flex: 1, minWidth: 0, gap: 4 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  muted: { fontSize: 12 },
  budgetInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  budgetInput: { flex: 1, minWidth: 0, minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  saveBudget: { minHeight: 44, minWidth: 66, borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 12 },
  saveBudgetText: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
  currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  currencyChip: { minHeight: 30, borderWidth: 1, borderRadius: 15, justifyContent: 'center', paddingHorizontal: 11 },
  progressTrack: { width: '100%', height: 10, borderRadius: 5, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 5 },
  progressLabel: { fontSize: 12, fontWeight: '700' },
  categoryList: { gap: 7, paddingTop: 4 },
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  categoryName: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: '700' },
  categoryAmount: { fontSize: 13 },
  primary: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', backgroundColor: EDITORIAL_COLORS.terracotta, borderRadius: 10, paddingHorizontal: 20, paddingVertical: 10, marginTop: 18 },
  buttonText: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
});
