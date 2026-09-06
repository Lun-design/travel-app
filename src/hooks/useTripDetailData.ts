import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getTrip, listTripMembers, updateTrip, type Trip, type TripMemberWithProfile } from '@/lib/trips';
import { deleteItineraryItem, listItineraryItems, saveItineraryItem, updateItineraryItemsOrder } from '@/lib/itinerary-api';
import type { ItineraryItem, ItineraryItemSaveInput } from '@/lib/itinerary';
import { calculateBalances, deleteExpense, listExpenses, saveExpense, type Expense, type ExpenseSplit } from '@/lib/expenses-api';
import { exchangeRateService, getDefaultExchangeRateSnapshot, type ExchangeRateSnapshot } from '@/lib/exchange-rates';
import { listVouchers } from '@/lib/vouchers-api';
import type { Voucher } from '@/lib/vouchers';
import { getCurrentProfile, updateCurrentProfile, type Profile } from '@/lib/profiles';
import { offlineStore, type OfflineMutation } from '@/lib/offline-store';
import { offlineSyncService } from '@/lib/offline-replay';

export function useTripDetailData(tripId: string | undefined) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<TripMemberWithProfile[]>([]);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userId, setUserId] = useState('');
  const [rateSnapshot, setRateSnapshot] = useState<ExchangeRateSnapshot>(() => getDefaultExchangeRateSnapshot());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncConflicts, setSyncConflicts] = useState<OfflineMutation[]>([]);
  const offlineScope = useMemo(() => ({ userId: userId || 'anonymous', tripId: tripId || '' }), [tripId, userId]);

  const refreshSyncStatus = useCallback(async (scope = offlineScope) => {
    const [pending, conflicts] = await Promise.all([
      offlineStore.listMutations(scope, 'pending'),
      offlineSyncService.listConflicts(scope),
    ]);
    setPendingSyncCount(pending.length);
    setSyncConflicts(conflicts);
  }, [offlineScope]);

  const reload = useCallback(async () => {
    if (!tripId) return;
    setLoading(true); setError('');
    try {
      const auth = await supabase.auth.getSession().then(({ data }) => data.session?.user ?? null).catch(() => null);
      const scope = { userId: auth?.id ?? 'anonymous', tripId };
      const options = { offlineScope: scope };
      const [tripData, memberData, itemData, expenseData, voucherData, profileData] = await Promise.all([
        getTrip(tripId, options),
        listTripMembers(tripId, options),
        listItineraryItems(tripId, options),
        listExpenses(tripId, options),
        listVouchers(tripId).catch(() => null),
        getCurrentProfile().catch(() => null),
      ]);
      const cached = await offlineStore.getSnapshot(scope);
      const resolvedVouchers = voucherData ?? cached?.vouchers ?? [];
      const memberProfile = auth?.id ? memberData.find((member) => member.user_id === auth.id)?.profile : null;
      const resolvedProfile = profileData ?? (memberProfile ? { id: auth?.id ?? '', display_name: memberProfile.display_name, full_name: memberProfile.full_name, email: memberProfile.email, avatar_url: memberProfile.avatar_url, updated_at: new Date().toISOString() } : null);
      const resolvedMembers = resolvedProfile ? memberData.map((member) => member.user_id === resolvedProfile.id ? { ...member, profile: { ...member.profile, display_name: resolvedProfile.display_name, full_name: resolvedProfile.full_name, email: resolvedProfile.email, avatar_url: resolvedProfile.avatar_url } } : member) : memberData;
      setUserId(auth?.id ?? ''); setProfile(resolvedProfile); setTrip(tripData); setMembers(resolvedMembers); setItems(itemData); setExpenses(expenseData); setVouchers(resolvedVouchers as Voucher[]);
      await offlineStore.putSnapshot(scope, {
        trip: tripData,
        members: resolvedMembers,
        itineraryItems: itemData,
        expenses: expenseData,
        packingItems: cached?.packingItems ?? [],
        vouchers: resolvedVouchers,
        savedAt: new Date().toISOString(),
      });
      await refreshSyncStatus(scope);
    } catch (cause: any) {
      console.error('[TripDetail] load failed', cause);
      setError(cause?.message ?? '無法載入行程資料。');
    } finally {
      setLoading(false);
    }
  }, [refreshSyncStatus, tripId]);

  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => {
    let active = true;
    void exchangeRateService.getSnapshot().then((snapshot) => { if (active) setRateSnapshot(snapshot); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    const updateOnlineState = () => setIsOffline(!navigator.onLine);
    const handleOnline = () => { updateOnlineState(); void offlineSyncService.sync(offlineScope).then(() => refreshSyncStatus()).then(() => reload()); };
    updateOnlineState(); window.addEventListener('online', handleOnline); window.addEventListener('offline', updateOnlineState);
    return () => { window.removeEventListener('online', handleOnline); window.removeEventListener('offline', updateOnlineState); };
  }, [offlineScope, refreshSyncStatus, reload]);

  const saveItem = useCallback((input: ItineraryItemSaveInput) => saveItineraryItem(input, { offlineScope }), [offlineScope]);
  const removeItem = useCallback((id: string) => deleteItineraryItem(id, { offlineScope }), [offlineScope]);
  const saveOrder = useCallback((order: { id: string; position: number }[]) => updateItineraryItemsOrder(order, { offlineScope }), [offlineScope]);
  const removeExpense = useCallback((id: string) => deleteExpense(id, { offlineScope }), [offlineScope]);
  const saveExpenseRecord = useCallback((expense: Partial<Expense> & { trip_id: string; payer_id: string }, splits: Omit<ExpenseSplit, 'expense_id'>[]) => saveExpense(expense, splits, { offlineScope }), [offlineScope]);

  const reorderItems = useCallback(async (order: { id: string; position: number }[]) => {
    const previous = items;
    const positions = new Map(order.map((entry) => [entry.id, entry.position]));
    setItems((current) => current.map((item) => positions.has(item.id) ? { ...item, position: positions.get(item.id)! } : item));
    try { await saveOrder(order); } catch (cause) { setItems(previous); throw cause; }
  }, [items, saveOrder]);

  const saveTripSettings = useCallback(async (changes: Parameters<typeof updateTrip>[1]) => {
    if (!trip) throw new Error('找不到此行程。');
    const updated = await updateTrip(trip.id, changes, { offlineScope });
    setTrip(updated);
    return updated;
  }, [offlineScope, trip]);

  const lockRate = useCallback(async (currency: string, rate: number) => {
    setRateSnapshot(await exchangeRateService.setManualRate(currency, rate));
  }, []);
  const saveProfile = useCallback(async (input: Pick<Profile, 'display_name' | 'avatar_url'>) => {
    const updated = await updateCurrentProfile(input);
    setProfile(updated);
    setMembers((current) => current.map((member) => member.user_id === updated.id ? { ...member, profile: { ...member.profile, display_name: updated.display_name, full_name: updated.full_name, email: updated.email, avatar_url: updated.avatar_url } } : member));
    return updated;
  }, []);
  const resolveConflict = useCallback(async (id: string, resolution: 'keep-local' | 'use-remote') => {
    await offlineSyncService.resolveConflict(id, resolution);
    await refreshSyncStatus();
    if (resolution === 'use-remote') await reload();
  }, [refreshSyncStatus, reload]);

  return {
    trip, setTrip, members, setMembers, items, setItems, expenses, setExpenses, vouchers, setVouchers, profile, setProfile, userId,
    rateSnapshot, loading, error, isOffline, pendingSyncCount, syncConflicts, offlineScope,
    reload, resolveConflict, saveItem, removeItem, reorderItems, removeExpense, saveExpenseRecord, saveTripSettings, lockRate, saveProfile,
  };
}

export type TripDetailData = ReturnType<typeof useTripDetailData>;
export { calculateBalances };
