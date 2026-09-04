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
