import type { Expense } from './expenses-api';
import { EXPENSE_CATEGORIES, normalizeCategory } from './expenses-analytics';
import { createExpenseSettlementTransfers, type SettlementClearanceRecord } from './settlement';
import type { SupportedCurrency } from './exchange-rates';

export type ExpenseViewFilters = { mineOnly?: boolean; pendingOnly?: boolean; category?: string };
export const EXPENSE_VIEW_CATEGORIES = ['門票', ...EXPENSE_CATEGORIES];
function viewCategory(category: string | null) {
  return /^(門票|ticket)$/i.test(category?.trim() ?? '') ? '門票' : normalizeCategory(category);
}
export function filterExpenseView(expenses: readonly Expense[], filters: ExpenseViewFilters, userId: string | undefined, records: readonly SettlementClearanceRecord[], rates: Partial<Record<SupportedCurrency, number>> = {}): Expense[] {
  return expenses.filter((expense) => (!filters.mineOnly || (Boolean(userId?.trim() && userId !== 'anonymous') && (expense.payer_id === userId || expense.splits?.some(split => split?.user_id === userId))))
    && (!filters.category || viewCategory(expense.category) === filters.category)
    && (!filters.pendingOnly || createExpenseSettlementTransfers(expense, records, rates).length > 0));
}
export function personalBalanceLabel(net: number | undefined): string {
  if (net === undefined || !Number.isFinite(net)) return '尚無個人分帳資料';
  if (Math.abs(net) <= 0.009) return '已平衡';
  return `我的剩餘${net < 0 ? '應付' : '應收'} TWD ${Math.abs(net).toLocaleString('zh-TW', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
