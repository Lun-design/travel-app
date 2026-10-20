import { useEffect, useRef, useState } from 'react';
import { listSettlementRecords, type SettlementRecord } from '../../lib/settlement-api';
import { supabase } from '../../lib/supabase';

export type SettlementRecordsState = {
  records: SettlementRecord[]; loading: boolean; hasLoaded: boolean; error: string | null;
  reload: () => Promise<void>; add: (record: SettlementRecord) => void; remove: (id: string) => void;
};

/** One scoped history source shared by summary, filters and settlement UI. */
export function useSettlementRecords(tripId: string, userId?: string, enabled = true): SettlementRecordsState {
  const key = JSON.stringify([tripId, userId, enabled]);
  const activeVisit = useRef({ key });
  if (activeVisit.current.key !== key) activeVisit.current = { key };
  const visit = activeVisit.current;
  const [state, setState] = useState({ visit, records: [] as SettlementRecord[], loading: true, hasLoaded: false, error: null as string | null });
  const requestId = useRef(0), mounted = useRef(true);
  const current = () => enabled && mounted.current && activeVisit.current === visit;
  const shown = state.visit === visit ? state : { visit, records: [], loading: true, hasLoaded: false, error: null };
  async function reload() {
    if (!current()) return;
    const request = ++requestId.current;
    setState(previous => ({ ...(previous.visit === visit ? previous : { visit, records: [], hasLoaded: false }), loading: true, error: null }));
    try {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('目前離線，無法確認最新結清紀錄。');
      const records = await listSettlementRecords(tripId);
      if (current() && request === requestId.current) setState({ visit, records: records.filter(record => record?.trip_id === tripId), loading: false, hasLoaded: true, error: null });
    } catch (error) {
      if (current() && request === requestId.current) setState(previous => ({ ...previous, loading: false, error: error instanceof Error ? error.message : '結清紀錄載入失敗，請重試。' }));
    }
  }
  useEffect(() => {
    mounted.current = true;
    if (!enabled) return;
    void reload();
    const channel = supabase.channel(`settlement-records:${tripId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'settlement_records', filter: `trip_id=eq.${tripId}` }, () => { void reload(); }).subscribe();
    const online = () => { void reload(); };
    if (typeof window !== 'undefined') window.addEventListener('online', online);
    return () => {
      mounted.current = false; requestId.current++;
      if (typeof window !== 'undefined') window.removeEventListener('online', online);
      void supabase.removeChannel(channel).catch(error => console.error('[settlement] unsubscribe failed', error));
    };
  }, [key]);
  function change(updater: (records: SettlementRecord[]) => SettlementRecord[]) {
    if (!current()) return;
    requestId.current++;
    setState(previous => previous.visit === visit ? { ...previous, records: updater(previous.records), loading: false } : previous);
  }
  return {
    ...shown, reload,
    add: record => { if (record.trip_id === tripId) change(records => [record, ...records.filter(row => row.id !== record.id)]); },
    remove: id => change(records => records.filter(record => record.id !== id)),
  };
}
