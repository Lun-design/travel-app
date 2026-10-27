import React from 'react';
import { existsSync, readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { harness, nodes, press, text } from './helpers/interaction-harness';
import { getAppTheme } from '../lib/theme';
import type { Trip, TripMemberWithProfile } from '../lib/trips';
vi.mock('react', async original => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (v: unknown) => a.default.useState(v), useEffect: (...p: Parameters<typeof React.useEffect>) => a.default.useEffect(...p) }; });
const platform = vi.hoisted(() => ({ OS: 'web' }));
vi.mock('react-native', () => ({ Platform: platform, View: 'div', Text: 'span', Pressable: 'button', ScrollView: 'section', Modal: 'dialog', useColorScheme: () => 'light', StyleSheet: { create: (s: unknown) => s } }));
vi.mock('@/components/PuppyMascot', () => ({ PuppyMascot: 'mascot' }));
vi.mock('@/components/ProfileAvatar', () => ({ ProfileAvatar: 'avatar' }));
vi.mock('@/lib/profiles', () => ({ getProfileDisplayName: (p: { display_name?: string } | null, fallback: string) => p?.display_name || fallback }));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
vi.mock('@/lib/trip-dates', async () => import('../lib/trip-dates'));
import { TripDetailHeader } from '../src/components/trip-detail/TripDetailHeader';
import { DayTabs } from '../src/components/DayTabs';
const theme = getAppTheme('light');
const trip = { id: 't', title: '很長的日本旅行名稱', destination: '日本', start_date: '2026-10-23', end_date: '2026-10-28', created_by: 'u' } as Trip;
const members = ['u', 'friend'].map((id, index) => ({ user_id: id, trip_id: 't', role: index ? 'editor' : 'owner', profile: { display_name: id } })) as TripMemberWithProfile[];
let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); cleanup = undefined; platform.OS = 'web'; });
function header() {
  let props = { trip, members, userId: 'u', theme, themeMode: 'light' as const, mascotSize: 100, compact: true, insets: { top: 0, bottom: 0, left: 0, right: 0 }, onBack: vi.fn(), onSearch: vi.fn(), onShare: vi.fn(), onInvite: vi.fn(), onSettings: vi.fn(), onProfile: vi.fn(), onThemeModeChange: vi.fn() };
  const h = harness(() => TripDetailHeader(props)); cleanup = h.unmount; h.render();
  return { h, get props() { return props; }, set(next: Partial<typeof props>) { props = { ...props, ...next }; h.render(); } };
}
function named(tree: React.ReactNode, label: string) { return nodes(tree).find(n => n.props.accessibilityLabel === label); }
function merged(value: unknown): Record<string, unknown> { return Array.isArray(value) ? Object.assign({}, ...value.map(merged)) : value && typeof value === 'object' ? value as Record<string, unknown> : {}; }
describe('compact trip header', () => {
  it.each(['邀請旅伴', '分享行程', '行程設定'])('waits for iOS menu dismissal before opening %s exactly once', label => {
    platform.OS = 'ios';
    const s = header(); press(s.h.render(), '開啟行程選單'); press(s.h.render(), label);
    const callback = label === '邀請旅伴' ? s.props.onInvite : label === '分享行程' ? s.props.onShare : s.props.onSettings;
    expect(callback).not.toHaveBeenCalled();
    const modal = nodes(s.h.render()).find(n => n.props.testID === 'trip-management-menu')!;
    expect(modal.props.visible).toBe(false);
    (modal.props.onDismiss as () => void)(); (modal.props.onDismiss as () => void)();
    expect(callback).toHaveBeenCalledOnce();
  });
  it('waits for dismissal before showing iOS member details and drops pending actions across scopes', () => {
    platform.OS = 'ios'; const s = header();
    press(s.h.render(), '開啟行程選單'); press(s.h.render(), '查看friend的資料');
    expect(nodes(s.h.render()).some(n => Boolean(n.props.member))).toBe(false);
    const dismiss = nodes(s.h.render()).find(n => n.props.testID === 'trip-management-menu')!.props.onDismiss as () => void;
    dismiss(); expect(nodes(s.h.render()).some(n => Boolean(n.props.member))).toBe(true);
    press(s.h.render(), '開啟行程選單'); press(s.h.render(), '邀請旅伴');
    s.set({ trip: { ...trip, id: 'other' } }); dismiss();
    expect(s.props.onInvite).not.toHaveBeenCalled();
  });
  it('keeps back/search/title directly available without the management action rows', () => {
    const s = header(); press(s.h.render(), '返回我的行程'); press(s.h.render(), '搜尋此行程');
    expect(s.props.onBack).toHaveBeenCalledOnce(); expect(s.props.onSearch).toHaveBeenCalledOnce(); expect(text(s.h.render())).toContain(trip.title);
    expect(named(s.h.render(), '分享行程')).toBeUndefined(); expect(named(s.h.render(), '邀請旅伴')).toBeUndefined();
    expect(named(s.h.render(), '開啟行程選單')).toBeDefined();
    const title = nodes(s.h.render()).find(n => text(n) === trip.title && n.type === 'span')!; expect(title.props.numberOfLines).toBe(1);
    expect(nodes(s.h.render()).filter(n => n.type === 'mascot').every(n => Number(n.props.size) <= 44)).toBe(true);
  });
  it.each(['邀請旅伴', '分享行程', '行程設定'])('retains the original %s callback and closes the menu before it opens another modal', label => {
    const s = header(); press(s.h.render(), '開啟行程選單'); press(s.h.render(), label);
    const callback = label === '邀請旅伴' ? s.props.onInvite : label === '分享行程' ? s.props.onShare : s.props.onSettings;
    expect(callback).toHaveBeenCalledOnce(); expect(named(s.h.render(), label)).toBeUndefined();
  });
  it('does not expose owner settings to an invited member', () => {
    const s = header(); s.set({ userId: 'friend' }); press(s.h.render(), '開啟行程選單'); expect(named(s.h.render(), '行程設定')).toBeUndefined(); expect(named(s.h.render(), '分享行程')).toBeDefined();
  });
  it('keeps member profiles and personal editing reachable through the menu', () => {
    const s = header(); press(s.h.render(), '開啟行程選單'); press(s.h.render(), '查看friend的資料');
    expect(nodes(s.h.render()).find(n => (n.props.member as TripMemberWithProfile | undefined)?.user_id === 'friend')).toBeDefined();
    press(s.h.render(), '開啟行程選單'); press(s.h.render(), '查看我的資料');
    const modal = nodes(s.h.render()).find(n => (n.props.member as TripMemberWithProfile | undefined)?.user_id === 'u')!;
    (modal.props.onEdit as () => void)(); expect(s.props.onProfile).toHaveBeenCalledOnce();
  });
  it('keeps the theme action and can close via backdrop or system back', () => {
    const s = header(); press(s.h.render(), '開啟行程選單'); press(s.h.render(), '切換主題，目前為明亮'); expect(s.props.onThemeModeChange).toHaveBeenCalledExactlyOnceWith('dark');
    press(s.h.render(), '開啟行程選單'); press(s.h.render(), '關閉行程選單背景'); expect(named(s.h.render(), '分享行程')).toBeUndefined();
    press(s.h.render(), '開啟行程選單'); (nodes(s.h.render()).find(n => n.props.testID === 'trip-management-menu')!.props.onRequestClose as () => void)(); expect(named(s.h.render(), '分享行程')).toBeUndefined();
  });
  it('closes menu/member state when switching trips or accounts', () => {
    const s = header(); press(s.h.render(), '開啟行程選單'); s.set({ trip: { ...trip, id: 'next' } }); expect(named(s.h.render(), '分享行程')).toBeUndefined();
    press(s.h.render(), '開啟行程選單'); press(s.h.render(), '查看friend的資料'); s.set({ userId: 'friend' }); expect(nodes(s.h.render()).some(n => Boolean(n.props.member))).toBe(false);
  });
});
describe('single dense date navigation', () => {
  it('offers a <=56px date strip with 44px targets and exact original day callbacks', () => {
    const onChange = vi.fn(); const tree = DayTabs({ days: [1, 2, 3], selected: 2, startDate: '2026-10-31', onChange, dense: true });
    const scroll = nodes(tree).find(n => n.type === 'section')!; expect(merged(scroll.props.style).height).toBeLessThanOrEqual(56);
    const day = named(tree, 'Day 2 SUN 11/01')!; expect(day.props.accessibilityState).toMatchObject({ selected: true }); expect(merged(day.props.style).height).toBeGreaterThanOrEqual(44);
    press(tree, 'Day 3 MON 11/02'); expect(onChange).toHaveBeenCalledExactlyOnceWith(3); expect(text(tree)).toMatch(/Day\s+2/);
  });
  it('replaces the separate hero with date tabs beside the original more-actions trigger', () => {
    const source = readFileSync('src/components/trip-detail/TimelinePanel.tsx', 'utf8');
    expect(source).not.toContain('dayHeroStyle'); expect(source).toContain('styles.dayNavigation'); expect(source).toContain('dense'); expect(source).toContain('accessibilityLabel="更多行程操作"');
    const route = readFileSync('src/app/trips/[id].tsx', 'utf8'); expect(route).toContain('<OfflineSyncBanner'); expect(route).toContain('<TripGettingStarted');
  });
});
async function info() {
  expect(existsSync('src/components/trip-detail/TripTravelInfo.tsx'), 'a dedicated display-only information container exists').toBe(true);
  return import('../src/components/trip-detail/TripTravelInfo');
}
describe('travel information disclosure', () => {
  it('defaults closed without unmounting either existing panel', async () => {
    const { TripTravelInfo } = await info(); const preparation = React.createElement('panel', { testID: 'preparation' }, '準備元件');
    const h = harness(() => TripTravelInfo({ theme, preparation, shortcuts: request => React.createElement('panel', { testID: 'shortcuts', 'data-request': request }, '重要資訊') })); cleanup = h.unmount;
    const tree = h.render(); expect(named(tree, '展開旅程資訊')?.props.accessibilityState).toMatchObject({ expanded: false });
    const body = nodes(tree).find(n => n.props.testID === 'trip-travel-info-body')!; expect(merged(body.props.style).display).toBe('none'); expect(body.props.accessibilityElementsHidden).toBe(true);
    expect(nodes(body).some(n => n.props.testID === 'preparation')).toBe(true); expect(nodes(body).some(n => n.props.testID === 'shortcuts')).toBe(true);
  });
  it('opens and closes the same panel instances and provides a one-click important-information request', async () => {
    const { TripTravelInfo } = await info(); const preparation = React.createElement('panel', { testID: 'preparation' });
    const h = harness(() => TripTravelInfo({ theme, preparation, shortcuts: request => React.createElement('panel', { testID: 'shortcuts', 'data-request': request }) })); cleanup = h.unmount;
    press(h.render(), '快速查看住宿與集合資訊'); let body = nodes(h.render()).find(n => n.props.testID === 'trip-travel-info-body')!;
    expect(merged(body.props.style).display).not.toBe('none'); expect(nodes(body).find(n => n.props.testID === 'preparation')).toBe(preparation); expect(nodes(body).find(n => n.props.testID === 'shortcuts')?.props['data-request']).toBe(1);
    press(h.render(), '收合旅程資訊'); expect(nodes(h.render()).find(n => n.props.testID === 'trip-travel-info-body')?.props.accessibilityElementsHidden).toBe(true);
    press(h.render(), '快速查看住宿與集合資訊'); body = nodes(h.render()).find(n => n.props.testID === 'trip-travel-info-body')!; expect(nodes(body).find(n => n.props.testID === 'shortcuts')?.props['data-request']).toBe(2);
  });
});
