import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import type { Expense } from '@/lib/expenses-api';
import { SUPPORTED_CURRENCIES, type SupportedCurrency } from '@/lib/exchange-rates';
import { calculateExpenseAnalytics } from '@/lib/expenses-analytics';
import { getTripBudget, saveTripBudget, type TripBudget } from '@/lib/budget-api';
import type { TripMemberWithProfile } from '@/lib/trips';
import { getProfileDisplayName } from '@/lib/profiles';
import type { ThemeMode } from '@/lib/theme';
import { EDITORIAL_COLORS, getThemeForMode } from '@/lib/theme';
import { SettlementCard } from './SettlementCard';
import { ProfileAvatar } from './ProfileAvatar';
import { useSettlementRecords, type SettlementRecordsState } from '../hooks/useSettlementRecords';
import { personalBalanceLabel } from '../../lib/expense-view-filters';

type Props = {
  tripId: string;
  userId?: string;
  expenses: Expense[];
  members: TripMemberWithProfile[];
  rates: Partial<Record<SupportedCurrency, number>>;
  rateLabel?: string;
  themeMode: ThemeMode;
  settlementState?: SettlementRecordsState;
};

export function BudgetDashboard({ tripId, userId, expenses, members, rates, rateLabel, themeMode, settlementState }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [budget, setBudget] = useState<TripBudget | null>(null);
  const [budgetInput, setBudgetInput] = useState('');
  const [budgetCurrency, setBudgetCurrency] = useState<SupportedCurrency>('TWD');
  const [budgetLoading, setBudgetLoading] = useState(true);
  const [budgetSaving, setBudgetSaving] = useState(false);
  const localHistory = useSettlementRecords(tripId, userId, !settlementState);
  const history = settlementState ?? localHistory;
  const settlementRecords = history.records;
  const [showDetails, setShowDetails] = useState(false);
  useEffect(() => { setShowDetails(false); }, [tripId, userId]);

  useEffect(() => {
    let active = true;
    setBudgetLoading(true);
    void getTripBudget(tripId).then((loaded) => {
      if (!active) return;
      setBudget(loaded);
      setBudgetInput(loaded ? String(loaded.total_amount) : '');
      setBudgetCurrency(loaded?.currency ?? 'TWD');
    }).catch(() => {
      if (active) setBudget(null);
    }).finally(() => { if (active) setBudgetLoading(false); });
    return () => { active = false; };
  }, [tripId, userId]);

  const analytics = useMemo(() => calculateExpenseAnalytics(expenses, members, budget ? { amount: budget.total_amount, currency: budget.currency } : null, rates, settlementRecords), [budget, expenses, members, rates, settlementRecords]);
  const visibleSettlements = analytics.settlements;
  const labelFor = (memberId: string) => getProfileDisplayName(members.find((member) => member.user_id === memberId)?.profile, memberId.slice(0, 8));
  const progressPercent = Math.round(analytics.progressRatio * 100);
  const me = userId && userId !== 'anonymous' ? analytics.members.find(member => member.memberId === userId) : undefined;
  const myProfile = members.find(member => member.user_id === userId)?.profile;

  async function handleSaveBudget() {
    const amount = Number(budgetInput);
    if (!Number.isFinite(amount) || amount < 0) { Alert.alert('預算格式錯誤', '請輸入 0 或以上的數字。'); return; }
    if (!userId) { Alert.alert('無法儲存預算', '請先登入後再設定旅費預算。'); return; }
    setBudgetSaving(true);
    try {
      const saved = await saveTripBudget({ trip_id: tripId, total_amount: amount, currency: budgetCurrency, updated_by: userId });
      setBudget(saved);
      setBudgetInput(String(saved.total_amount));
    } catch (error) {
      Alert.alert('預算儲存失敗', error instanceof Error ? error.message : '請稍後再試。');
    } finally { setBudgetSaving(false); }
  }

  return <View style={[styles.container, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
    <View style={styles.header}>
      <ProfileAvatar profile={myProfile} userId={userId} size={36} />
      <View style={styles.headerCopy}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{userId && userId !== 'anonymous' ? labelFor(userId) : '個人分帳摘要'}</Text>
        <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.primary, fontWeight: '700' }}>{history.loading ? '正在確認結清紀錄…' : history.error || !history.hasLoaded ? '無法確認目前餘額' : personalBalanceLabel(me?.netTwd)}</Text>
        <Text style={[styles.muted, { color: theme.colors.muted }]}>整趟總支出 TWD {analytics.totalSpentTwd.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        <Text style={[styles.muted, { color: theme.colors.muted }]}>{rateLabel || '金額已換算為 TWD'}</Text>
      </View>
    </View>
    {history.error ? <View><Text accessibilityRole="alert" style={[styles.muted, { color: theme.colors.muted }]}>{history.error}；原有資料仍保留，請重新確認後再操作。</Text><Pressable accessibilityRole="button" accessibilityLabel="重新確認結清紀錄" onPress={() => void history.reload()} style={styles.detailButton}><Text style={{ color: theme.colors.primary }}>重試</Text></Pressable></View> : null}
    <Pressable accessibilityRole="button" accessibilityLabel="展開預算與統計" accessibilityState={{ expanded: showDetails }} style={styles.detailButton} onPress={() => setShowDetails(value => !value)}><Text style={{ color: theme.colors.primary, fontWeight: '700' }}>{showDetails ? '收合預算與統計 ▴' : '預算與統計 ▾'}</Text></Pressable>
    {showDetails ? <>
    <View style={styles.header}><View style={styles.headerCopy}><Text style={[styles.title, { color: theme.colors.text }]}>預算儀表板</Text><Text style={[styles.muted, { color: theme.colors.muted }]}>{rateLabel || '金額已換算為 TWD'}</Text></View>{budgetLoading ? <ActivityIndicator color={theme.colors.primary} /> : null}</View>
    <View style={styles.inputRow}><TextInput value={budgetInput} onChangeText={setBudgetInput} keyboardType="decimal-pad" placeholder="輸入總預算" placeholderTextColor={theme.colors.muted} style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]} /><Pressable accessibilityRole="button" accessibilityLabel="儲存旅費預算" disabled={budgetSaving || budgetLoading} onPress={() => void handleSaveBudget()} style={[styles.saveButton, { backgroundColor: theme.colors.primary, opacity: budgetSaving ? 0.6 : 1 }]}>{budgetSaving ? <ActivityIndicator color={EDITORIAL_COLORS.paper} /> : <Text style={styles.white}>儲存</Text>}</Pressable></View>
    <View style={styles.currencyRow}>{SUPPORTED_CURRENCIES.map((currency) => <Pressable key={currency} accessibilityRole="button" onPress={() => setBudgetCurrency(currency)} style={[styles.currencyChip, { borderColor: currency === budgetCurrency ? theme.colors.primary : theme.colors.border, backgroundColor: currency === budgetCurrency ? theme.colors.primary : 'transparent' }]}><Text style={{ color: currency === budgetCurrency ? EDITORIAL_COLORS.paper : theme.colors.muted, fontSize: 12, fontWeight: '800' }}>{currency}</Text></Pressable>)}</View>
    <View style={styles.summaryRow}><Summary label="總支出" value={`TWD ${analytics.totalSpentTwd.toFixed(0)}`} color={theme.colors.text} /><Summary label="總預算" value={budget ? `TWD ${analytics.totalBudgetTwd.toFixed(0)}` : '尚未設定'} color={theme.colors.text} /><Summary label="剩餘預算" value={budget ? `TWD ${analytics.remainingBudgetTwd.toFixed(0)}` : '—'} color={analytics.isOverBudget ? EDITORIAL_COLORS.dangerText : theme.colors.primary} /></View>
    {budget ? <><View style={[styles.progressTrack, { backgroundColor: theme.colors.border }]}><View style={[styles.progressFill, { width: `${Math.min(100, Math.max(0, progressPercent))}%`, backgroundColor: analytics.isOverBudget ? EDITORIAL_COLORS.dangerText : theme.colors.primary }]} /></View><Text style={[styles.progressLabel, { color: analytics.isOverBudget ? EDITORIAL_COLORS.dangerText : theme.colors.muted }]}>{analytics.isOverBudget ? `⚠️ 已超支 ${Math.abs(analytics.remainingBudgetTwd).toFixed(0)} TWD` : `${progressPercent}% 已使用`}</Text></> : <Text style={[styles.muted, { color: theme.colors.muted }]}>設定總預算，即時掌握旅費進度。</Text>}
    <View style={styles.section}><Text style={[styles.sectionTitle, { color: theme.colors.text }]}>類別支出</Text>{analytics.categories.map((entry) => <View key={entry.category} style={styles.categoryRow}><Text style={[styles.categoryName, { color: theme.colors.text }]}>{entry.category}</Text><View style={[styles.categoryTrack, { backgroundColor: theme.colors.border }]}><View style={[styles.categoryFill, { width: `${entry.percentage}%`, backgroundColor: theme.colors.primary }]} /></View><Text style={[styles.categoryValue, { color: theme.colors.muted }]}>{entry.percentage.toFixed(1)}%</Text></View>)}</View>
    <View style={styles.section}><Text style={[styles.sectionTitle, { color: theme.colors.text }]}>成員應付／已付</Text>{analytics.members.map((member) => { const cleared = analytics.settlementTotals[member.memberId] ?? { settledOutTwd: 0, settledInTwd: 0 }; return <View key={member.memberId} style={styles.memberRow}><View style={styles.memberCopy}><Text numberOfLines={1} style={[styles.memberName, { color: theme.colors.text }]}>{labelFor(member.memberId)}</Text><Text style={[styles.memberDetail, { color: theme.colors.muted }]}>應付 {member.owedTwd.toFixed(0)} · 墊付 {member.paidTwd.toFixed(0)} · 已轉出 {cleared.settledOutTwd.toFixed(0)} · 已收到 {cleared.settledInTwd.toFixed(0)}</Text></View><Text style={[styles.memberNet, { color: member.netTwd < -0.009 ? EDITORIAL_COLORS.dangerText : theme.colors.primary }]}>{member.netTwd < -0.009 ? '應付' : '應收'} {Math.abs(member.netTwd).toFixed(0)}</Text></View>; })}</View>
    </> : null}
    {/* SettlementCard 提供「一鍵複製結算文字」與結清紀錄，不隨統計折疊。 */}
    {history.hasLoaded ? <SettlementCard tripId={tripId} userId={userId} settlements={visibleSettlements} settlementRecords={settlementRecords} members={members} labelFor={labelFor} themeMode={themeMode} onSettlementCreated={history.add} onSettlementDeleted={history.remove} /> : null}
  </View>;
}

function Summary({ label, value, color }: { label: string; value: string; color: string }) {
  return <View style={styles.summary}><Text style={styles.summaryLabel}>{label}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.summaryValue, { color }]}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  detailButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 10, backgroundColor: EDITORIAL_COLORS.sand },
  container: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', borderWidth: 1, borderRadius: 14, padding: 16, gap: 12, marginBottom: 14 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  headerCopy: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 18, fontWeight: '800' },
  muted: { fontSize: 12, lineHeight: 17 },
  inputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: { flex: 1, minWidth: 0, minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  saveButton: { minHeight: 44, minWidth: 66, justifyContent: 'center', alignItems: 'center', borderRadius: 10, paddingHorizontal: 12 },
  white: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
  currencyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  currencyChip: { minHeight: 30, justifyContent: 'center', borderWidth: 1, borderRadius: 15, paddingHorizontal: 11 },
  summaryRow: { flexDirection: 'row', gap: 8 },
  summary: { flex: 1, minWidth: 0, gap: 3 },
  summaryLabel: { color: EDITORIAL_COLORS.taupe, fontSize: 12 },
  summaryValue: { fontSize: 15, fontWeight: '800' },
  progressTrack: { width: '100%', height: 10, overflow: 'hidden', borderRadius: 5 },
  progressFill: { height: '100%', borderRadius: 5 },
  progressLabel: { fontSize: 12, fontWeight: '700' },
  section: { gap: 8, paddingTop: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '800' },
  categoryRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  categoryName: { width: 42, fontSize: 12, fontWeight: '700' },
  categoryTrack: { flex: 1, height: 7, overflow: 'hidden', borderRadius: 4 },
  categoryFill: { height: '100%', borderRadius: 4 },
  categoryValue: { width: 45, textAlign: 'right', fontSize: 11 },
  memberRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  memberCopy: { flex: 1, minWidth: 0, gap: 2 },
  memberName: { flex: 1, minWidth: 0, fontWeight: '700' },
  memberDetail: { fontSize: 11 },
  memberNet: { flexShrink: 0, fontSize: 13, fontWeight: '800' },
  settlementHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  copyButton: { fontSize: 12, fontWeight: '800' },
  settlement: { fontSize: 13, fontWeight: '700' },
});
