import { describe, expect, it } from 'vitest';
import { groupVouchersByDate } from '../lib/voucher-date-grouping';

describe('voucher date grouping', () => {
  it('sorts future vouchers ascending and separates undated and expired entries', () => {
    const groups = groupVouchersByDate([
      { id: 'later', usage_at: '2026-12-25T10:00:00Z' },
      { id: 'expired', usage_at: '2020-01-01T10:00:00Z' },
      { id: 'none', usage_at: null },
      { id: 'soon', usage_at: '2026-10-01T10:00:00Z' },
    ], new Date('2026-09-22T00:00:00Z'));

    expect(groups.future.map((item) => item.id)).toEqual(['soon', 'later']);
    expect(groups.expired.map((item) => item.id)).toEqual(['expired']);
    expect(groups.undated.map((item) => item.id)).toEqual(['none']);
  });
});
