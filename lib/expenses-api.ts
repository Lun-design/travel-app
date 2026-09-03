import { supabase } from './supabase';

export type ExpenseSplit = { id?: string; expense_id?: string; user_id: string; amount: number };
export type Expense = { id: string; trip_id: string; payer_id: string; title: string; amount: number; currency: string; category: string | null; created_at: string; splits: ExpenseSplit[] };
export type Balance = { userId: string; amount: number };
export type Settlement = { from: string; to: string; amount: number; currency: string };

export async function listExpenses(tripId: string): Promise<Expense[]> {
  const { data, error } = await supabase.from('expenses').select('*, splits:expense_splits(*)').eq('trip_id', tripId).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: any) => ({ ...row, amount: Number(row.amount), splits: (row.splits ?? []).map((split: any) => ({ ...split, amount: Number(split.amount) })) })) as Expense[];
}

export async function saveExpense(expense: Partial<Expense> & { trip_id: string; payer_id: string }, splits: Omit<ExpenseSplit, 'expense_id'>[]): Promise<Expense> {
  const payload = { trip_id: expense.trip_id, payer_id: expense.payer_id, payer: expense.payer_id, created_by: expense.payer_id, title: expense.title, amount: expense.amount, currency: expense.currency ?? 'TWD', category: expense.category ?? null };
  const query = expense.id ? supabase.from('expenses').update(payload).eq('id', expense.id).select().single() : supabase.from('expenses').insert(payload).select().single();
  const { data, error } = await query;
  if (error) throw error;
  const id = data.id as string;
  const removed = await supabase.from('expense_splits').delete().eq('expense_id', id);
  if (removed.error) throw removed.error;
  if (splits.length) { const inserted = await supabase.from('expense_splits').insert(splits.map((split) => ({ ...split, expense_id: id }))); if (inserted.error) throw inserted.error; }
  return { ...data, amount: Number(data.amount), splits: splits.map((split) => ({ ...split, expense_id: id, amount: Number(split.amount) })) } as Expense;
}

export async function deleteExpense(expenseId: string): Promise<void> { const { error } = await supabase.from('expenses').delete().eq('id', expenseId); if (error) throw error; }

export function calculateBalances(expenses: Expense[]): Settlement[] {
  const net = new Map<string, number>();
  for (const expense of expenses) { net.set(expense.payer_id, (net.get(expense.payer_id) ?? 0) + Number(expense.amount)); for (const split of expense.splits) net.set(split.user_id, (net.get(split.user_id) ?? 0) - Number(split.amount)); }
  const creditors = [...net].filter(([, amount]) => amount > 0.009).map(([userId, amount]) => ({ userId, amount })).sort((a, b) => b.amount - a.amount);
  const debtors = [...net].filter(([, amount]) => amount < -0.009).map(([userId, amount]) => ({ userId, amount: -amount })).sort((a, b) => b.amount - a.amount); const result: Settlement[] = []; let i = 0; let j = 0;
  while (i < debtors.length && j < creditors.length) { const amount = Math.round(Math.min(debtors[i].amount, creditors[j].amount) * 100) / 100; result.push({ from: debtors[i].userId, to: creditors[j].userId, amount, currency: expenses[0]?.currency ?? 'TWD' }); debtors[i].amount -= amount; creditors[j].amount -= amount; if (debtors[i].amount < 0.01) i++; if (creditors[j].amount < 0.01) j++; }
  return result;
}
