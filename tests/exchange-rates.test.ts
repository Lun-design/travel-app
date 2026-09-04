import { describe, expect, it } from 'vitest';
import { SUPPORTED_CURRENCIES, buildSplitAmounts, convertToTwd, normalizeCurrency } from '../lib/exchange-rates';

describe('exchange rate and split helpers', () => {
  it('supports the common travel currencies and normalizes unknown values', () => {
    expect(SUPPORTED_CURRENCIES).toEqual(['TWD', 'JPY', 'KRW', 'USD', 'EUR']);
    expect(normalizeCurrency('jpy')).toBe('JPY');
    expect(normalizeCurrency('cad')).toBe('TWD');
  });

  it('converts foreign currency amounts to rounded TWD using the configured rates', () => {
    expect(convertToTwd(100, 'USD', { TWD: 1, USD: 32, JPY: 0.21, KRW: 0.024, EUR: 35 })).toBe(3200);
    expect(convertToTwd(1000, 'JPY', { TWD: 1, USD: 32, JPY: 0.21, KRW: 0.024, EUR: 35 })).toBe(210);
  });

  it('builds equal, custom amount, and ratio-based splits that sum to the total', () => {
    expect(buildSplitAmounts(100, ['a', 'b', 'c'], {}, 'amount')).toEqual({ a: 33.33, b: 33.33, c: 33.34 });
    expect(buildSplitAmounts(100, ['a', 'b'], { a: '70' }, 'amount')).toEqual({ a: 70, b: 30 });
    expect(buildSplitAmounts(100, ['a', 'b'], { a: '25', b: '75' }, 'ratio')).toEqual({ a: 25, b: 75 });
  });

  it('rejects invalid custom split totals', () => {
    expect(() => buildSplitAmounts(100, ['a', 'b'], { a: '80', b: '30' }, 'amount')).toThrow(/分攤/);
    expect(() => buildSplitAmounts(100, ['a', 'b'], { a: '80', b: '30' }, 'ratio')).toThrow(/比例/);
  });
});
