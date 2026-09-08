import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { calculateExpenseAnalytics, EXPENSE_CATEGORIES } from '../lib/expenses-analytics';

const rates = { TWD: 1, JPY: 0.2, KRW: 0.02, USD: 30, EUR: 32 };

describe('expense analytics', () => {
  it('aggregates spending, remaining budget, and category percentages in TWD', () => {
    const result = calculateExpenseAnalytics([
      { payer_id: 'alice', amount: 100, currency: 'TWD', category: '餐飲', splits: [] },
      { payer_id: 'bob', amount: 1000, currency: 'JPY', category: '交通', splits: [] },
      { payer_id: 'alice', amount: 50, currency: 'USD', category: '未知分類', splits: [] },
    ], ['alice', 'bob'], { amount: 2000, currency: 'TWD' }, rates);

    expect(result.totalSpentTwd).toBe(1800);
    expect(result.totalBudgetTwd).toBe(2000);
    expect(result.remainingBudgetTwd).toBe(200);
    expect(result.progressRatio).toBe(0.9);
    expect(result.isOverBudget).toBe(false);
    expect(result.categories).toEqual([
      { category: '餐飲', amountTwd: 100, percentage: 5.56 },
      { category: '交通', amountTwd: 200, percentage: 11.11 },
      { category: '住宿', amountTwd: 0, percentage: 0 },
      { category: '購物', amountTwd: 0, percentage: 0 },
      { category: '其他', amountTwd: 1500, percentage: 83.33 },
    ]);
    expect(EXPENSE_CATEGORIES).toEqual(['餐飲', '交通', '住宿', '購物', '其他']);
  });

  it('calculates each member paid, owed, and the minimal settlement suggestion', () => {
    const result = calculateExpenseAnalytics([
      { payer_id: 'alice', amount: 100, currency: 'TWD', category: '餐飲', splits: [{ user_id: 'alice', amount: 50 }, { user_id: 'bob', amount: 50 }] },
      { payer_id: 'carol', amount: 90, currency: 'TWD', category: '交通', splits: [{ user_id: 'alice', amount: 30 }, { user_id: 'bob', amount: 30 }, { user_id: 'carol', amount: 30 }] },
    ], ['alice', 'bob', 'carol'], { amount: 500, currency: 'TWD' }, rates);

    expect(result.members).toEqual([
      { memberId: 'alice', paidTwd: 100, owedTwd: 80, netTwd: 20 },
      { memberId: 'bob', paidTwd: 0, owedTwd: 80, netTwd: -80 },
      { memberId: 'carol', paidTwd: 90, owedTwd: 30, netTwd: 60 },
    ]);
    expect(result.settlements).toEqual([
      { from: 'bob', to: 'carol', amount: 60, currency: 'TWD' },
      { from: 'bob', to: 'alice', amount: 20, currency: 'TWD' },
    ]);
  });

  it('flags an over-budget trip and exposes a negative remaining amount', () => {
    const result = calculateExpenseAnalytics([
      { payer_id: 'alice', amount: 1200, currency: 'TWD', category: '住宿', splits: [{ user_id: 'alice', amount: 1200 }] },
    ], ['alice'], { amount: 1000, currency: 'TWD' }, rates);

    expect(result.remainingBudgetTwd).toBe(-200);
    expect(result.progressRatio).toBe(1.2);
    expect(result.isOverBudget).toBe(true);
  });

  it('provides a dashboard component wired to analytics and over-budget feedback', () => {
    const dashboard = readFileSync(path.resolve(process.cwd(), 'src', 'components', 'BudgetDashboard.tsx'), 'utf8');
    const panel = readFileSync(path.resolve(process.cwd(), 'src', 'components', 'trip-detail', 'ExpensesPanel.tsx'), 'utf8');
    expect(dashboard).toContain('calculateExpenseAnalytics');
    expect(dashboard).toContain('isOverBudget');
    expect(dashboard).toContain('一鍵複製結算文字');
    expect(panel).toContain('<BudgetDashboard');
  });
});
