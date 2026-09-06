import { describe, expect, it, vi } from 'vitest';
import { SUPPORTED_CURRENCIES, buildSplitAmounts, convertToTwd, createExchangeRateService, normalizeCurrency, parseLiveExchangeRates } from '../lib/exchange-rates';

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

  it('parses a TWD-base live response into TWD-per-foreign-currency rates', () => {
    const snapshot = parseLiveExchangeRates({ base: 'TWD', rates: { JPY: 4.7, USD: 0.03125, EUR: 0.0285 } }, new Date('2026-09-06T00:00:00.000Z'));
    expect(snapshot.rates.JPY).toBeCloseTo(1 / 4.7, 6);
    expect(snapshot.rates.USD).toBeCloseTo(32, 6);
    expect(snapshot.source).toBe('live');
    expect(snapshot.updatedAt).toBe('2026-09-06T00:00:00.000Z');
  });

  it('falls back to defaults when live fetch fails and keeps a manual lock', async () => {
    const fetcher = async () => { throw new Error('offline'); };
    const storage = new Map<string, string>();
    const service = createExchangeRateService(fetcher as typeof fetch, storage);
    await service.setManualRate('USD', 31.5);
    const snapshot = await service.getSnapshot();
    expect(snapshot.rates.USD).toBe(31.5);
    expect(snapshot.source).toBe('manual');
    expect(snapshot.lockedCurrencies).toContain('USD');
  });

  it('loads live rates once, exposes an update timestamp, and reuses the cache', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ base: 'TWD', rates: { JPY: 4.7, KRW: 41.2, USD: 0.03125, EUR: 0.0285 } }), { status: 200 }));
    const service = createExchangeRateService(fetchMock, new Map<string, string>());
    const first = await service.getSnapshot();
    const second = await service.getSnapshot();
    expect(first.source).toBe('live');
    expect(first.updatedAt).toBeTruthy();
    expect(second.rates.USD).toBeCloseTo(32, 6);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
