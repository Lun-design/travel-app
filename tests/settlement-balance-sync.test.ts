import { describe, expect, it } from 'vitest';
import { calculateExpenseAnalytics } from '../lib/expenses-analytics';
import { computeBalances, type SettlementClearanceRecord } from '../lib/settlement';

const expense = {
  payer_id: 'payer',
  amount: 36666,
  currency: 'TWD',
  splits: [
    { user_id: 'payer', amount: 18333 },
    { user_id: 'debtor', amount: 18333 },
  ],
};

const partialClearance: SettlementClearanceRecord = {
  from_user_id: 'debtor',
  to_user_id: 'payer',
  amount: 500,
  currency: 'TWD',
};

describe('settlement balance and clearance synchronization', () => {
  it('includes completed transfers in each member net balance', () => {
    const balances = computeBalances([expense], ['payer', 'debtor'], [partialClearance]);

    expect(balances).toEqual([
      { memberId: 'payer', paidTwd: 36666, owedTwd: 18333, settledOutTwd: 0, settledInTwd: 500, netTwd: 17833 },
      { memberId: 'debtor', paidTwd: 0, owedTwd: 18333, settledOutTwd: 500, settledInTwd: 0, netTwd: -17833 },
    ]);
  });

  it('returns the remaining settlement amount after a partial clearance', () => {
    const result = calculateExpenseAnalytics([expense], ['payer', 'debtor'], null, {}, [partialClearance]);

    expect(result.members).toEqual([
      { memberId: 'payer', paidTwd: 36666, owedTwd: 18333, netTwd: 17833 },
      { memberId: 'debtor', paidTwd: 0, owedTwd: 18333, netTwd: -17833 },
    ]);
    expect(result.settlements).toEqual([{ from: 'debtor', to: 'payer', amount: 17833, currency: 'TWD' }]);
    expect(result.settlementTotals).toEqual({
      payer: { settledOutTwd: 0, settledInTwd: 500 },
      debtor: { settledOutTwd: 500, settledInTwd: 0 },
    });
  });
});
