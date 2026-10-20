import { supabase } from './supabase';
import { normalizeCurrency, type SupportedCurrency } from './exchange-rates';
import { createExpenseSettlementTransfers, type ExpenseSettlementTransfer, type SettlementClearanceRecord, type SettlementExpense } from './settlement';

export class SettlementPreviewChangedError extends Error {
  constructor(public readonly transfers: ExpenseSettlementTransfer[]) {
    super('結清資料已更新，請重新確認金額後再送出。');
    this.name = 'SettlementPreviewChangedError';
  }
}
function transferKey(rows: readonly ExpenseSettlementTransfer[]) {
  return JSON.stringify(rows.map((row) => [row.expense_id, row.from_user_id, row.to_user_id, row.currency, row.amount]).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))));
}

export type SettlementRecord = {
  id: string;
  trip_id: string;
  expense_id?: string | null;
  from_user_id: string;
  to_user_id: string;
  amount: number;
  currency: SupportedCurrency;
  note: string | null;
  settled_by: string;
  settled_at: string;
};

export type CreateSettlementRecordInput = {
  trip_id: string;
  expense_id?: string | null;
  from_user_id: string;
  to_user_id: string;
  amount: number | string;
  currency?: string | null;
  note?: string | null;
  settled_by: string;
};

export function normalizeSettlementRecord(row: unknown): SettlementRecord {
  const value = row as Partial<SettlementRecord>;
  const normalized: SettlementRecord = {
    id: String(value.id ?? ''),
    trip_id: String(value.trip_id ?? ''),
    from_user_id: String(value.from_user_id ?? ''),
    to_user_id: String(value.to_user_id ?? ''),
    amount: Number(value.amount ?? 0),
    currency: normalizeCurrency(value.currency),
    note: value.note == null ? null : String(value.note),
    settled_by: String(value.settled_by ?? ''),
    settled_at: String(value.settled_at ?? ''),
  };
  if (value.expense_id != null) normalized.expense_id = String(value.expense_id);
  return normalized;
}

export async function createSettlementRecord(input: CreateSettlementRecordInput): Promise<SettlementRecord> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('結清金額必須大於 0。');
  if (input.from_user_id === input.to_user_id) throw new Error('付款人與收款人不能相同。');
  const payload = {
    trip_id: input.trip_id,
    ...(input.expense_id ? { expense_id: input.expense_id } : {}),
    from_user_id: input.from_user_id,
    to_user_id: input.to_user_id,
    amount: Math.round(amount * 100) / 100,
    currency: normalizeCurrency(input.currency),
    note: input.note?.trim() || null,
    settled_by: input.settled_by,
  };
  const { data, error } = await supabase.from('settlement_records').insert(payload).select().single();
  if (error) throw error;
  return normalizeSettlementRecord(data);
}

export async function listSettlementRecords(tripId: string): Promise<SettlementRecord[]> {
  const { data, error } = await supabase
    .from('settlement_records')
    .select('*')
    .eq('trip_id', tripId)
    .order('settled_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeSettlementRecord);
}

export async function listSettlementRecordsForExpense(expenseId: string): Promise<SettlementRecord[]> {
  const { data, error } = await supabase
    .from('settlement_records')
    .select('*')
    .eq('expense_id', expenseId)
    .order('settled_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(normalizeSettlementRecord);
}

export async function deleteSettlementRecord(recordId: string): Promise<void> {
  const { error } = await supabase.from('settlement_records').delete().eq('id', recordId);
  if (error) throw error;
}

export type SettleExpenseResult = {
  records: SettlementRecord[];
  expense: SettlementExpense & { id: string; is_settled: boolean };
};

/** Creates only the outstanding transfers for an expense, then marks it settled. */
export async function settleExpense(
  expense: SettlementExpense & { id: string; trip_id: string },
  settledBy: string,
  note?: string | null,
  expectedTransfers?: readonly ExpenseSettlementTransfer[],
): Promise<SettleExpenseResult> {
  if (expectedTransfers) {
    const { data, error } = await supabase.from('expenses')
      .select('id,trip_id,payer_id,amount,currency,is_settled,splits:expense_splits(*)')
      .eq('id', expense.id).eq('trip_id', expense.trip_id).single();
    if (error) throw error;
    if (!data || data.id !== expense.id || data.trip_id !== expense.trip_id) throw new Error('費用已變更或無法取得，請重新開啟行程。');
    expense = { ...data, amount: Number(data.amount), splits: (data.splits ?? []).map((split: { user_id: string; amount: number | string }) => ({ user_id: split.user_id, amount: Number(split.amount) })) };
  }
  const existing = await listSettlementRecordsForExpense(expense.id);
  const transfers = createExpenseSettlementTransfers(expense, existing as SettlementClearanceRecord[]);
  // Re-read history immediately before writes; never silently settle an amount
  // different from the preview the user confirmed. This is not a DB transaction.
  if (expectedTransfers && transferKey(transfers) !== transferKey(expectedTransfers)) throw new SettlementPreviewChangedError(transfers);
  const created: SettlementRecord[] = [];
  try {
    for (const transfer of transfers) {
      created.push(await createSettlementRecord({
        trip_id: expense.trip_id,
        expense_id: transfer.expense_id,
        from_user_id: transfer.from_user_id,
        to_user_id: transfer.to_user_id,
        amount: transfer.amount,
        currency: transfer.currency,
        note: note?.trim() || '逐筆費用結清',
        settled_by: settledBy,
      }));
    }
    const { error } = await supabase.from('expenses').update({ is_settled: true }).eq('id', expense.id);
    if (error) throw error;
    return { records: created, expense: { ...expense, is_settled: true } };
  } catch (error) {
    await Promise.all(created.filter((record) => record.id).map((record) => deleteSettlementRecord(record.id).catch(() => undefined)));
    throw error;
  }
}
