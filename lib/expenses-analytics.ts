import { convertToTwd, normalizeCurrency, type SupportedCurrency } from './exchange-rates';
import { calculateMinSettlements, type MinSettlement, type SettlementExpense, type SettlementMember } from './settlement';

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

export type ExpenseAnalytics = {
  totalBudgetTwd: number;
  totalSpentTwd: number;
  remainingBudgetTwd: number;
  progressRatio: number;
  isOverBudget: boolean;
  categories: CategoryExpenseSummary[];
  members: MemberExpenseSummary[];
  settlements: MinSettlement[];
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
): ExpenseAnalytics {
  const memberIds = [...new Set([
    ...members.map(memberId),
    ...expenses.flatMap((expense) => [expense.payer_id, ...(expense.splits ?? []).map((split) => split.user_id)]),
  ].filter(Boolean))];
  const paid = new Map(memberIds.map((id) => [id, 0]));
  const owed = new Map(memberIds.map((id) => [id, 0]));
  const categoryAmounts = new Map<ExpenseCategory, number>(EXPENSE_CATEGORIES.map((category) => [category, 0]));

  let totalSpentTwd = 0;
  for (const expense of expenses) {
    const spent = toTwd(expense.amount, expense.currency, rates);
    totalSpentTwd += spent;
    paid.set(expense.payer_id, (paid.get(expense.payer_id) ?? 0) + spent);
    const category = normalizeCategory(expense.category);
    categoryAmounts.set(category, (categoryAmounts.get(category) ?? 0) + spent);

    const splits = expense.splits?.filter((split) => split.user_id) ?? [];
    if (splits.length) {
      for (const split of splits) owed.set(split.user_id, (owed.get(split.user_id) ?? 0) + toTwd(split.amount, expense.currency, rates));
    } else if (memberIds.length) {
      const equalShare = spent / memberIds.length;
      for (const id of memberIds) owed.set(id, (owed.get(id) ?? 0) + equalShare);
    }
  }

  const totalBudgetTwd = budget ? toTwd(budget.amount, budget.currency, rates) : 0;
  const remainingBudgetTwd = budget ? round(totalBudgetTwd - totalSpentTwd) : 0;
  const progressRatio = totalBudgetTwd > 0 ? round(totalSpentTwd / totalBudgetTwd) : 0;
  const categories = EXPENSE_CATEGORIES.map((category) => {
    const amountTwd = round(categoryAmounts.get(category) ?? 0);
    return { category, amountTwd, percentage: totalSpentTwd > 0 ? round(amountTwd / totalSpentTwd * 100) : 0 };
  });
  const memberSummaries = memberIds.map((memberId) => {
    const paidTwd = round(paid.get(memberId) ?? 0);
    const owedTwd = round(owed.get(memberId) ?? 0);
    return { memberId, paidTwd, owedTwd, netTwd: round(paidTwd - owedTwd) };
  });
  const settlements = calculateMinSettlements(expenses as SettlementExpense[], memberIds, rates);

  return {
    totalBudgetTwd: round(totalBudgetTwd),
    totalSpentTwd: round(totalSpentTwd),
    remainingBudgetTwd,
    progressRatio,
    isOverBudget: Boolean(budget) && totalSpentTwd > totalBudgetTwd + 0.009,
    categories,
    members: memberSummaries,
    settlements,
  };
}

export const summarizeExpenses = calculateExpenseAnalytics;

export { normalizeCurrency };
