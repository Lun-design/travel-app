import React, { useEffect, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import type { Expense } from '@/lib/expenses-api';
import type { TripMemberWithProfile } from '@/lib/trips';
import { convertToTwd, type SupportedCurrency } from '@/lib/exchange-rates';
import { getThemeForMode, type ThemeMode, EDITORIAL_COLORS } from '@/lib/theme';
import { getProfileDisplayName } from '@/lib/profiles';
import { ProfileAvatar } from './ProfileAvatar';
import { listSettlementRecordsForExpense, settleExpense, SettlementPreviewChangedError } from '@/lib/settlement-api';
import { createExpenseSettlementTransfers, type ExpenseSettlementTransfer } from '@/lib/settlement';
import { ActionConfirmationModal } from './ActionConfirmationModal';
import { EXPENSE_VIEW_CATEGORIES, filterExpenseView, type ExpenseViewFilters } from '../../lib/expense-view-filters';
import type { SettlementRecordsState } from '../hooks/useSettlementRecords';
import { selectionKeyboardProps } from '../../lib/selection-keyboard';

type ExpenseAction = { kind: 'settle' | 'delete'; expense: Expense; scope: string };
function expenseVersion(item: Expense) {
  return JSON.stringify([item.id, item.trip_id, item.title, item.payer_id, item.amount, item.currency, item.is_settled, item.splits]);
}

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
  focusedExpenseId?: string | null;
  focusRequest?: number;
  settlementState?: SettlementRecordsState;
};

export function ExpenseList({ expenses, members, tripId, userId, onEdit, onDelete, onExpenseSettled, themeMode = 'system', rates, rateLabel, focusedExpenseId, focusRequest = 0, settlementState }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [settlingId, setSettlingId] = useState<string | null>(null);
  const [settledIds, setSettledIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<ExpenseViewFilters>({});
  const handledFocus = useRef<string | null>(null);
  const [action, setAction] = useState<ExpenseAction | null>(null);
  const [preview, setPreview] = useState<ExpenseSettlementTransfer[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false), [actionError, setActionError] = useState('');
  const scope = JSON.stringify([tripId, userId]);
  const current = useRef({ expenses, scope, userId }); current.current = { expenses, scope, userId };
  const activeAction = useRef<ExpenseAction | null>(null), requestId = useRef(0), busy = useRef(false);
  const lifecycle = useRef(0);
  useEffect(() => {
    lifecycle.current++;
    activeAction.current = null; requestId.current++; busy.current = false;
    setAction(null); setPreview(null); setActionError(''); setPreviewLoading(false); setDeletingId(null); setSettlingId(null); setSettledIds(new Set());
    setFilters({}); handledFocus.current = null;
    return () => { lifecycle.current++; activeAction.current = null; requestId.current++; };
  }, [scope]);
  useEffect(() => {
    const key = focusedExpenseId ? JSON.stringify([scope, focusedExpenseId, focusRequest]) : null;
    if (!key) { handledFocus.current = null; return; }
    if (key !== handledFocus.current && expenses.some(expense => expense.id === focusedExpenseId)) { handledFocus.current = key; setFilters({}); }
  }, [focusedExpenseId, focusRequest, expenses, scope]);
  const memberFor = (id: string) => members.find((member) => member.user_id === id);
  const name = (id: string) => getProfileDisplayName(memberFor(id)?.profile, id.slice(0, 8));

  function cancelAction() {
    if (busy.current) return;
    activeAction.current = null; requestId.current++; setAction(null); setPreview(null); setActionError(''); setPreviewLoading(false);
  }
  async function loadPreview(target: ExpenseAction) {
    if (activeAction.current !== target || current.current.scope !== target.scope || busy.current) return;
    const request = ++requestId.current; setPreview(null); setPreviewLoading(true); setActionError('');
    try {
      const records = await listSettlementRecordsForExpense(target.expense.id);
      if (request === requestId.current && activeAction.current === target && current.current.scope === target.scope) setPreview(createExpenseSettlementTransfers(target.expense, records));
    } catch (error) {
      if (request === requestId.current && activeAction.current === target) setActionError(error instanceof Error ? error.message : '無法取得結清資料，請重新載入預覽。');
    } finally { if (request === requestId.current && activeAction.current === target) setPreviewLoading(false); }
  }
  async function openAction(expense: Expense, kind: ExpenseAction['kind']) {
    if (busy.current) return;
    const target = { expense, kind, scope }; activeAction.current = target; requestId.current++;
    setAction(target); setPreview(null); setActionError(''); setPreviewLoading(false);
    if (kind === 'settle') await loadPreview(target);
  }
  async function confirmAction() {
    const target = activeAction.current;
    if (!target || target !== action || busy.current || target.scope !== current.current.scope) return;
    const expense = current.current.expenses.find((item) => item.id === target.expense.id && item.trip_id === tripId);
    const actor = current.current.userId;
    if (!tripId || !actor || !expense) { setActionError('行程、登入資訊或費用已變更，請關閉後重新開啟。'); return; }
    if (expenseVersion(expense) !== expenseVersion(target.expense)) {
      const updated = { ...target, expense }; activeAction.current = updated; setAction(updated);
      if (target.kind === 'settle') await loadPreview(updated);
      if (activeAction.current === updated && current.current.scope === updated.scope) setActionError('費用資料已更新，請重新確認後再送出。');
      return;
    }
    if (target.kind === 'settle' && (preview === null || previewLoading || expense.is_settled || settledIds.has(expense.id))) return;
    busy.current = true; setActionError('');
    const session = lifecycle.current;
    if (target.kind === 'delete') setDeletingId(expense.id); else setSettlingId(expense.id);
    let committed = false;
    try {
      if (target.kind === 'delete') await onDelete(expense);
      else await settleExpense(expense, actor, undefined, preview ?? []);
      committed = true;
      if (session !== lifecycle.current || activeAction.current !== target || current.current.scope !== target.scope) return;
      if (target.kind === 'settle') {
        setSettledIds((previous) => new Set(previous).add(expense.id));
        // A refresh failure must not invite repeating an already committed write.
        try { await onExpenseSettled?.(expense.id); } catch (error) { Alert.alert('結清已記錄', '更新畫面失敗，請重新整理行程；請勿重複結清。'); }
      }
      if (activeAction.current === target) { activeAction.current = null; requestId.current++; setAction(null); setPreview(null); }
    } catch (error) {
      if (session !== lifecycle.current || activeAction.current !== target || current.current.scope !== target.scope) return;
      if (error instanceof SettlementPreviewChangedError) setPreview(error.transfers);
      setActionError(error instanceof Error ? error.message : '操作失敗，請稍後重試。');
    } finally {
      if (session === lifecycle.current && current.current.scope === target.scope && (activeAction.current === target || committed)) { busy.current = false; setSettlingId(null); setDeletingId(null); }
    }
  }

  const historyReady = Boolean(settlementState?.hasLoaded && !settlementState.loading && !settlementState.error);
  const waitingForHistory = Boolean(filters.pendingOnly && !historyReady);
  const visibleExpenses = waitingForHistory ? [] : filterExpenseView(expenses.map(expense => settledIds.has(expense.id) ? { ...expense, is_settled: true } : expense), filters, userId, settlementState?.records ?? [], rates);

  return <View style={styles.list}>
    <View style={styles.viewFilters}>
      <Pressable {...selectionKeyboardProps(() => setFilters(current => ({ ...current, mineOnly: !current.mineOnly })))} accessibilityRole="checkbox" accessibilityLabel="費用：與我有關" accessibilityState={{ checked: Boolean(filters.mineOnly) }} style={styles.filterButton} onPress={() => setFilters(current => ({ ...current, mineOnly: !current.mineOnly }))}><Text style={{ color: filters.mineOnly ? theme.colors.primary : theme.colors.muted }}>與我有關{filters.mineOnly ? ' ✓' : ''}</Text></Pressable>
      {settlementState ? <Pressable {...selectionKeyboardProps(() => setFilters(current => ({ ...current, pendingOnly: !current.pendingOnly })))} accessibilityRole="checkbox" accessibilityLabel="費用：待結清" accessibilityState={{ checked: Boolean(filters.pendingOnly) }} style={styles.filterButton} onPress={() => setFilters(current => ({ ...current, pendingOnly: !current.pendingOnly }))}><Text style={{ color: filters.pendingOnly ? theme.colors.primary : theme.colors.muted }}>待結清{filters.pendingOnly ? ' ✓' : ''}</Text></Pressable> : null}
      {[undefined, ...EXPENSE_VIEW_CATEGORIES].map(category => <Pressable key={category ?? 'all'} accessibilityRole="button" accessibilityLabel={`費用類別：${category ?? '全部'}`} accessibilityState={{ selected: filters.category === category }} style={styles.filterButton} onPress={() => setFilters(current => ({ ...current, category }))}><Text style={{ color: filters.category === category ? theme.colors.primary : theme.colors.muted }}>{category ?? '全部類別'}</Text></Pressable>)}
      {filters.mineOnly || filters.pendingOnly || filters.category ? <Pressable accessibilityRole="button" accessibilityLabel="清除費用篩選" style={styles.filterButton} onPress={() => setFilters({})}><Text style={{ color: theme.colors.primary }}>清除篩選</Text></Pressable> : null}
    </View>
    {waitingForHistory ? <View><Text style={{ color: theme.colors.muted }}>{settlementState?.error ? '無法確認待結清費用，請重新載入結清紀錄。' : '正在確認待結清費用…'}</Text>{settlementState?.error ? <Pressable accessibilityRole="button" style={styles.filterButton} onPress={() => void settlementState.reload()}><Text style={{ color: theme.colors.primary }}>重試</Text></Pressable> : null}</View> : <Text style={{ color: theme.colors.muted }}>符合 {visibleExpenses.length} 筆費用</Text>}
    {!expenses.length ? <View style={styles.empty}><Text style={styles.icon}>💸</Text><Text style={[styles.muted, { color: theme.colors.muted }]}>目前沒有旅費紀錄</Text></View> : !visibleExpenses.length && !waitingForHistory ? <Text style={{ color: theme.colors.muted }}>沒有符合篩選的費用，可清除篩選查看全部。</Text> : null}
    {rateLabel ? <Text style={[styles.rateLabel, { color: theme.colors.muted }]}>{rateLabel}</Text> : null}
    {visibleExpenses.map((expense) => {
      const isSettled = Boolean(expense.is_settled) || settledIds.has(expense.id);
      const splits = (Array.isArray(expense.splits) ? expense.splits : []).filter((split) => split && typeof split.user_id === 'string' && split.user_id.trim());
      return <View key={expense.id} nativeID={'expense-' + expense.id} style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: focusedExpenseId === expense.id ? theme.colors.primary : theme.colors.border, borderWidth: focusedExpenseId === expense.id ? 2 : 1 }]}>
        <View style={styles.top}>
          <View style={styles.details}>
            <Text numberOfLines={2} style={[styles.title, { color: theme.colors.text }]}>{expense.title}</Text>
            <View style={styles.metaRow}>
              <Text style={[styles.meta, { color: theme.colors.muted }]}>{expense.category || '其他'} · </Text>
              <View style={styles.payer}><ProfileAvatar profile={memberFor(expense.payer_id)?.profile} userId={expense.payer_id} size={24} /><Text numberOfLines={1} style={[styles.meta, { color: theme.colors.muted }]}>{name(expense.payer_id)} 墊付</Text></View>
              <Text style={[styles.meta, { color: theme.colors.muted }]}> · {splits.length} 人分攤</Text>
              <Text style={[styles.status, { color: isSettled ? theme.colors.primary : EDITORIAL_COLORS.terracotta }]}>{isSettled ? '✓ 已結清' : '待結清'}</Text>
            </View>
          </View>
          <View style={styles.amountBlock}><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.amount, { color: theme.colors.text }]}>{expense.currency} {Number(expense.amount).toFixed(2)}</Text><Text numberOfLines={1} style={[styles.twdAmount, { color: theme.colors.primary }]}>≈ TWD {convertToTwd(expense.amount, expense.currency, rates).toFixed(2)}</Text></View>
        </View>
        <View accessibilityLabel="此筆分攤明細" style={styles.shares}>
          <Text style={[styles.shareHeading, { color: theme.colors.muted }]}>此筆分攤</Text>
          <View style={styles.shareRows}>
            {splits.map((split) => {
              const raw: unknown = split.amount;
              const amount = typeof raw === 'number' || (typeof raw === 'string' && raw.trim()) ? Number(raw) : NaN;
              const amountLabel = Number.isFinite(amount) && amount >= 0
                ? `${expense.currency} ${amount.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                : '金額待確認';
              return <View key={split.id ?? split.user_id} style={[styles.shareMember, { backgroundColor: theme.colors.surfaceMuted }]}>
                <ProfileAvatar profile={memberFor(split.user_id)?.profile} userId={split.user_id} size={24} />
                <View style={styles.shareIdentity}>
                  <Text style={[styles.shareName, { color: theme.colors.text }]}>{name(split.user_id)}</Text>
                  {split.user_id === expense.payer_id ? <Text style={[styles.sharePayer, { color: theme.colors.muted }]}>墊付者</Text> : null}
                </View>
                <Text style={[styles.shareAmount, { color: theme.colors.text }]}>{amountLabel}</Text>
              </View>;
            })}
            {!splits.length ? <Text style={[styles.meta, { color: theme.colors.muted }]}>尚未設定分攤明細</Text> : null}
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={`編輯費用：${expense.title}`} accessibilityState={{ disabled: Boolean(deletingId) || Boolean(settlingId) }} style={styles.actionButton} disabled={Boolean(deletingId) || Boolean(settlingId)} onPress={() => onEdit(expense)}><Text style={styles.edit}>編輯</Text></Pressable>
          {!isSettled ? <Pressable accessibilityRole="button" accessibilityLabel={`結清費用：${expense.title}`} accessibilityState={{ disabled: Boolean(settlingId) || Boolean(deletingId), busy: settlingId === expense.id }} style={styles.actionButton} disabled={Boolean(settlingId) || Boolean(deletingId)} onPress={() => openAction(expense, 'settle')}><Text style={[styles.settle, settlingId === expense.id && styles.disabled]}>{settlingId === expense.id ? '結清中…' : '結清此筆'}</Text></Pressable> : null}
          <Pressable accessibilityRole="button" accessibilityLabel={`刪除費用：${expense.title}`} accessibilityState={{ disabled: Boolean(deletingId) || Boolean(settlingId), busy: deletingId === expense.id }} style={styles.actionButton} disabled={Boolean(deletingId) || Boolean(settlingId)} onPress={() => openAction(expense, 'delete')}><Text style={[styles.delete, deletingId === expense.id && styles.disabled]}>刪除</Text></Pressable>
        </View>
      </View>;
    })}
    <ActionConfirmationModal visible={!!action && action.scope === scope} title={action?.kind === 'delete' ? '刪除費用' : '確認逐筆結清'} confirmLabel={action?.kind === 'delete' ? '確認刪除費用' : '確認記錄結清'} theme={theme} busy={Boolean(settlingId || deletingId)} loading={previewLoading} confirmDisabled={action?.kind === 'settle' && (preview === null || action.expense.is_settled)} error={actionError} onCancel={cancelAction} onConfirm={confirmAction} onRetry={action?.kind === 'settle' && preview === null ? () => loadPreview(action) : undefined}>
      <Text style={{ color: theme.colors.text, fontWeight: '700' }}>{action?.expense.title}</Text>
      {action?.kind === 'delete' ? <Text style={{ color: theme.colors.muted }}>{action.expense.currency} {Number(action.expense.amount).toLocaleString('zh-TW', { minimumFractionDigits: 2 })}。刪除後會重新計算分帳，請確認不是只要編輯此筆費用。</Text> : <>
        <Text style={{ color: theme.colors.muted }}>僅記錄結清，不會實際轉帳；請確認款項已完成支付。</Text>
        {preview?.map((row) => <View key={`${row.from_user_id}:${row.to_user_id}`} style={styles.transfer}>
          <View style={styles.transferPerson}><ProfileAvatar profile={memberFor(row.from_user_id)?.profile} userId={row.from_user_id} size={24} /><Text style={{ color: theme.colors.text, flexShrink: 1 }}>{name(row.from_user_id)}</Text></View>
          <Text style={{ color: theme.colors.muted }}>轉給</Text>
          <View style={styles.transferPerson}><ProfileAvatar profile={memberFor(row.to_user_id)?.profile} userId={row.to_user_id} size={24} /><Text style={{ color: theme.colors.text, flexShrink: 1 }}>{name(row.to_user_id)}</Text></View>
          <Text style={{ color: theme.colors.primary, fontWeight: '700' }}>{row.currency} {row.amount.toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        </View>)}
        {preview?.length === 0 ? <Text style={{ color: theme.colors.muted }}>此筆已無剩餘轉帳款項；確認後只會更新費用結清狀態。</Text> : null}
      </>}
    </ActionConfirmationModal>
  </View>;
}

const styles = StyleSheet.create({
  viewFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  actionButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 6 },
  filterButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 18, backgroundColor: EDITORIAL_COLORS.sand },
  transfer: { gap: 5, paddingVertical: 7 }, transferPerson: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  shares: { marginTop: 12, gap: 6 }, shareHeading: { fontSize: 11, fontWeight: '600' }, shareRows: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  shareMember: { flexDirection: 'row', alignItems: 'center', gap: 8, flexBasis: 240, flexGrow: 1, minWidth: 0, maxWidth: '100%', borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10 },
  shareIdentity: { flex: 1, minWidth: 0, gap: 2 }, shareName: { fontSize: 12, lineHeight: 18, fontWeight: '600' }, sharePayer: { fontSize: 10, lineHeight: 14 }, shareAmount: { fontSize: 12, lineHeight: 18, fontWeight: '700', flexShrink: 1, maxWidth: '50%', textAlign: 'right' },
  list: { width: '100%', maxWidth: '100%', gap: 10 }, rateLabel: { fontSize: 12, fontWeight: '700' }, card: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', borderRadius: 15, padding: 15, borderWidth: 1 },
  top: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }, details: { flex: 1, minWidth: 0 }, title: { fontSize: 16, fontWeight: '800' }, metaRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', marginTop: 5 }, payer: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '55%' }, meta: { fontSize: 12, lineHeight: 18 }, status: { fontSize: 11, fontWeight: '800', marginLeft: 4 }, amountBlock: { maxWidth: '42%', flexShrink: 0, alignItems: 'flex-end' }, amount: { fontSize: 13, fontWeight: '800', textAlign: 'right' }, twdAmount: { fontSize: 11, fontWeight: '700', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 18, marginTop: 12 }, edit: { color: EDITORIAL_COLORS.terracotta, fontWeight: '700', minHeight: 44, paddingVertical: 12 }, settle: { color: EDITORIAL_COLORS.terracotta, fontWeight: '800', minHeight: 44, paddingVertical: 12 }, delete: { color: EDITORIAL_COLORS.dangerText, fontWeight: '700', minHeight: 44, paddingVertical: 12 }, disabled: { opacity: 0.5 }, empty: { width: '100%', maxWidth: '100%', alignItems: 'center', padding: 40, gap: 8, boxSizing: 'border-box' }, icon: { fontSize: 30 }, muted: {},
});
