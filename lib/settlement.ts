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
export type SettlementMemberBalance = {
  memberId: string;
  paidTwd: number;
  owedTwd: number;
  settledOutTwd: number;
  settledInTwd: number;
  netTwd: number;
};

function roundAmount(value: number): number {
  return Math.round(value * 100) / 100;
}

function memberId(member: SettlementMember): string {
  return typeof member === 'string' ? member : member.user_id;
}

type BalanceState = {
  ids: string[];
  settlementCurrency: SupportedCurrency;
  balances: Map<string, number>;
  paid: Map<string, number>;
  owed: Map<string, number>;
  settledOut: Map<string, number>;
  settledIn: Map<string, number>;
};

function amountInSettlementCurrency(
  amount: number,
  currency: string | null | undefined,
  settlementCurrency: SupportedCurrency,
  rates: Partial<Record<SupportedCurrency, number>>,
): number {
  const numeric = Number(amount);
  if (!Number.isFinite(numeric)) return 0;
  const sourceCurrency = normalizeCurrency(currency);
  if (sourceCurrency === settlementCurrency) return numeric;
  const amountTwd = convertToTwd(numeric, sourceCurrency, rates);
  const settlementUnitTwd = convertToTwd(1, settlementCurrency, rates);
  return settlementUnitTwd > 0 ? amountTwd / settlementUnitTwd : 0;
}

function buildBalanceState(
  expenses: readonly SettlementExpense[],
  members: readonly SettlementMember[],
  records: readonly SettlementClearanceRecord[],
  rates: Partial<Record<SupportedCurrency, number>>,
): BalanceState {
  const idsSet = new Set<string>(members.map(memberId).filter(Boolean));
  expenses.forEach((expense) => {
    if (expense.payer_id) idsSet.add(expense.payer_id);
    expense.splits?.forEach((split) => { if (split.user_id) idsSet.add(split.user_id); });
  });
  records.forEach((record) => {
    if (record.from_user_id) idsSet.add(record.from_user_id);
    if (record.to_user_id) idsSet.add(record.to_user_id);
  });

  const ids = [...idsSet];
  const currencies = new Set(expenses.map((expense) => normalizeCurrency(expense.currency)));
  const settlementCurrency: SupportedCurrency = currencies.size === 1 ? [...currencies][0] : 'TWD';
  const paid = new Map(ids.map((id) => [id, 0]));
  const owed = new Map(ids.map((id) => [id, 0]));
  const settledOut = new Map(ids.map((id) => [id, 0]));
  const settledIn = new Map(ids.map((id) => [id, 0]));

  for (const expense of expenses) {
    const currency = normalizeCurrency(expense.currency);
    const paidAmount = amountInSettlementCurrency(expense.amount, currency, settlementCurrency, rates);
    paid.set(expense.payer_id, (paid.get(expense.payer_id) ?? 0) + paidAmount);
    const splits = expense.splits?.filter((split) => split.user_id) ?? [];
    if (splits.length) {
      splits.forEach((split) => {
        owed.set(split.user_id, (owed.get(split.user_id) ?? 0) + amountInSettlementCurrency(split.amount, currency, settlementCurrency, rates));
      });
    } else if (ids.length) {
      const equalShare = paidAmount / ids.length;
      ids.forEach((id) => owed.set(id, (owed.get(id) ?? 0) + equalShare));
    }
  }

  for (const record of records) {
    const amount = amountInSettlementCurrency(record.amount, record.currency, settlementCurrency, rates);
    if (amount <= 0) continue;
    settledOut.set(record.from_user_id, (settledOut.get(record.from_user_id) ?? 0) + amount);
    settledIn.set(record.to_user_id, (settledIn.get(record.to_user_id) ?? 0) + amount);
  }

  const balances = new Map(ids.map((id) => [
    id,
    roundAmount((paid.get(id) ?? 0) + (settledOut.get(id) ?? 0) - (owed.get(id) ?? 0) - (settledIn.get(id) ?? 0)),
  ]));
  return { ids, settlementCurrency, balances, paid, owed, settledOut, settledIn };
}

/**
 * Computes each member's balance using expenses and completed transfers:
 * paid advances + outgoing settlements - owed share - incoming settlements.
 */
export function computeBalances(
  expenses: readonly SettlementExpense[],
  members: readonly SettlementMember[],
  records: readonly SettlementClearanceRecord[] = [],
  rates: Partial<Record<SupportedCurrency, number>> = {},
): SettlementMemberBalance[] {
  const state = buildBalanceState(expenses, members, records, rates);
  return state.ids.map((memberId) => ({
    memberId,
    paidTwd: roundAmount(state.paid.get(memberId) ?? 0),
    owedTwd: roundAmount(state.owed.get(memberId) ?? 0),
    settledOutTwd: roundAmount(state.settledOut.get(memberId) ?? 0),
    settledInTwd: roundAmount(state.settledIn.get(memberId) ?? 0),
    netTwd: roundAmount(state.balances.get(memberId) ?? 0),
  }));
}

/** Computes the minimum greedy transfer set, optionally after clearances. */
export function calculateMinSettlements(
  expenses: SettlementExpense[],
  members: SettlementMember[],
  rates: Partial<Record<SupportedCurrency, number>> = {},
  records: readonly SettlementClearanceRecord[] = [],
): MinSettlement[] {
  const state = buildBalanceState(expenses, members, records, rates);
  const creditors = [...state.balances]
    .filter(([, amount]) => amount > 0.009)
    .map(([userId, amount]) => ({ userId, amount }))
    .sort((a, b) => b.amount - a.amount);
  const debtors = [...state.balances]
    .filter(([, amount]) => amount < -0.009)
    .map(([userId, amount]) => ({ userId, amount: -amount }))
    .sort((a, b) => b.amount - a.amount);

  const result: MinSettlement[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const amount = roundAmount(Math.min(debtors[debtorIndex].amount, creditors[creditorIndex].amount));
    if (amount > 0) result.push({ from: debtors[debtorIndex].userId, to: creditors[creditorIndex].userId, amount, currency: state.settlementCurrency });
    debtors[debtorIndex].amount = roundAmount(debtors[debtorIndex].amount - amount);
    creditors[creditorIndex].amount = roundAmount(creditors[creditorIndex].amount - amount);
    if (debtors[debtorIndex].amount < 0.01) debtorIndex += 1;
    if (creditors[creditorIndex].amount < 0.01) creditorIndex += 1;
  }
  return result;
}

/** Subtracts persisted payments from an existing suggestion list for legacy callers. */
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
    const remaining = roundAmount(settlement.amount - (paid.get(key) ?? 0));
    if (remaining <= 0.009) return [];
    return [{ ...settlement, amount: remaining }];
  });
}
