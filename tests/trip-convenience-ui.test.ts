import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { harness, nodes, press, text } from './helpers/interaction-harness';
import type { ItineraryItem } from '../lib/itinerary';
import type { Voucher } from '../lib/vouchers';
const mocks = vi.hoisted(() => ({ packing: vi.fn(), get: vi.fn(), set: vi.fn(), cloud: vi.fn(), pin: vi.fn(), open: vi.fn(), share: vi.fn() }));
vi.mock('react', async (original) => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (...args: Parameters<typeof React.useState>) => a.default.useState(...args), useRef: (v: unknown) => a.default.useRef(v), useMemo: (...args: Parameters<typeof React.useMemo>) => a.default.useMemo(...args), useEffect: (...args: Parameters<typeof React.useEffect>) => a.default.useEffect(...args) }; });
vi.mock('react-native', () => ({ View: 'div', Text: 'span', Modal: 'dialog', ScrollView: 'section', Pressable: 'button', Linking: { openURL: mocks.open }, Share: { share: mocks.share }, Platform: { OS: 'web' }, StyleSheet: { create: (v: unknown) => v } }));
vi.mock('@/lib/packing-api', () => ({ listPackingItems: mocks.packing }));
vi.mock('@/lib/packing-utils', async () => import('../lib/packing-utils'));
vi.mock('@/lib/voucher-files', async () => import('../lib/voucher-files'));
vi.mock('@/lib/trip-preparation', async () => import('../lib/trip-preparation'));
vi.mock('@/lib/trip-shortcuts', async () => ({ ...await import('../lib/trip-shortcuts'), shortcutPreferences: { getItem: mocks.get, setItem: mocks.set } }));
vi.mock('@/lib/trip-shortcuts-api', () => ({ listTripInfoPins: mocks.cloud, setTripInfoPin: mocks.pin }));
vi.mock('@/lib/map-links', async () => import('../lib/map-links'));
vi.mock('@/lib/share-actions', async () => import('../lib/share-actions'));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
vi.mock('@/lib/time-context', async () => import('../lib/time-context'));
import { TripPreparationOverview } from '../src/components/trip-detail/TripPreparationOverview';
import { TripInfoShortcuts } from '../src/components/trip-detail/TripInfoShortcuts';
import { TripGettingStarted } from '../src/components/trip-detail/TripGettingStarted';
const item = { id: 'one', trip_id: 'trip', day_number: 1, location_name: '集合地點', time: '09:00', address: '大阪難波站', notes: '不分享的密碼' } as ItineraryItem;
describe('preparation overview', () => {
  it('shows accurate device-only status and links to packing and the uncached ticket', async () => {
    mocks.packing.mockResolvedValue([{ id: 'p', is_checked: true }, { id: 'q', is_checked: false }]);
    const voucher = { id: 'v', trip_id: 'trip', file_path: 'file' } as Voucher;
    const onPacking = vi.fn(), onVoucher = vi.fn();
    const fileStore = { has: async () => false, read: vi.fn(), write: vi.fn() };
    const h = harness(() => TripPreparationOverview({ tripId: 'trip', userId: 'user', vouchers: [voucher], onPacking, onVoucher, onDocuments: vi.fn(), fileStore }));
    h.render(); await vi.waitFor(() => expect(text(h.render())).toContain('1 / 2'));
    press(h.render(), '展開行前準備'); let tree = h.render();
    expect(text(tree)).toContain('尚有 1 張未離線');
    press(tree, '前往打包清單'); press(tree, '處理未離線票券');
    expect(onPacking).toHaveBeenCalledOnce(); expect(onVoucher).toHaveBeenCalledWith(voucher); h.unmount();
  });
  it('does not report complete when storage or packing reads fail', async () => {
    mocks.packing.mockRejectedValue(new Error('denied'));
    const fileStore = { has: async () => { throw new Error('denied'); }, read: vi.fn(), write: vi.fn() };
    const h = harness(() => TripPreparationOverview({ tripId: 'trip', userId: 'user', vouchers: [{ id: 'v', trip_id: 'trip' } as Voucher], onPacking: vi.fn(), onVoucher: vi.fn(), onDocuments: vi.fn(), fileStore }));
    h.render(); await vi.waitFor(() => expect(text(h.render())).toContain('無法確認'));
    expect(text(h.render())).not.toContain('全部已離線'); h.unmount();
  });
  it('ignores late packing responses from another trip', async () => {
    let finish!: (v: unknown[]) => void;
    mocks.packing.mockImplementation((trip: string) => trip === 'old' ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve([]));
    let tripId = 'old';
    const fileStore = { has: async () => false, read: vi.fn(), write: vi.fn() };
    const h = harness(() => TripPreparationOverview({ tripId, userId: 'user', vouchers: [], fileStore, onPacking: vi.fn(), onVoucher: vi.fn(), onDocuments: vi.fn() }));
    h.render(); tripId = 'new'; h.render();
    await vi.waitFor(() => expect(text(h.render())).toContain('尚未建立打包清單'));
    finish([{ is_checked: true }]); await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(text(h.render())).toContain('尚未建立打包清單'); expect(text(h.render())).not.toContain('1 / 1'); h.unmount();
  });
});
describe('important information', () => {
  it('opens important details on an explicit shortcut request without reloading shared pins', async () => {
    mocks.get.mockResolvedValue('[]'); mocks.cloud.mockResolvedValue([{ id: 'one', kind: 'hotel' }]); mocks.set.mockResolvedValue(undefined);
    let expandRequest = 0;
    const h = harness(() => TripInfoShortcuts({ tripId: 'trip', userId: 'user', items: [item], expandRequest })); h.render();
    await vi.waitFor(() => expect(text(h.render())).toContain('1 筆行程共用釘選'));
    expect(nodes(h.render()).some(n => n.props.accessibilityLabel === '導航 集合地點')).toBe(false);
    const reads = mocks.cloud.mock.calls.length; expandRequest++; h.render();
    expect(nodes(h.render()).some(n => n.props.accessibilityLabel === '導航 集合地點')).toBe(true); expect(mocks.cloud).toHaveBeenCalledTimes(reads);
    h.unmount();
  });
  it('pins an explicit selection, copies and navigates using the same latest record', async () => {
    mocks.get.mockResolvedValue('[]'); mocks.set.mockResolvedValue(undefined);
    let cloud: unknown[] = [];
    mocks.cloud.mockImplementation(async () => cloud);
    mocks.pin.mockImplementation(async (_trip, pin, selected) => { cloud = selected ? [pin] : []; });
    const copy = vi.fn(async (_value: string) => undefined); vi.stubGlobal('navigator', { clipboard: { writeText: copy } });
    const h = harness(() => TripInfoShortcuts({ tripId: 'trip', userId: 'user', items: [item] }));
    h.render(); await vi.waitFor(() => expect(nodes(h.render()).find((n) => n.props.accessibilityLabel === '設定重要資訊')?.props.disabled).toBe(false));
    press(h.render(), '設定重要資訊'); press(h.render(), '選擇集合'); press(h.render(), '釘選 集合地點');
    await vi.waitFor(() => expect(text(h.render())).toContain('已同步快捷資訊'));
    press(h.render(), '展開重要資訊'); const tree = h.render();
    press(tree, '複製 集合地點'); await vi.waitFor(() => expect(copy).toHaveBeenCalledOnce());
    expect(copy.mock.calls[0][0]).not.toContain('密碼');
    press(tree, '導航 集合地點'); expect(mocks.open).toHaveBeenCalledWith(expect.stringContaining('destination='));
    expect(mocks.pin).toHaveBeenCalledWith('trip', { id: 'one', kind: 'meeting' }, true); h.unmount(); vi.unstubAllGlobals();
    // A different browser, with no local preferences, reads the same cloud selection.
    mocks.get.mockResolvedValue(null);
    const mobile = harness(() => TripInfoShortcuts({ tripId: 'trip', userId: 'user', items: [item] }));
    mobile.render(); await vi.waitFor(() => expect(text(mobile.render())).toContain('1 筆行程共用釘選'));
    press(mobile.render(), '展開重要資訊');
    expect(nodes(mobile.render()).some((n) => n.props.accessibilityLabel === '導航 集合地點')).toBe(true);
    mobile.unmount();
  });
  it('reports failed preference saves without falsely pinning an item', async () => {
    mocks.get.mockResolvedValue('[]'); mocks.set.mockRejectedValue(new Error('quota'));
    mocks.cloud.mockResolvedValue([]); mocks.pin.mockRejectedValue(new Error('offline'));
    const h = harness(() => TripInfoShortcuts({ tripId: 'trip', userId: 'user', items: [item] }));
    h.render(); await vi.waitFor(() => expect(nodes(h.render()).find((n) => n.props.accessibilityLabel === '設定重要資訊')?.props.disabled).toBe(false));
    press(h.render(), '設定重要資訊'); press(h.render(), '釘選 集合地點');
    await vi.waitFor(() => expect(text(h.render())).toContain('無法儲存'));
    expect(nodes(h.render()).some((n) => n.props.accessibilityLabel === '導航 集合地點')).toBe(false); h.unmount();
  });
  it('never reuses another account’s late-loaded pins', async () => {
    let finish!: (v: { id: string; kind: string }[]) => void;
    mocks.get.mockResolvedValue('[]');
    mocks.cloud.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; })).mockResolvedValue([]);
    let userId = 'old-user';
    const h = harness(() => TripInfoShortcuts({ tripId: 'trip', userId, items: [item] }));
    h.render(); userId = 'new-user'; h.render();
    await vi.waitFor(() => expect(nodes(h.render()).find((n) => n.props.accessibilityLabel === '設定重要資訊')?.props.disabled).toBe(false));
    finish([{ id: 'one', kind: 'meeting' }]); await Promise.resolve(); await Promise.resolve();
    press(h.render(), '展開重要資訊'); expect(nodes(h.render()).some((n) => n.props.accessibilityLabel === '導航 集合地點')).toBe(false); h.unmount();
  });
  it('does not let deleted pins permanently exhaust the twelve-pin limit', async () => {
    mocks.get.mockResolvedValue(JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ id: `deleted-${i}`, kind: 'hotel' }))));
    mocks.set.mockResolvedValue(undefined);
    mocks.cloud.mockResolvedValue([]); mocks.pin.mockResolvedValue(undefined);
    const h = harness(() => TripInfoShortcuts({ tripId: 'trip', userId: 'user', items: [item] })); h.render();
    await vi.waitFor(() => expect(nodes(h.render()).find((n) => n.props.accessibilityLabel === '設定重要資訊')?.props.disabled).toBe(false));
    press(h.render(), '設定重要資訊'); press(h.render(), '釘選 集合地點');
    await vi.waitFor(() => expect(mocks.pin).toHaveBeenCalledWith('trip', { id: 'one', kind: 'hotel' }, true));
    h.unmount();
  });
  it('imports old device pins explicitly and only clears them after cloud success', async () => {
    mocks.get.mockResolvedValue(JSON.stringify([{ id: 'one', kind: 'meeting' }]));
    mocks.cloud.mockResolvedValue([]); mocks.pin.mockResolvedValue(undefined); mocks.set.mockResolvedValue(undefined);
    const h = harness(() => TripInfoShortcuts({ tripId: 'trip', userId: 'user', items: [item] })); h.render();
    await vi.waitFor(() => expect(nodes(h.render()).find((n) => n.props.accessibilityLabel === '匯入本機釘選至雲端')?.props.disabled).toBe(false));
    expect(mocks.pin).not.toHaveBeenCalled();
    press(h.render(), '匯入本機釘選至雲端');
    await vi.waitFor(() => expect(text(h.render())).toContain('已將此裝置原有釘選同步至行程'));
    expect(mocks.pin).toHaveBeenCalledWith('trip', { id: 'one', kind: 'meeting' }, true);
    expect(mocks.set).toHaveBeenCalledWith('travel-planner-offline:shortcuts:v1:user:trip', '[]'); h.unmount();
  });
  it('keeps offline lodging readable but never reports cache as cloud-synced', async () => {
    mocks.get.mockResolvedValue(JSON.stringify([{ id: 'one', kind: 'hotel' }]));
    mocks.cloud.mockRejectedValue(new Error('離線'));
    const h = harness(() => TripInfoShortcuts({ tripId: 'trip', userId: 'user', items: [item] })); h.render();
    await vi.waitFor(() => expect(text(h.render())).toContain('顯示此裝置快取，尚未同步'));
    press(h.render(), '展開重要資訊');
    expect(nodes(h.render()).some((n) => n.props.accessibilityLabel === '複製 集合地點')).toBe(true);
    expect(nodes(h.render()).find((n) => n.props.accessibilityLabel === '設定重要資訊')?.props.disabled).toBe(true);
    expect(mocks.pin).not.toHaveBeenCalled(); h.unmount();
  });
  it('does not clear old device pins if importing to Supabase fails', async () => {
    mocks.get.mockResolvedValue(JSON.stringify([{ id: 'one', kind: 'meeting' }]));
    mocks.cloud.mockResolvedValue([]); mocks.set.mockResolvedValue(undefined); mocks.pin.mockRejectedValue(new Error('permission denied'));
    const h = harness(() => TripInfoShortcuts({ tripId: 'trip', userId: 'user', items: [item] })); h.render();
    await vi.waitFor(() => expect(nodes(h.render()).find((n) => n.props.accessibilityLabel === '匯入本機釘選至雲端')?.props.disabled).toBe(false));
    press(h.render(), '匯入本機釘選至雲端');
    await vi.waitFor(() => expect(text(h.render())).toContain('permission denied'));
    expect(mocks.set).not.toHaveBeenCalledWith('travel-planner-offline:shortcuts:v1:user:trip', '[]'); h.unmount();
  });
  it('refreshes shared pins on a cloud revision without closing the expanded section', async () => {
    mocks.get.mockResolvedValue('[]'); mocks.cloud.mockResolvedValue([]); mocks.set.mockResolvedValue(undefined);
    let refreshToken = 0;
    const h = harness(() => TripInfoShortcuts({ tripId: 'trip', userId: 'user', items: [item], refreshToken, canEdit: false })); h.render();
    await vi.waitFor(() => expect(mocks.cloud).toHaveBeenCalledOnce());
    press(h.render(), '展開重要資訊');
    mocks.cloud.mockResolvedValue([{ id: 'one', kind: 'hotel' }]); refreshToken++; h.render();
    await vi.waitFor(() => expect(nodes(h.render()).some((n) => n.props.accessibilityLabel === '導航 集合地點')).toBe(true));
    expect(nodes(h.render()).find((n) => n.props.accessibilityLabel === '設定重要資訊')?.props.disabled).toBe(true);
    h.unmount();
  });
});
describe('getting started', () => {
  it('offers three working existing entry points only for an empty itinerary', () => {
    const onAdd = vi.fn(), onImport = vi.fn(), onInvite = vi.fn();
    const tree = TripGettingStarted({ isTripEmpty: true, isDayEmpty: true, day: 1, onAdd, onImport, onInvite });
    press(tree, '新增第一站'); press(tree, '匯入行程'); press(tree, '邀請旅伴');
    expect(onAdd).toHaveBeenCalledOnce(); expect(onImport).toHaveBeenCalledOnce(); expect(onInvite).toHaveBeenCalledOnce();
    expect(TripGettingStarted({ isTripEmpty: false, isDayEmpty: false, day: 1, onAdd, onImport, onInvite })).toBeNull();
  });
  it('keeps an empty-day entry focused on adding, without showing first-trip onboarding', () => {
    const onAdd = vi.fn();
    const tree = TripGettingStarted({ isTripEmpty: false, isDayEmpty: true, day: 3, onAdd, onImport: vi.fn(), onInvite: vi.fn() });
    press(tree, '新增當日景點'); expect(onAdd).toHaveBeenCalledOnce();
    expect(nodes(tree).some((n) => n.props.accessibilityLabel === '匯入行程')).toBe(false);
    expect(nodes(tree).some((n) => n.props.accessibilityLabel === '邀請旅伴')).toBe(false);
  });
});
