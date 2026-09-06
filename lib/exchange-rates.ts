export const SUPPORTED_CURRENCIES = ['TWD', 'JPY', 'KRW', 'USD', 'EUR'] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];
export type SplitMode = 'amount' | 'ratio';

/** Conservative offline rates (one unit of currency in TWD). */
export const DEFAULT_TWD_RATES: Record<SupportedCurrency, number> = {
  TWD: 1,
  JPY: 0.21,
  KRW: 0.024,
  USD: 32,
  EUR: 35,
};

export function normalizeCurrency(value: string | null | undefined): SupportedCurrency {
  const normalized = (value ?? 'TWD').trim().toUpperCase();
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(normalized)
    ? normalized as SupportedCurrency
    : 'TWD';
}

export function convertToTwd(
  amount: number,
  currency?: string | null,
  rates: Partial<Record<SupportedCurrency, number>> = DEFAULT_TWD_RATES,
): number {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return 0;
  const rate = Number(rates[normalizeCurrency(currency)] ?? 1);
  return Math.round(numericAmount * (Number.isFinite(rate) ? rate : 1) * 100) / 100;
}

function roundCents(value: number) {
  return Math.round(value * 100) / 100;
}

/** Builds equal, custom-amount, or custom-ratio splits and keeps cents balanced. */
export function buildSplitAmounts(
  total: number,
  memberIds: string[],
  values: Record<string, string | number | undefined> = {},
  mode: SplitMode = 'amount',
): Record<string, number> {
  const numericTotal = Number(total);
  const ids = [...new Set(memberIds.filter(Boolean))];
  if (!Number.isFinite(numericTotal) || numericTotal <= 0) throw new Error('分攤總額必須大於 0。');
  if (!ids.length) throw new Error('至少需要一位分攤成員。');

  const parsed = ids.map((id) => {
    const raw = values[id];
    if (raw === undefined || String(raw).trim() === '') return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) throw new Error(mode === 'ratio' ? '分攤比例格式不正確。' : '分攤金額格式不正確。');
    return value;
  });

  const amounts = new Array<number>(ids.length).fill(0);
  if (mode === 'ratio') {
    const specified = parsed.reduce((sum: number, value) => sum + (value ?? 0), 0);
    if (specified > 100.009) throw new Error('分攤比例必須加總為 100%。');
    const missing = parsed.filter((value) => value === undefined).length;
    if (!missing && Math.abs(specified - 100) > 0.009) throw new Error('分攤比例必須加總為 100%。');
    const fallback = missing ? (100 - specified) / missing : 0;
    parsed.forEach((value, index) => { amounts[index] = numericTotal * ((value ?? fallback) / 100); });
  } else {
    const specified = parsed.reduce((sum: number, value) => sum + (value ?? 0), 0);
    if (specified > numericTotal + 0.009) throw new Error('分攤金額不可超過總額。');
    const missing = parsed.filter((value) => value === undefined).length;
    if (!missing && Math.abs(specified - numericTotal) > 0.009) throw new Error('分攤金額必須等於總額。');
    const fallback = missing ? (numericTotal - specified) / missing : 0;
    parsed.forEach((value, index) => { amounts[index] = value ?? fallback; });
  }

  const rounded = amounts.map(roundCents);
  const remainder = roundCents(numericTotal - rounded.reduce((sum, value) => sum + value, 0));
  rounded[rounded.length - 1] = roundCents(rounded[rounded.length - 1] + remainder);
  return Object.fromEntries(ids.map((id, index) => [id, rounded[index]]));
}

export type ExchangeRateSource = 'live' | 'cache' | 'manual' | 'default';
export type ExchangeRateSnapshot = {
  rates: Record<SupportedCurrency, number>;
  updatedAt: string | null;
  source: ExchangeRateSource;
  lockedCurrencies: SupportedCurrency[];
};
export type ExchangeRateStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | Map<string, string>;
export type ExchangeRateService = {
  getSnapshot: (forceRefresh?: boolean) => Promise<ExchangeRateSnapshot>;
  setManualRate: (currency: string, rate: number) => Promise<ExchangeRateSnapshot>;
  clearManualRate: (currency: string) => Promise<ExchangeRateSnapshot>;
};

const EXCHANGE_RATE_ENDPOINT = 'https://api.frankfurter.app/latest?from=TWD&to=JPY,KRW,USD,EUR';
const EXCHANGE_RATE_CACHE_KEY = 'travel-planner.exchange-rates.v1';
const EXCHANGE_RATE_MANUAL_KEY = 'travel-planner.exchange-rates.manual.v1';
const EXCHANGE_RATE_TTL_MS = 6 * 60 * 60 * 1000;

function defaultSnapshot(): ExchangeRateSnapshot {
  return { rates: { ...DEFAULT_TWD_RATES }, updatedAt: null, source: 'default', lockedCurrencies: [] };
}

function storageValue(storage: ExchangeRateStorage | null, key: string): string | null {
  if (!storage) return null;
  return storage instanceof Map ? storage.get(key) ?? null : storage.getItem(key);
}

function writeStorage(storage: ExchangeRateStorage | null, key: string, value: string) {
  if (!storage) return;
  if (storage instanceof Map) storage.set(key, value);
  else storage.setItem(key, value);
}

function removeStorage(storage: ExchangeRateStorage | null, key: string) {
  if (!storage) return;
  if (storage instanceof Map) storage.delete(key);
  else storage.removeItem(key);
}

function getBrowserStorage(): ExchangeRateStorage | null {
  if (typeof globalThis === 'undefined') return null;
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

function normalizeRates(rates: Partial<Record<SupportedCurrency, unknown>>): Record<SupportedCurrency, number> {
  return Object.fromEntries(SUPPORTED_CURRENCIES.map((currency) => {
    const value = Number(rates[currency]);
    return [currency, Number.isFinite(value) && value > 0 ? value : DEFAULT_TWD_RATES[currency]];
  })) as Record<SupportedCurrency, number>;
}

function readManualState(storage: ExchangeRateStorage | null): { rates: Partial<Record<SupportedCurrency, number>>; updatedAt: string | null } {
  try {
    const raw = JSON.parse(storageValue(storage, EXCHANGE_RATE_MANUAL_KEY) ?? '{}') as Record<string, unknown>;
    const value = raw.rates && typeof raw.rates === 'object' ? raw.rates as Record<string, unknown> : raw;
    return {
      rates: Object.fromEntries(SUPPORTED_CURRENCIES
        .filter((currency) => Number.isFinite(Number(value[currency])) && Number(value[currency]) > 0)
        .map((currency) => [currency, Number(value[currency])])) as Partial<Record<SupportedCurrency, number>>,
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
    };
  } catch { return { rates: {}, updatedAt: null }; }
}

export function parseLiveExchangeRates(payload: unknown, now = new Date()): ExchangeRateSnapshot {
  const record = payload as { base?: unknown; rates?: Record<string, unknown> };
  if (record?.base !== 'TWD' || !record.rates || typeof record.rates !== 'object') throw new Error('Unsupported exchange-rate response');
  const rates = Object.fromEntries(SUPPORTED_CURRENCIES.map((currency) => {
    if (currency === 'TWD') return [currency, 1];
    const foreignPerTwd = Number(record.rates?.[currency]);
    if (!Number.isFinite(foreignPerTwd) || foreignPerTwd <= 0) return [currency, DEFAULT_TWD_RATES[currency]];
    return [currency, 1 / foreignPerTwd];
  })) as Record<SupportedCurrency, number>;
  return { rates, updatedAt: now.toISOString(), source: 'live', lockedCurrencies: [] };
}

function readCachedSnapshot(storage: ExchangeRateStorage | null): ExchangeRateSnapshot | null {
  try {
    const value = JSON.parse(storageValue(storage, EXCHANGE_RATE_CACHE_KEY) ?? 'null') as Partial<ExchangeRateSnapshot> | null;
    if (!value?.rates) return null;
    return { rates: normalizeRates(value.rates), updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : null, source: 'cache', lockedCurrencies: [] };
  } catch { return null; }
}

function applyManualRates(snapshot: ExchangeRateSnapshot, manualRates: Partial<Record<SupportedCurrency, number>>, manualUpdatedAt: string | null): ExchangeRateSnapshot {
  const lockedCurrencies = Object.keys(manualRates).filter((currency): currency is SupportedCurrency => SUPPORTED_CURRENCIES.includes(currency as SupportedCurrency));
  return {
    ...snapshot,
    rates: normalizeRates({ ...snapshot.rates, ...manualRates }),
    source: lockedCurrencies.length ? 'manual' : snapshot.source,
    updatedAt: lockedCurrencies.length ? (manualUpdatedAt ?? snapshot.updatedAt) : snapshot.updatedAt,
    lockedCurrencies,
  };
}

export function createExchangeRateService(fetcher: typeof fetch = fetch.bind(globalThis), storage: ExchangeRateStorage | null = getBrowserStorage()): ExchangeRateService {
  let memorySnapshot: ExchangeRateSnapshot | null = null;
  const manualState = readManualState(storage);
  let manualRates = manualState.rates;
  let manualUpdatedAt: string | null = manualState.updatedAt;

  async function getSnapshot(forceRefresh = false): Promise<ExchangeRateSnapshot> {
    const cached = memorySnapshot ?? readCachedSnapshot(storage);
    const cacheAge = cached?.updatedAt ? Date.now() - new Date(cached.updatedAt).getTime() : Infinity;
    if (!forceRefresh && cached && Number.isFinite(cacheAge) && cacheAge >= 0 && cacheAge < EXCHANGE_RATE_TTL_MS) {
      memorySnapshot = cached;
      return applyManualRates(cached, manualRates, manualUpdatedAt);
    }
    try {
      const response = await fetcher(EXCHANGE_RATE_ENDPOINT);
      if (!response.ok) throw new Error(`Exchange-rate request failed (${response.status})`);
      const live = parseLiveExchangeRates(await response.json());
      memorySnapshot = live;
      writeStorage(storage, EXCHANGE_RATE_CACHE_KEY, JSON.stringify(live));
      return applyManualRates(live, manualRates, manualUpdatedAt);
    } catch (error) {
      console.warn('[ExchangeRates] live lookup skipped', error);
      const fallback = cached ?? defaultSnapshot();
      memorySnapshot = fallback;
      return applyManualRates({ ...fallback, source: cached ? 'cache' : 'default' }, manualRates, manualUpdatedAt);
    }
  }

  return {
    getSnapshot,
    async setManualRate(currency, rate) {
      const normalized = normalizeCurrency(currency);
      if (normalized === 'TWD' || !Number.isFinite(rate) || rate <= 0) throw new Error('Manual exchange rate must be positive');
      manualRates = { ...manualRates, [normalized]: Math.round(rate * 1000000) / 1000000 };
      manualUpdatedAt = new Date().toISOString();
      writeStorage(storage, EXCHANGE_RATE_MANUAL_KEY, JSON.stringify({ rates: manualRates, updatedAt: manualUpdatedAt }));
      return getSnapshot();
    },
    async clearManualRate(currency) {
      const normalized = normalizeCurrency(currency);
      const next = { ...manualRates };
      delete next[normalized];
      manualRates = next;
      manualUpdatedAt = new Date().toISOString();
      if (Object.keys(next).length) writeStorage(storage, EXCHANGE_RATE_MANUAL_KEY, JSON.stringify({ rates: next, updatedAt: manualUpdatedAt }));
      else removeStorage(storage, EXCHANGE_RATE_MANUAL_KEY);
      return getSnapshot();
    },
  };
}

export const exchangeRateService = createExchangeRateService();

export function getDefaultExchangeRateSnapshot(): ExchangeRateSnapshot { return defaultSnapshot(); }
