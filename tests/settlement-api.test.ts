import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/supabase', () => ({
  supabase: { from: vi.fn() },
}));

import { supabase } from '../lib/supabase';
import { createSettlementRecord, listSettlementRecords, type SettlementRecord } from '../lib/settlement-api';

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
});
