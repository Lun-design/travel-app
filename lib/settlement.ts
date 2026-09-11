import { convertToTwd, normalizeCurrency, type SupportedCurrency } from './exchange-rates';

export type SettlementSplit = { user_id: string; amount: number };
export type SettlementExpense = {
  payer_id: string;
  amount: number;
  currency?: string | null;
  splits?: SettlementSplit[] | null;
};
export type SettlementMember = string | { user_id: string };
export type MinSettlement = { from: string; to: string; amount: number; currency: SupportedCurrency };
export type SettlementClearanceRecord = { from_user_id: string; to_user_id: string; amount: number; currency: string };

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

function memberId(member: SettlementMember): string {
  return typeof member === 'string' ? member : member.user_id;
}

/**
 * Computes net balances and settles them with a greedy creditor/debtor match.
 * Same-currency trips remain in their original currency; mixed-currency trips
 * are converted to TWD using the supplied (or offline-safe) rates.
 */
export function calculateMinSettlements(
  expenses: SettlementExpense[],
  members: SettlementMember[],
  rates: Partial<Record<SupportedCurrency, number>> = {},
): MinSettlement[] {
  const ids = new Set<string>(members.map(memberId).filter(Boolean));
  expenses.forEach((expense) => {
    if (expense.payer_id) ids.add(expense.payer_id);
    expense.splits?.forEach((split) => { if (split.user_id) ids.add(split.user_id); });
  });

  const currencies = new Set(expenses.map((expense) => normalizeCurrency(expense.currency)));
  const settlementCurrency: SupportedCurrency = currencies.size === 1 ? [...currencies][0] : 'TWD';
  const balances = new Map<string, number>([...ids].map((id) => [id, 0]));
  const valueInSettlementCurrency = (amount: number, currency: string | null | undefined) => {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric)) return 0;
    if (settlementCurrency !== 'TWD') return numeric;
    return convertToTwd(numeric, currency, rates);
  };

  for (const expense of expenses) {
    const currency = normalizeCurrency(expense.currency);
    const paid = valueInSettlementCurrency(expense.amount, currency);
    balances.set(expense.payer_id, (balances.get(expense.payer_id) ?? 0) + paid);
    const splits = expense.splits?.filter((split) => split.user_id) ?? [];
    if (splits.length) {
      splits.forEach((split) => {
        const owed = valueInSettlementCurrency(split.amount, currency);
        balances.set(split.user_id, (balances.get(split.user_id) ?? 0) - owed);
      });
    } else if (ids.size) {
      const equalShare = paid / ids.size;
      ids.forEach((id) => balances.set(id, (balances.get(id) ?? 0) - equalShare));
    }
  }

  const creditors = [...balances]
    .filter(([, amount]) => amount > 0.009)
    .map(([userId, amount]) => ({ userId, amount }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = [...balances]
    .filter(([, amount]) => amount < -0.009)
    .map(([userId, amount]) => ({ userId, amount: -amount }))
    .sort((a, b) => b.amount - a.amount);

  const result: MinSettlement[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const amount = roundAmount(Math.min(debtors[debtorIndex].amount, creditors[creditorIndex].amount));
    if (amount > 0) result.push({ from: debtors[debtorIndex].userId, to: creditors[creditorIndex].userId, amount, currency: settlementCurrency });
    debtors[debtorIndex].amount = roundAmount(debtors[debtorIndex].amount - amount);
    creditors[creditorIndex].amount = roundAmount(creditors[creditorIndex].amount - amount);
    if (debtors[debtorIndex].amount < 0.01) debtorIndex += 1;
    if (creditors[creditorIndex].amount < 0.01) creditorIndex += 1;
  }
  return result;
}

/** Subtracts persisted payments from the current greedy settlement suggestions. */
export function applySettlementRecords(
  settlements: readonly MinSettlement[],
  records: readonly SettlementClearanceRecord[],
): MinSettlement[] {
  const paid = new Map<string, number>();
  records.forEach((record) => {
    const amount = Number(record.amount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    const key = `${record.from_user_id}|${record.to_user_id}|${normalizeCurrency(record.currency)}`;
    paid.set(key, (paid.get(key) ?? 0) + amount);
  });
  return settlements.flatMap((settlement) => {
    const key = `${settlement.from}|${settlement.to}|${settlement.currency}`;
    const remaining = Math.round((settlement.amount - (paid.get(key) ?? 0)) * 100) / 100;
    if (remaining <= 0.009) return [];
    return [{ ...settlement, amount: remaining }];
  });
}
