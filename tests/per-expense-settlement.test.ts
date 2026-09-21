import { describe, expect, it } from 'vitest';
import {
  calculateExpenseSettlement,
  createExpenseSettlementTransfers,
  type SettlementExpense,
} from '../lib/settlement';

const expense: SettlementExpense & { id: string; is_settled?: boolean } = {
  id: 'expense-1',
  payer_id: 'payer',
  amount: 36666,
  currency: 'TWD',
  splits: [
    { user_id: 'payer', amount: 18333 },
    { user_id: 'debtor', amount: 18333 },
  ],
};

describe('per-expense settlement', () => {
  it('calculates the unpaid remainder for one expense', () => {
    const status = calculateExpenseSettlement(expense, [
      { expense_id: 'expense-1', from_user_id: 'debtor', to_user_id: 'payer', amount: 500, currency: 'TWD' },
    ]);

    expect(status).toMatchObject({
      expenseId: 'expense-1',
      totalOwed: 18333,
      settledAmount: 500,
      remainingAmount: 17833,
      isSettled: false,
    });
  });

  it('creates only the outstanding transfers for non-payers', () => {
    expect(createExpenseSettlementTransfers(expense, [
      { expense_id: 'expense-1', from_user_id: 'debtor', to_user_id: 'payer', amount: 500, currency: 'TWD' },
    ])).toEqual([
      { expense_id: 'expense-1', from_user_id: 'debtor', to_user_id: 'payer', amount: 17833, currency: 'TWD' },
    ]);
  });

  it('treats a marked expense as fully settled', () => {
    expect(calculateExpenseSettlement({ ...expense, is_settled: true }, [])).toMatchObject({
      remainingAmount: 0,
      isSettled: true,
    });
  });
});
