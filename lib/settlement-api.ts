import { supabase } from './supabase';
import { normalizeCurrency, type SupportedCurrency } from './exchange-rates';

export type SettlementRecord = {
  id: string;
  trip_id: string;
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
  from_user_id: string;
  to_user_id: string;
  amount: number | string;
  currency?: string | null;
  note?: string | null;
  settled_by: string;
};

export function normalizeSettlementRecord(row: unknown): SettlementRecord {
  const value = row as Partial<SettlementRecord>;
  return {
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
}

export async function createSettlementRecord(input: CreateSettlementRecordInput): Promise<SettlementRecord> {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('結清金額必須大於 0。');
  if (input.from_user_id === input.to_user_id) throw new Error('付款人與收款人不能相同。');
  const payload = {
    trip_id: input.trip_id,
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
