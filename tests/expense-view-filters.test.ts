import { describe, expect, it } from 'vitest';
import type { Expense } from '../lib/expenses-api';
import { filterExpenseView, personalBalanceLabel } from '../lib/expense-view-filters';
const expense = (id: string, extra: Partial<Expense> = {}): Expense => ({ id, trip_id: 't', payer_id: 'a', title: id, amount: 100, currency: 'TWD', category: '餐飲', created_at: '', splits: [{ user_id: 'a', amount: 50 }, { user_id: 'b', amount: 50 }], ...extra });
const paid = { expense_id: 'partial', from_user_id: 'b', to_user_id: 'a', amount: 20, currency: 'TWD' };
describe('expense view-only filters', () => {
  it('includes expenses paid by me or shared with me but not unrelated expenses', () => {
    const rows = [expense('payer'), expense('split', { payer_id: 'c' }), expense('other', { payer_id: 'c', splits: [{ user_id: 'c', amount: 100 }] })];
    expect(filterExpenseView(rows, { mineOnly: true }, 'a', []).map(r => r.id)).toEqual(['payer', 'split']);
    expect(filterExpenseView(rows, { mineOnly: true }, undefined, [])).toEqual([]);
  });
  it('handles partial, full, flagged and self-paid expenses using real outstanding transfers', () => {
    const rows = [expense('partial'), expense('full'), expense('flagged', { is_settled: true }), expense('self', { splits: [{ user_id: 'a', amount: 100 }] })];
    const records = [paid, { ...paid, expense_id: 'full', amount: 50 }];
    expect(filterExpenseView(rows, { pendingOnly: true }, 'b', records).map(r => r.id)).toEqual(['partial']);
  });
  it('never allocates a global settlement arbitrarily back to a single expense', () => {
    const rows = [expense('e')];
    expect(filterExpenseView(rows, { pendingOnly: true }, 'b', [{ ...paid, expense_id: null, amount: 500 }])).toEqual(rows);
  });
  it('combines filters and preserves the source list', () => {
    const rows = [expense('food'), expense('hotel', { category: '住宿' }), expense('settled', { is_settled: true })];
    const before = structuredClone(rows);
    expect(filterExpenseView(rows, { category: '餐飲', mineOnly: true, pendingOnly: true }, 'b', []).map(r => r.id)).toEqual(['food']);
    expect(rows).toEqual(before);
    expect(filterExpenseView([], {}, 'b', [])).toEqual([]);
  });
  it('formats the existing balance rather than recomputing it or saying receive zero', () => {
    expect(personalBalanceLabel(-17833)).toBe('我的剩餘應付 TWD 17,833.00');
    expect(personalBalanceLabel(17833)).toBe('我的剩餘應收 TWD 17,833.00');
    expect(personalBalanceLabel(0)).toBe('已平衡');
    expect(personalBalanceLabel(undefined)).toBe('尚無個人分帳資料');
  });
});
