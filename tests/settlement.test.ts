import { describe, expect, it } from 'vitest';
import { applySettlementRecords, calculateMinSettlements } from '../lib/settlement';

const members = [{ user_id: 'alice' }, { user_id: 'bob' }, { user_id: 'carol' }];

describe('calculateMinSettlements', () => {
  it('finds the one transfer needed for a two-person split', () => {
    const result = calculateMinSettlements([
      { payer_id: 'alice', amount: 100, currency: 'TWD', splits: [{ user_id: 'alice', amount: 50 }, { user_id: 'bob', amount: 50 }] },
    ], members);

    expect(result).toEqual([{ from: 'bob', to: 'alice', amount: 50, currency: 'TWD' }]);
  });

  it('collapses a three-person payment chain into the minimum transfer count', () => {
    const result = calculateMinSettlements([
      { payer_id: 'alice', amount: 100, currency: 'TWD', splits: [{ user_id: 'bob', amount: 50 }, { user_id: 'carol', amount: 50 }] },
      { payer_id: 'bob', amount: 50, currency: 'TWD', splits: [{ user_id: 'carol', amount: 50 }] },
    ], members);

    expect(result).toEqual([{ from: 'carol', to: 'alice', amount: 100, currency: 'TWD' }]);
  });

  it('converts mixed currencies to TWD before settling', () => {
    const result = calculateMinSettlements([
      { payer_id: 'alice', amount: 1000, currency: 'JPY', splits: [{ user_id: 'alice', amount: 500 }, { user_id: 'bob', amount: 500 }] },
      { payer_id: 'bob', amount: 32, currency: 'USD', splits: [{ user_id: 'alice', amount: 16 }, { user_id: 'bob', amount: 16 }] },
    ], members, { JPY: 0.2, USD: 30 });

    expect(result).toEqual([{ from: 'alice', to: 'bob', amount: 380, currency: 'TWD' }]);
  });

  it('returns no transfers when everyone is already balanced', () => {
    const result = calculateMinSettlements([
      { payer_id: 'alice', amount: 100, currency: 'TWD', splits: [{ user_id: 'alice', amount: 50 }, { user_id: 'bob', amount: 50 }] },
      { payer_id: 'bob', amount: 100, currency: 'TWD', splits: [{ user_id: 'alice', amount: 50 }, { user_id: 'bob', amount: 50 }] },
    ], ['alice', 'bob']);

    expect(result).toEqual([]);
  });

  it('subtracts recorded payments from matching settlement suggestions', () => {
    const remaining = applySettlementRecords(
      [
        { from: 'bob', to: 'alice', amount: 100, currency: 'TWD' },
        { from: 'carol', to: 'alice', amount: 80, currency: 'TWD' },
      ],
      [{ from_user_id: 'bob', to_user_id: 'alice', amount: 40, currency: 'TWD' }],
    );

    expect(remaining).toEqual([
      { from: 'bob', to: 'alice', amount: 60, currency: 'TWD' },
      { from: 'carol', to: 'alice', amount: 80, currency: 'TWD' },
    ]);
  });
});
