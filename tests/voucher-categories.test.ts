import { describe, expect, it } from 'vitest';
import { inferVoucherCategory, voucherCategoryOptions } from '../lib/voucher-categories';

describe('voucher categories', () => {
  it('infers common ticket categories from titles', () => {
    expect(inferVoucherCategory('KIX to TPE flight')).toBe('flight');
    expect(inferVoucherCategory('大阪飯店住宿')).toBe('hotel');
    expect(inferVoucherCategory('USJ 入場門票')).toBe('ticket');
    expect(inferVoucherCategory('ICOCA 交通卡')).toBe('transport');
  });

  it('exposes all selectable category options', () => {
    expect(voucherCategoryOptions.map((option) => option.value)).toEqual(['flight', 'hotel', 'ticket', 'transport', 'other']);
  });
});
