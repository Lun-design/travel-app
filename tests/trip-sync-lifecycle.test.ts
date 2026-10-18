import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { harness } from './helpers/interaction-harness';
const mocks = vi.hoisted(() => ({ getTrip: vi.fn(), items: vi.fn(), vouchers: vi.fn(), sync: vi.fn(), pending: vi.fn(), subscribe: vi.fn(), reloadProfile: vi.fn(), flush: vi.fn(async () => undefined) }));
vi.mock('react', async (original) => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (...args: Parameters<typeof React.useState>) => a.default.useState(...args), useRef: (v: unknown) => a.default.useRef(v), useEffect: (...args: Parameters<typeof React.useEffect>) => a.default.useEffect(...args), useMemo: (...args: Parameters<typeof React.useMemo>) => a.default.useMemo(...args), useCallback: (...args: Parameters<typeof React.useCallback>) => a.default.useCallback(...args) }; });
vi.mock('@/lib/supabase', () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { user: { id: 'u' } } } }) } } }));
vi.mock('@/lib/trips', () => ({ getTrip: mocks.getTrip, listTripMembers: async () => [{ user_id: 'u', profile: {} }], updateTrip: vi.fn() }));
vi.mock('@/lib/itinerary-api', () => ({ listItineraryItems: mocks.items, deleteItineraryItem: vi.fn(), moveItineraryItemToDay: vi.fn(), saveItineraryItem: vi.fn(), updateItineraryItemsOrder: vi.fn(), updateItineraryItemsSchedule: vi.fn() }));
vi.mock('@/lib/itinerary', async () => import('../lib/itinerary'));
vi.mock('@/lib/expenses-api', () => ({ calculateBalances: vi.fn(), deleteExpense: vi.fn(), listExpenses: async () => [], saveExpense: vi.fn() }));
vi.mock('@/lib/exchange-rates', () => ({ exchangeRateService: { getSnapshot: async () => ({ rates: {} }) }, getDefaultExchangeRateSnapshot: () => ({ rates: {} }) }));
vi.mock('@/lib/vouchers-api', () => ({ listVouchers: mocks.vouchers }));
vi.mock('@/lib/trip-places-api', () => ({ listTripPlaces: async () => [] }));
vi.mock('@/lib/profiles', () => ({ getCurrentProfile: mocks.reloadProfile, getProfileDisplayName: () => '旅伴', updateCurrentProfile: vi.fn() }));
vi.mock('@/lib/offline-store', () => ({ offlineStore: { getSnapshot: async () => null, putSnapshot: async () => undefined, listMutations: mocks.pending } }));
vi.mock('@/lib/offline-replay', () => ({ offlineSyncService: { sync: mocks.sync, listConflicts: async () => [] } }));
vi.mock('@/lib/realtime-collaboration', async () => ({ ...await import('../lib/realtime-collaboration'), subscribeToTripRealtime: mocks.subscribe }));
vi.mock('@/lib/itinerary-move', async () => import('../lib/itinerary-move'));
vi.mock('@/lib/travel-ux', async () => import('../lib/travel-ux'));
vi.mock('../src/hooks/useUndoPreview', () => ({ useUndoPreview: (_scope: string, items: unknown[]) => ({ items, pending: false, flush: mocks.flush, stage: vi.fn(), undo: vi.fn() }) }));
import { useTripDetailData } from '../src/hooks/useTripDetailData';
let windowEvents: EventTarget, documentEvents: EventTarget & { visibilityState: string };
beforeEach(() => {
  windowEvents = new EventTarget(); documentEvents = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('window', windowEvents); vi.stubGlobal('document', documentEvents); vi.stubGlobal('navigator', { onLine: true });
  mocks.getTrip.mockResolvedValue({ id: 't', title: '旅行', start_date: '2026-10-01', end_date: '2026-10-02' });
  mocks.items.mockResolvedValue([{ id: 'old', position: 0, time: null, location_name: '舊景點' }]);
  mocks.vouchers.mockResolvedValue([]); mocks.pending.mockResolvedValue([]); mocks.sync.mockResolvedValue(undefined); mocks.subscribe.mockReturnValue(vi.fn());
  mocks.reloadProfile.mockResolvedValue(null);
});
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe('cross-device catch-up', () => {
  it('accepts a real profile after the first read fell back to member metadata', async () => {
    let data!: ReturnType<typeof useTripDetailData>;
    const h = harness(() => { data = useTripDetailData('t'); return null; }); h.render();
    try {
      await vi.waitFor(() => { h.render(); expect(data.loading).toBe(false); expect(data.profile?.id).toBe('u'); });
      await data.reload(); h.render();
      mocks.reloadProfile.mockResolvedValue({ id: 'u', display_name: '雲端名稱', avatar_url: 'cloud.png', updated_at: '2026-10-01T00:00:00Z' });
      await data.reload(); h.render();
      expect(data.profile?.avatar_url).toBe('cloud.png');
      expect(data.profile?.display_name).toBe('雲端名稱');
    } finally { h.unmount(); }
  });
  it('does not overwrite a saved avatar with a profile read started before that save', async () => {
    const old = { id: 'u', display_name: '旅伴', avatar_url: 'old.png', updated_at: '2026-10-18T00:00:00Z' };
    const saved = { ...old, avatar_url: 'new.png', updated_at: '2026-10-18T01:00:00Z' };
    mocks.reloadProfile.mockResolvedValue(old);
    let data!: ReturnType<typeof useTripDetailData>;
    const h = harness(() => { data = useTripDetailData('t'); return null; }); h.render();
    try {
      await vi.waitFor(() => { h.render(); expect(data.loading).toBe(false); expect(data.profile?.id).toBe('u'); });
      await data.reload(); h.render();
      let finish!: (v: typeof old) => void;
      mocks.reloadProfile.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
      const inFlight = data.reload();
      await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
      data.setProfile(saved);
      finish(old); await inFlight; h.render();
      expect(data.profile?.avatar_url).toBe('new.png');
      expect(data.members.find((member) => member.user_id === 'u')?.profile?.avatar_url).toBe('new.png');
    } finally { h.unmount(); }
  });
  it('fetches cloud changes when a suspended tab becomes visible again', async () => {
    let data!: ReturnType<typeof useTripDetailData>;
    const h = harness(() => { data = useTripDetailData('t'); return null; }); h.render();
    try {
      await vi.waitFor(() => { h.render(); expect(data.userId).toBe('u'); expect(data.loading).toBe(false); });
      await data.reload(); h.render();
      const reads = mocks.items.mock.calls.length;
      mocks.items.mockResolvedValue([{ id: 'new', position: 0, time: null, location_name: '手機新增' }]);
      documentEvents.visibilityState = 'hidden'; documentEvents.dispatchEvent(new Event('visibilitychange'));
      documentEvents.visibilityState = 'visible'; documentEvents.dispatchEvent(new Event('visibilitychange')); windowEvents.dispatchEvent(new Event('focus'));
      await vi.waitFor(() => { h.render(); expect(data.items[0]?.id).toBe('new'); });
      expect(mocks.items).toHaveBeenCalledTimes(reads + 1);
    } finally { h.unmount(); }
  });
  it('replays pending edits when opening already-online, without waiting for an online event', async () => {
    mocks.pending.mockResolvedValue([{ id: 'pending' }]);
    mocks.sync.mockImplementation(async () => { mocks.pending.mockResolvedValue([]); });
    let data!: ReturnType<typeof useTripDetailData>;
    const h = harness(() => { data = useTripDetailData('t'); return null; }); h.render();
    try {
      await vi.waitFor(() => { h.render(); expect(mocks.sync).toHaveBeenCalledWith({ userId: 'u', tripId: 't' }); });
      expect(mocks.sync).toHaveBeenCalledTimes(1);
    } finally { h.unmount(); }
  });
  it('keeps the subscription mounted across a reload and applies voucher events', async () => {
    let data!: ReturnType<typeof useTripDetailData>;
    const h = harness(() => { data = useTripDetailData('t'); return null; }); h.render();
    try {
      await vi.waitFor(() => { h.render(); expect(data.userId).toBe('u'); expect(data.loading).toBe(false); });
      const subscribed = mocks.subscribe.mock.calls.length;
      await data.reload(); h.render(); expect(mocks.subscribe).toHaveBeenCalledTimes(subscribed);
      mocks.subscribe.mock.calls.at(-1)![2]({ table: 'vouchers', eventType: 'INSERT', record: { id: 'v', trip_id: 't', title: '手機票券' }, oldRecord: {} }); h.render();
      expect(data.vouchers.map((v) => v.id)).toContain('v');
    } finally { h.unmount(); }
  });
});
