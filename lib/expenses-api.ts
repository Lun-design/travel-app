import { supabase } from './supabase';
import { convertToTwd, type SupportedCurrency } from './exchange-rates';
import { createLocalId, enqueueOfflineMutation, resolveOfflineScope, shouldQueueOffline, updateOfflineCollection, type OfflineApiOptions } from './offline-data';
import { offlineStore } from './offline-store';

export type ExpenseSplit = { id?: string; expense_id?: string; user_id: string; amount: number };
export type Expense = { id: string; trip_id: string; payer_id: string; title: string; amount: number; currency: string; category: string | null; created_at: string; splits: ExpenseSplit[] };
export type Balance = { userId: string; amount: number };
export type Settlement = { from: string; to: string; amount: number; currency: string };
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function assertUuid(value: string, field: string) { if (!UUID_PATTERN.test(value)) throw new Error(`${field} ID 格式不正確，必須是 UUID。`); }

export async function listExpenses(tripId: string, options: OfflineApiOptions = {}): Promise<Expense[]> {
  const store = options.store ?? offlineStore;
  const scope = await resolveOfflineScope(tripId, options.offlineScope);
  try {
    const { data, error } = await supabase.from('expenses').select('*, splits:expense_splits(*)').eq('trip_id', tripId).order('created_at', { ascending: false });
    if (error) throw error;
    const expenses = (data ?? []).map((row: any) => ({ ...row, amount: Number(row.amount), splits: (row.splits ?? []).map((split: any) => ({ ...split, amount: Number(split.amount) })) })) as Expense[];
    if (store) await updateOfflineCollection(store, scope, 'expenses', () => expenses);
    return expenses;
  } catch (error) {
    if (!options.replaying && shouldQueueOffline(error)) return ((await store?.getSnapshot(scope))?.expenses ?? []) as Expense[];
    throw error;
  }
}

export async function saveExpense(expense: Partial<Expense> & { trip_id: string; payer_id: string }, splits: Omit<ExpenseSplit, 'expense_id'>[], options: OfflineApiOptions = {}): Promise<Expense> {
  assertUuid(expense.trip_id, '行程');
  assertUuid(expense.payer_id, '付款人');
  const amount = Number(expense.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('費用金額必須大於 0。');
  const normalizedSplits = splits.map((split) => { assertUuid(split.user_id, '分攤成員'); const splitAmount = Number(split.amount); if (!Number.isFinite(splitAmount) || splitAmount < 0) throw new Error('分攤金額格式不正確。'); return { user_id: split.user_id, amount: splitAmount }; });
  const payload = { trip_id: expense.trip_id, payer_id: expense.payer_id, payer: expense.payer_id, created_by: expense.payer_id, title: expense.title, amount, currency: expense.currency ?? 'TWD', category: expense.category ?? null };
  const store = options.store ?? offlineStore;
  const scope = await resolveOfflineScope(expense.trip_id, options.offlineScope);
  try {
    const localId = expense.id?.startsWith('offline-') ? undefined : expense.id;
    const query = localId ? supabase.from('expenses').update(payload).eq('id', localId).select().single() : supabase.from('expenses').insert(payload).select().single();
    const { data, error } = await query;
    if (error) throw error;
    const id = data.id as string;
    const removed = await supabase.from('expense_splits').delete().eq('expense_id', id);
    if (removed.error) throw removed.error;
    if (normalizedSplits.length) { const inserted = await supabase.from('expense_splits').insert(normalizedSplits.map((split) => ({ ...split, expense_id: id }))); if (inserted.error) throw inserted.error; }
    const saved = { ...data, amount: Number(data.amount), splits: normalizedSplits.map((split) => ({ ...split, expense_id: id })) } as Expense;
    if (store) await updateOfflineCollection<Expense>(store, scope, 'expenses', (items) => items.some((item) => item.id === saved.id) ? items.map((item) => item.id === saved.id ? saved : item) : [saved, ...items]);
    return saved;
  } catch (error) {
    if (!options.replaying && shouldQueueOffline(error)) {
      const localId = expense.id?.startsWith('offline-') ? expense.id : undefined;
      const id = localId ?? createLocalId('offline-expense');
      const optimistic = { id, ...payload, created_at: new Date().toISOString(), splits: normalizedSplits.map((split) => ({ ...split, expense_id: id })) } as Expense;
      if (store) {
        await enqueueOfflineMutation(store, { scope, entity: 'expense', operation: localId ? 'create' : (expense.id ? 'update' : 'create'), resourceId: id, payload: { expense: { ...expense, ...payload, id: localId ? undefined : (expense.id ? id : undefined) }, splits: normalizedSplits } });
        await updateOfflineCollection<Expense>(store, scope, 'expenses', (items) => items.some((item) => item.id === id) ? items.map((item) => item.id === id ? optimistic : item) : [optimistic, ...items]);
      }
      return optimistic;
    }
    throw error;
  }
}

export async function deleteExpense(expenseId: string, options: OfflineApiOptions = {}): Promise<void> {
  const store = options.store ?? offlineStore;
  const scope = await resolveOfflineScope(options.offlineScope?.tripId ?? '', options.offlineScope);
  try {
    const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
    if (error) throw error;
    if (store) await updateOfflineCollection<Expense>(store, scope, 'expenses', (items) => items.filter((item) => item.id !== expenseId));
  } catch (error) {
    if (!options.replaying && shouldQueueOffline(error)) {
      if (store) {
        await enqueueOfflineMutation(store, { scope, entity: 'expense', operation: 'delete', resourceId: expenseId, payload: {} });
        await updateOfflineCollection<Expense>(store, scope, 'expenses', (items) => items.filter((item) => item.id !== expenseId));
      }
      return;
    }
    throw error;
  }
}

export function calculateBalances(expenses: Expense[], rates?: Partial<Record<SupportedCurrency, number>>): Settlement[] {
  const net = new Map<string, number>();
  for (const expense of expenses) {
    net.set(expense.payer_id, (net.get(expense.payer_id) ?? 0) + convertToTwd(Number(expense.amount), expense.currency, rates));
    for (const split of expense.splits) net.set(split.user_id, (net.get(split.user_id) ?? 0) - convertToTwd(Number(split.amount), expense.currency, rates));
  }
  const creditors = [...net].filter(([, amount]) => amount > 0.009).map(([userId, amount]) => ({ userId, amount })).sort((a, b) => b.amount - a.amount);
  const debtors = [...net].filter(([, amount]) => amount < -0.009).map(([userId, amount]) => ({ userId, amount: -amount })).sort((a, b) => b.amount - a.amount);
  const result: Settlement[] = [];
  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.round(Math.min(debtors[i].amount, creditors[j].amount) * 100) / 100;
    result.push({ from: debtors[i].userId, to: creditors[j].userId, amount, currency: 'TWD' });
    debtors[i].amount -= amount;
    creditors[j].amount -= amount;
    if (debtors[i].amount < 0.01) i++;
    if (creditors[j].amount < 0.01) j++;
  }
  return result;
}
