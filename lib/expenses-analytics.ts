import { convertToTwd, normalizeCurrency, type SupportedCurrency } from './exchange-rates';
import { calculateMinSettlements, computeBalances, type MinSettlement, type SettlementClearanceRecord, type SettlementExpense, type SettlementMember } from './settlement';

export const EXPENSE_CATEGORIES = ['餐飲', '交通', '住宿', '購物', '其他'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export type AnalyticsExpense = {
  payer_id: string;
  amount: number;
  currency?: string | null;
  category?: string | null;
  splits?: Array<{ user_id: string; amount: number }> | null;
};

export type BudgetInput = {
  amount: number;
  currency?: string | null;
} | null | undefined;

export type CategoryExpenseSummary = {
  category: ExpenseCategory;
  amountTwd: number;
  percentage: number;
};

export type MemberExpenseSummary = {
  memberId: string;
  paidTwd: number;
  owedTwd: number;
  netTwd: number;
};

export type SettlementTotals = {
  settledOutTwd: number;
  settledInTwd: number;
};

export type ExpenseAnalytics = {
  totalBudgetTwd: number;
  totalSpentTwd: number;
  remainingBudgetTwd: number;
  progressRatio: number;
  isOverBudget: boolean;
  categories: CategoryExpenseSummary[];
  members: MemberExpenseSummary[];
  settlements: MinSettlement[];
  settlementTotals: Record<string, SettlementTotals>;
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function memberId(member: SettlementMember): string {
  return typeof member === 'string' ? member : member.user_id;
}

function normalizeCategory(category: string | null | undefined): ExpenseCategory {
  const value = category?.trim().toLowerCase() ?? '';
  if (value === '餐飲' || value.includes('food') || value.includes('餐')) return '餐飲';
  if (value === '交通' || value.includes('transport') || value.includes('transit') || value.includes('交通')) return '交通';
  if (value === '住宿' || value.includes('hotel') || value.includes('stay') || value.includes('住宿')) return '住宿';
  if (value === '購物' || value.includes('shop') || value.includes('購物')) return '購物';
  return '其他';
}

function toTwd(amount: number, currency: string | null | undefined, rates: Partial<Record<SupportedCurrency, number>>): number {
  return convertToTwd(Number(amount), currency, rates);
}

export function calculateExpenseAnalytics(
  expenses: readonly AnalyticsExpense[],
  members: readonly SettlementMember[],
  budget: BudgetInput = null,
  rates: Partial<Record<SupportedCurrency, number>> = {},
  settlementRecords: readonly SettlementClearanceRecord[] = [],
): ExpenseAnalytics {
  const memberIds = [...new Set([
    ...members.map(memberId),
    ...expenses.flatMap((expense) => [expense.payer_id, ...(expense.splits ?? []).map((split) => split.user_id)]),
  ].filter(Boolean))];
  const categoryAmounts = new Map<ExpenseCategory, number>(EXPENSE_CATEGORIES.map((category) => [category, 0]));

  let totalSpentTwd = 0;
  for (const expense of expenses) {
    const spent = toTwd(expense.amount, expense.currency, rates);
    totalSpentTwd += spent;
    const category = normalizeCategory(expense.category);
    categoryAmounts.set(category, (categoryAmounts.get(category) ?? 0) + spent);
  }

  const totalBudgetTwd = budget ? toTwd(budget.amount, budget.currency, rates) : 0;
  const remainingBudgetTwd = budget ? round(totalBudgetTwd - totalSpentTwd) : 0;
  const progressRatio = totalBudgetTwd > 0 ? round(totalSpentTwd / totalBudgetTwd) : 0;
  const categories = EXPENSE_CATEGORIES.map((category) => {
    const amountTwd = round(categoryAmounts.get(category) ?? 0);
    return { category, amountTwd, percentage: totalSpentTwd > 0 ? round(amountTwd / totalSpentTwd * 100) : 0 };
  });
  const balanceRows = computeBalances(expenses as SettlementExpense[], memberIds, settlementRecords, rates);
  const memberSummaries = balanceRows.map(({ memberId, paidTwd, owedTwd, netTwd }) => ({ memberId, paidTwd, owedTwd, netTwd }));
  const settlementTotals = Object.fromEntries(balanceRows.map((row) => [row.memberId, {
    settledOutTwd: row.settledOutTwd,
    settledInTwd: row.settledInTwd,
  }])) as Record<string, SettlementTotals>;
  const settlements = calculateMinSettlements(expenses as SettlementExpense[], memberIds, rates, settlementRecords);

  return {
    totalBudgetTwd: round(totalBudgetTwd),
    totalSpentTwd: round(totalSpentTwd),
    remainingBudgetTwd,
    progressRatio,
    isOverBudget: Boolean(budget) && totalSpentTwd > totalBudgetTwd + 0.009,
    categories,
    members: memberSummaries,
    settlements,
    settlementTotals,
  };
}

export const summarizeExpenses = calculateExpenseAnalytics;

export { normalizeCurrency };
