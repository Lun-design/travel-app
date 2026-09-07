import { supabase } from './supabase';
import type { SupportedCurrency } from './exchange-rates';

export type TripBudget = {
  id: string;
  trip_id: string;
  total_amount: number;
  currency: SupportedCurrency;
  updated_by: string;
  updated_at: string;
};

export async function getTripBudget(tripId: string): Promise<TripBudget | null> {
  const { data, error } = await supabase.from('trip_budgets').select('*').eq('trip_id', tripId).maybeSingle();
  if (error) throw error;
  return data ? { ...data, total_amount: Number(data.total_amount) } as TripBudget : null;
}

export async function saveTripBudget(input: { trip_id: string; total_amount: number; currency: SupportedCurrency; updated_by: string }): Promise<TripBudget> {
  const amount = Number(input.total_amount);
  if (!Number.isFinite(amount) || amount < 0) throw new Error('預算金額必須是 0 或以上的數字。');
  const { data, error } = await supabase.from('trip_budgets').upsert({ ...input, total_amount: Math.round(amount * 100) / 100 }, { onConflict: 'trip_id' }).select().single();
  if (error) throw error;
  return { ...data, total_amount: Number(data.total_amount) } as TripBudget;
}
