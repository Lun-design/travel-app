import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { getTrip, listTripMembers, updateTrip, type Trip, type TripMemberWithProfile } from '@/lib/trips';
import { deleteItineraryItem, listItineraryItems, moveItineraryItemToDay, saveItineraryItem, updateItineraryItemsOrder, updateItineraryItemsSchedule } from '@/lib/itinerary-api';
import type { ItineraryItem, ItineraryItemSaveInput } from '@/lib/itinerary';
import { applyItineraryOrder, sanitizeLoadedItineraryItems, sortItineraryItemsByStartTime } from '@/lib/itinerary';
import { calculateBalances, deleteExpense, listExpenses, saveExpense, type Expense, type ExpenseSplit } from '@/lib/expenses-api';
import { exchangeRateService, getDefaultExchangeRateSnapshot, type ExchangeRateSnapshot } from '@/lib/exchange-rates';
import { listVouchers } from '@/lib/vouchers-api';
import type { Voucher } from '@/lib/vouchers';
import { listTripPlaces, type TripPlace } from '@/lib/trip-places-api';
import { getCurrentProfile, getProfileDisplayName, updateCurrentProfile, type Profile } from '@/lib/profiles';
import { offlineStore, type OfflineMutation } from '@/lib/offline-store';
import { offlineSyncService } from '@/lib/offline-replay';
import { applyRealtimeChange, isOlderRealtimeChange, subscribeToTripRealtime, type RealtimeChange, type RealtimeClientLike } from '@/lib/realtime-collaboration';
import { moveItineraryItemAcrossDays } from '@/lib/itinerary-move';
import { useUndoPreview } from './useUndoPreview';
import { describeCollaborativeUpdate } from '@/lib/travel-ux';

export function useTripDetailData(tripId: string | undefined) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<TripMemberWithProfile[]>([]);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [places, setPlaces] = useState<TripPlace[]>([]);
  const [profile, setProfileState] = useState<Profile | null>(null);
  const profileRef = useRef<Profile | null>(null), profileSaveVersion = useRef(0);
  const setProfile = useCallback((update: Profile | null | ((previous: Profile | null) => Profile | null)) => {
    const next = typeof update === 'function' ? update(profileRef.current) : update;
    profileSaveVersion.current++;
    profileRef.current = next; setProfileState(next);
  }, []);
  const [userId, setUserId] = useState('');
  const [rateSnapshot, setRateSnapshot] = useState<ExchangeRateSnapshot>(() => getDefaultExchangeRateSnapshot());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isOffline, setIsOffline] = useState(false);
  const [pendingSyncCount, setPendingSyncCount] = useState(0);
  const [syncingCount, setSyncingCount] = useState(0);
  const [syncError, setSyncError] = useState('');
  const failedMutationRef = useRef<(() => Promise<unknown>) | null>(null);
  const retrySyncBusyRef = useRef(false);
  const [syncConflicts, setSyncConflicts] = useState<OfflineMutation[]>([]);
  const [realtimeNotice, setRealtimeNotice] = useState('');
  const [packingRevision, setPackingRevision] = useState(0);
  const [shortcutRevision, setShortcutRevision] = useState(0);
  const reloadRequestRef = useRef(0);
  const currentUserIdRef = useRef('');
  const realtimeNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineScope = useMemo(() => ({ userId: userId || 'anonymous', tripId: tripId || '' }), [tripId, userId]);
  const reportSyncError = useCallback((cause: unknown) => {
    const message = cause && typeof cause === 'object' && 'message' in cause ? cause.message : null;
    setSyncError(typeof message === 'string' && message.trim() ? message : '儲存失敗，請重試。');
  }, []);
  const undoPreview = useUndoPreview(tripId ?? '', items, reportSyncError);

  const refreshSyncStatus = useCallback(async (scope = offlineScope) => {
    const [pending, conflicts] = await Promise.all([
      offlineStore.listMutations(scope, 'pending'),
      offlineSyncService.listConflicts(scope),
    ]);
    setPendingSyncCount(pending.length);
    setSyncConflicts(conflicts);
  }, [offlineScope]);

  const trackMutation = useCallback(async <T,>(task: () => Promise<T>): Promise<T> => {
    setSyncingCount((count) => count + 1);
    setSyncError('');
    try {
      const result = await task();
      await refreshSyncStatus().catch(reportSyncError);
      failedMutationRef.current = null;
      return result;
    } catch (cause) {
      failedMutationRef.current = task;
      reportSyncError(cause);
      throw cause;
    } finally {
      setSyncingCount((count) => Math.max(0, count - 1));
    }
  }, [refreshSyncStatus, reportSyncError]);

  const reload = useCallback(async () => {
    if (!tripId) return;
    const requestId = ++reloadRequestRef.current;
    const profileVersionAtStart = profileSaveVersion.current;
    setLoading(true); setError('');
    try {
      const auth = await supabase.auth.getSession().then(({ data }) => data.session?.user ?? null).catch(() => null);
      const scope = { userId: auth?.id ?? 'anonymous', tripId };
      const options = { offlineScope: scope };
      const [tripData, memberData, itemData, expenseData, voucherData, profileData, placeData] = await Promise.all([
        getTrip(tripId, options),
        listTripMembers(tripId, options),
        listItineraryItems(tripId, options),
        listExpenses(tripId, options),
        listVouchers(tripId).catch(() => null),
        getCurrentProfile().catch(() => null),
        listTripPlaces(tripId).catch(() => null),
      ]);
      if (requestId !== reloadRequestRef.current) {
        return;
      }
      const cached = await offlineStore.getSnapshot(scope);
      if (requestId !== reloadRequestRef.current) return;
      const resolvedVouchers = voucherData ?? cached?.vouchers ?? [];
      const resolvedPlaces = placeData ?? (cached?.tripPlaces as TripPlace[] | undefined) ?? [];
      const memberProfile = auth?.id ? memberData.find((member) => member.user_id === auth.id)?.profile : null;
      // Member metadata has no authoritative version; a synthetic "now" would
      // incorrectly outrank a later successful profiles read forever.
      const loadedProfile = profileData ?? (memberProfile ? { id: auth?.id ?? '', display_name: memberProfile.display_name, full_name: memberProfile.full_name, email: memberProfile.email, avatar_url: memberProfile.avatar_url, updated_at: '' } : null);
      const localProfile = profileRef.current?.id === auth?.id ? profileRef.current : null;
      const resolvedProfile = localProfile && (!profileData || profileVersionAtStart !== profileSaveVersion.current || isOlderRealtimeChange(localProfile.updated_at, profileData.updated_at)) ? localProfile : loadedProfile;
      const resolvedMembers = resolvedProfile ? memberData.map((member) => member.user_id === resolvedProfile.id ? { ...member, profile: { ...member.profile, display_name: resolvedProfile.display_name, full_name: resolvedProfile.full_name, email: resolvedProfile.email, avatar_url: resolvedProfile.avatar_url } } : member) : memberData;
      const cleanedItemData = sanitizeLoadedItineraryItems(itemData);
      currentUserIdRef.current = auth?.id ?? '';
      profileRef.current = resolvedProfile;
      setUserId(auth?.id ?? ''); setProfileState(resolvedProfile); setTrip(tripData); setMembers(resolvedMembers); setItems(sortItineraryItemsByStartTime(cleanedItemData)); setExpenses(expenseData); setVouchers(resolvedVouchers as Voucher[]); setPlaces(resolvedPlaces);
      setShortcutRevision((value) => value + 1);
      await offlineStore.putSnapshot(scope, {
        trip: tripData,
        members: resolvedMembers,
        itineraryItems: cleanedItemData,
        expenses: expenseData,
        packingItems: cached?.packingItems ?? [],
        vouchers: resolvedVouchers,
        tripPlaces: resolvedPlaces,
        savedAt: new Date().toISOString(),
      });
      if (requestId !== reloadRequestRef.current) return;
      await refreshSyncStatus(scope);
    } catch (cause: any) {
      if (requestId !== reloadRequestRef.current) return;
      console.error('[TripDetail] load failed', cause);
      setError(cause?.message ?? '無法載入行程資料。');
    } finally {
      if (requestId === reloadRequestRef.current) setLoading(false);
    }
  }, [refreshSyncStatus, tripId]);

  const reloadPlaces = useCallback(async () => {
    if (!tripId) return;
    const loaded = await listTripPlaces(tripId);
    setPlaces(loaded);
    const snapshot = await offlineStore.getSnapshot(offlineScope);
    await offlineStore.putSnapshot(offlineScope, {
      trip: snapshot?.trip ?? null,
      members: snapshot?.members ?? [],
      itineraryItems: snapshot?.itineraryItems ?? [],
      packingItems: snapshot?.packingItems ?? [],
      expenses: snapshot?.expenses ?? [],
      vouchers: snapshot?.vouchers ?? [],
      tripPlaces: loaded,
      savedAt: new Date().toISOString(),
    });
  }, [offlineScope, tripId]);

  useEffect(() => () => { reloadRequestRef.current++; }, [tripId]);
  useEffect(() => { void reload(); }, [reload]);
  useEffect(() => () => {
    if (realtimeNoticeTimerRef.current) clearTimeout(realtimeNoticeTimerRef.current);
  }, []);
  useEffect(() => {
    let active = true;
    void exchangeRateService.getSnapshot().then((snapshot) => { if (active) setRateSnapshot(snapshot); });
    return () => { active = false; };
  }, []);
  const catchUpRef = useRef({ reload, trackMutation, refreshSyncStatus, syncingCount, undoPending: undoPreview.pending });
  catchUpRef.current = { reload, trackMutation, refreshSyncStatus, syncingCount, undoPending: undoPreview.pending };
  useEffect(() => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') return;
    let active = true, inFlight = false;
    const updateOnlineState = () => setIsOffline(!navigator.onLine);
    async function catchUp(refresh: boolean) {
      updateOnlineState();
      if (!active || inFlight || !navigator.onLine || !userId || catchUpRef.current.syncingCount || catchUpRef.current.undoPending) return;
      inFlight = true;
      try {
        const pending = await offlineStore.listMutations(offlineScope, 'pending');
        if (!active) return;
        // Replay before reading cloud rows, otherwise unsent local edits can disappear.
        if (pending.length) await catchUpRef.current.trackMutation(() => offlineSyncService.sync(offlineScope));
        if (active && (refresh || pending.length)) await catchUpRef.current.reload();
      } catch (cause) { if (active) reportSyncError(cause); }
      finally { inFlight = false; }
    }
    const resume = () => { if (typeof document === 'undefined' || document.visibilityState !== 'hidden') void catchUp(true); };
    const visibility = () => { if (document.visibilityState === 'visible') resume(); };
    updateOnlineState();
    // Opening an already-online browser must not strand last session's offline queue.
    void catchUp(false);
    window.addEventListener('online', resume); window.addEventListener('offline', updateOnlineState);
    window.addEventListener('focus', resume); window.addEventListener('pageshow', resume);
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', visibility);
    return () => {
      active = false;
      window.removeEventListener('online', resume); window.removeEventListener('offline', updateOnlineState);
      window.removeEventListener('focus', resume); window.removeEventListener('pageshow', resume);
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', visibility);
    };
  }, [offlineScope, userId, reportSyncError]);

  const showRealtimeNotice = useCallback((notice = '行程已由隊友更新') => {
    setRealtimeNotice(notice);
    if (realtimeNoticeTimerRef.current) clearTimeout(realtimeNoticeTimerRef.current);
    realtimeNoticeTimerRef.current = setTimeout(() => setRealtimeNotice(''), 5000);
  }, []);

  const refreshRealtimeExpenses = useCallback(async () => {
    if (!tripId) return;
    try {
      const refreshed = await listExpenses(tripId, { offlineScope });
      setExpenses(refreshed);
    } catch (cause) {
      console.error('[TripDetail] realtime expense refresh failed', cause);
    }
  }, [offlineScope, tripId]);

  const handleRealtimeChange = useCallback((change: RealtimeChange) => {
    const actor = change.record.updated_by ?? change.oldRecord.updated_by;
    if (actor && actor !== currentUserIdRef.current) {
      const member = members.find((member) => member.user_id === actor);
      showRealtimeNotice(describeCollaborativeUpdate(change, getProfileDisplayName(member?.profile, '旅伴')));
    }

    if (change.table === 'itinerary_items') {
      setItems((current) => sortItineraryItemsByStartTime(sanitizeLoadedItineraryItems(applyRealtimeChange(current, change))));
    } else if (change.table === 'trip_places') {
      setPlaces((current) => applyRealtimeChange(current, change));
    } else if (change.table === 'expenses') {
      void refreshRealtimeExpenses();
    } else if (change.table === 'packing_items') {
      setPackingRevision((current) => current + 1);
    } else if (change.table === 'vouchers') {
      setVouchers((current) => applyRealtimeChange(current, change));
    } else if (change.table === 'trip_info_pins') {
      setShortcutRevision((current) => current + 1);
    }
  }, [members, refreshRealtimeExpenses, showRealtimeNotice]);

  const realtimeHandlerRef = useRef(handleRealtimeChange);
  realtimeHandlerRef.current = handleRealtimeChange;
  useEffect(() => {
    if (!tripId) return;
    return subscribeToTripRealtime(supabase as unknown as RealtimeClientLike, tripId, (change) => realtimeHandlerRef.current(change));
  }, [tripId]);

  const saveItem = useCallback(async (input: ItineraryItemSaveInput) => {
    await undoPreview.flush();
    return trackMutation(() => saveItineraryItem(input, { offlineScope }));
  }, [offlineScope, trackMutation, undoPreview.flush]);
  const removeItem = useCallback(async (id: string) => {
    const target = undoPreview.items.find((item) => item.id === id);
    if (!target) return;
    const apply = (current: ItineraryItem[]) => current.filter((item) => item.id !== id);
    await undoPreview.stage({ key: `delete:${id}`, label: `已刪除「${target.location_name}」`, apply, returnDay: target.day_number,
      commit: () => trackMutation(async () => { await deleteItineraryItem(id, { offlineScope }); setItems(apply); }),
    });
  }, [offlineScope, trackMutation, undoPreview.items, undoPreview.stage]);
  const saveOrder = useCallback((order: { id: string; position: number }[]) => updateItineraryItemsOrder(order, { offlineScope }), [offlineScope]);
  const removeExpense = useCallback((id: string) => trackMutation(() => deleteExpense(id, { offlineScope })), [offlineScope, trackMutation]);
  const saveExpenseRecord = useCallback((expense: Partial<Expense> & { trip_id: string; payer_id: string }, splits: Omit<ExpenseSplit, 'expense_id'>[]) => trackMutation(() => saveExpense(expense, splits, { offlineScope })), [offlineScope, trackMutation]);

  const reorderItems = useCallback(async (order: { id: string; position: number }[]) => {
    const changes = order.map((entry) => ({ ...entry }));
    const apply = (current: ItineraryItem[]) => applyItineraryOrder(current, changes);
    await undoPreview.stage({ key: `order:${JSON.stringify(changes)}`, label: '已調整景點順序', apply,
      commit: () => trackMutation(async () => { await saveOrder(changes); setItems(apply); }),
    });
  }, [saveOrder, trackMutation, undoPreview.stage]);

  const moveItemToDay = useCallback(async (item: ItineraryItem, targetDay: number) => {
    const apply = (current: ItineraryItem[]) => moveItineraryItemAcrossDays(current, item.id, targetDay);
    await undoPreview.stage({ key: `move:${item.id}:${targetDay}`, label: `已將「${item.location_name}」移至 Day ${targetDay}`, apply, returnDay: item.day_number,
      commit: () => trackMutation(async () => { await moveItineraryItemToDay(item.id, targetDay, { offlineScope }); setItems(apply); }),
    });
  }, [offlineScope, trackMutation, undoPreview.stage]);

  const shiftSchedule = useCallback(async (changes: { id: string; time: string | null }[]) => {
    await undoPreview.flush();
    const previous = items;
    const byId = new Map(changes.map((change) => [change.id, change.time]));
    setItems((current) => sortItineraryItemsByStartTime(current.map((item) => byId.has(item.id) ? { ...item, time: byId.get(item.id) ?? null } : { ...item })));
    try {
      await trackMutation(() => updateItineraryItemsSchedule(changes, { offlineScope }));
      await reload();
    } catch (cause) {
      setItems(previous);
      throw cause;
    }
  }, [items, offlineScope, reload, trackMutation, undoPreview.flush]);

  const saveTripSettings = useCallback(async (changes: Parameters<typeof updateTrip>[1]) => {
    if (!trip) throw new Error('找不到此行程。');
    await undoPreview.flush();
    const updated = await trackMutation(() => updateTrip(trip.id, changes, { offlineScope }));
    setTrip(updated);
    return updated;
  }, [offlineScope, trip, trackMutation, undoPreview.flush]);

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

  const retrySync = useCallback(async () => {
    if (retrySyncBusyRef.current) return;
    retrySyncBusyRef.current = true;
    try {
      await undoPreview.flush();
      const failedTask = failedMutationRef.current;
      if (failedTask) await trackMutation(failedTask);
      await trackMutation(() => offlineSyncService.sync(offlineScope));
      await reload();
    } catch (cause) { reportSyncError(cause); }
    finally { retrySyncBusyRef.current = false; }
  }, [offlineScope, reload, reportSyncError, trackMutation, undoPreview.flush]);

  return {
    trip, setTrip, members, setMembers, items: undoPreview.items, setItems, expenses, setExpenses, vouchers, setVouchers, places, setPlaces, profile, setProfile, userId,
    rateSnapshot, loading, error, isOffline, pendingSyncCount, syncConflicts, realtimeNotice, packingRevision, shortcutRevision, offlineScope,
    reload, reloadPlaces, resolveConflict, saveItem, removeItem, reorderItems, moveItemToDay, shiftSchedule, removeExpense, saveExpenseRecord, saveTripSettings, lockRate, saveProfile,
    syncing: syncingCount > 0, syncError, retrySync, trackMutation,
    undoLabel: undoPreview.label, undoPending: undoPreview.pending, undoReturnDay: undoPreview.returnDay,
    undoLastAction: undoPreview.undo, flushUndo: undoPreview.flush,
  };
}

export type TripDetailData = ReturnType<typeof useTripDetailData>;
export { calculateBalances };
