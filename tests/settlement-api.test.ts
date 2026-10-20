import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from '../lib/supabase';
import { createSettlementRecord, deleteSettlementRecord, listSettlementRecords, settleExpense, type SettlementRecord } from '../lib/settlement-api';

const record: SettlementRecord = {
  id: 'record-1',
  trip_id: 'trip-1',
  from_user_id: 'bob',
  to_user_id: 'alice',
  amount: 40,
  currency: 'TWD',
  note: 'LINE Pay 已轉',
  settled_by: 'bob',
  settled_at: '2026-09-11T01:00:00.000Z',
};

describe('settlement records API', () => {
  beforeEach(() => vi.clearAllMocks());
  it('refuses changed clearance amounts before writing anything', async () => {
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [{ ...record, expense_id: 'e', amount: 20 }], error: null }), insert: vi.fn().mockReturnThis(), update: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: record, error: null }) };
    const expense = { id: 'e', trip_id: 'trip-1', payer_id: 'alice', amount: 100, currency: 'TWD', splits: [{ user_id: 'bob', amount: 100 }] };
    const expenseQuery = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: expense, error: null }), update: vi.fn() };
    vi.mocked(supabase.from).mockImplementation((table) => (table === 'expenses' ? expenseQuery : query) as never);
    await expect(settleExpense(expense, 'bob', undefined, [{ expense_id: 'e', from_user_id: 'bob', to_user_id: 'alice', amount: 100, currency: 'TWD' }])).rejects.toThrow('重新確認');
    expect(query.insert).not.toHaveBeenCalled(); expect(query.update).not.toHaveBeenCalled();
    expect(expenseQuery.update).not.toHaveBeenCalled();
  });
  it('checks the current database expense before accepting a confirmed preview', async () => {
    const expense = { id: 'e', trip_id: 'trip-1', payer_id: 'alice', amount: 100, currency: 'TWD', splits: [{ user_id: 'bob', amount: 100 }] };
    const history = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [], error: null }), insert: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: record, error: null }) };
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { ...expense, splits: [{ user_id: 'bob', amount: 90 }] }, error: null }), update: vi.fn().mockReturnThis() };
    vi.mocked(supabase.from).mockImplementation((table) => (table === 'expenses' ? query : history) as never);
    await expect(settleExpense(expense, 'bob', undefined, [{ expense_id: 'e', from_user_id: 'bob', to_user_id: 'alice', amount: 100, currency: 'TWD' }])).rejects.toThrow('重新確認');
    expect(history.insert).not.toHaveBeenCalled(); expect(query.update).not.toHaveBeenCalled();
  });
  it('keeps the original settlement algorithm when the guarded preview still matches', async () => {
    const expense = { id: 'e', trip_id: 'trip-1', payer_id: 'alice', amount: 100, currency: 'TWD', splits: [{ user_id: 'bob', amount: 100 }] };
    const history = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), order: vi.fn().mockResolvedValue({ data: [], error: null }), insert: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: { ...record, expense_id: 'e', amount: 100 }, error: null }) };
    const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn().mockResolvedValue({ data: expense, error: null }), update: vi.fn().mockReturnThis() };
    vi.mocked(supabase.from).mockImplementation((table) => (table === 'expenses' ? query : history) as never);
    const result = await settleExpense(expense, 'bob', undefined, [{ expense_id: 'e', from_user_id: 'bob', to_user_id: 'alice', amount: 100, currency: 'TWD' }]);
    expect(history.insert).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ expense_id: 'e', amount: 100, from_user_id: 'bob', to_user_id: 'alice' }));
    expect(query.update).toHaveBeenCalledExactlyOnceWith({ is_settled: true });
    expect(result.expense.is_settled).toBe(true);
  });

  it('creates a settlement record with normalized amount and note', async () => {
    const query = {
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: record, error: null }),
    };
    vi.mocked(supabase.from).mockReturnValueOnce(query as never);

    const result = await createSettlementRecord({
      trip_id: 'trip-1',
      from_user_id: 'bob',
      to_user_id: 'alice',
      amount: '40.00',
      currency: 'TWD',
      note: '  LINE Pay 已轉  ',
      settled_by: 'bob',
    });

    expect(query.insert).toHaveBeenCalledWith(expect.objectContaining({ amount: 40, note: 'LINE Pay 已轉' }));
    expect(result).toEqual(record);
  });

  it('lists records newest first for a trip', async () => {
    const query = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: [record], error: null }),
    };
    vi.mocked(supabase.from).mockReturnValueOnce(query as never);

    await expect(listSettlementRecords('trip-1')).resolves.toEqual([record]);
    expect(query.eq).toHaveBeenCalledWith('trip_id', 'trip-1');
  });

  it('deletes a settlement history record by id', async () => {
    const query = {
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null }),
    };
    vi.mocked(supabase.from).mockReturnValueOnce(query as never);

    await expect(deleteSettlementRecord('record-1')).resolves.toBeUndefined();
    expect(query.delete).toHaveBeenCalled();
    expect(query.eq).toHaveBeenCalledWith('id', 'record-1');
  });
});
