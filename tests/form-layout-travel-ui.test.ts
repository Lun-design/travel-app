import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { harness, nodes, press, text } from './helpers/interaction-harness';
import type { ItineraryItem } from '../lib/itinerary';
const mocks = vi.hoisted(() => ({ open: vi.fn() }));
vi.mock('react', async (original) => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (...args: Parameters<typeof React.useState>) => a.default.useState(...args), useRef: (v: unknown) => a.default.useRef(v), useEffect: (...args: Parameters<typeof React.useEffect>) => a.default.useEffect(...args), useMemo: (...args: Parameters<typeof React.useMemo>) => a.default.useMemo(...args) }; });
vi.mock('react-native', () => ({ View: 'div', Text: 'span', ScrollView: 'scroll', KeyboardAvoidingView: 'keyboard', Keyboard: { dismiss: vi.fn() }, Modal: 'modal', Pressable: 'button', Linking: { openURL: mocks.open }, Platform: { OS: 'web' }, StyleSheet: { create: (v: unknown) => v } }));
vi.mock('react-native-safe-area-context', () => ({ useSafeAreaInsets: () => ({ top: 0, bottom: 20, left: 0, right: 0 }) }));
vi.mock('../src/components/DraftNavigationGuard', () => ({ DraftNavigationGuard: 'navigation-guard' }));
vi.mock('@/lib/travel-mode', async () => import('../lib/travel-mode'));
vi.mock('@/lib/time-context', async () => import('../lib/time-context'));
vi.mock('@/lib/map-links', async () => import('../lib/map-links'));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
import { NextStopMode } from '../src/components/trip-detail/NextStopMode';
import { FormModalLayout } from '../src/components/FormModalLayout';
import { FormDraftNotice } from '../src/components/FormDraftNotice';
describe('opt-in travel mode', () => {
  it('moves manually, previews only the selected station ticket, and exits without changing itinerary data', async () => {
    mocks.open.mockResolvedValue(undefined);
    const items = [{ id: 'a', trip_id: 't', day_number: 1, position: 1, location_name: '桃園出發（台灣時間）', time: '06:00', place_id: 'place-a' }, { id: 'b', trip_id: 't', day_number: 1, position: 2, location_name: '大阪', time: '11:00' }] as ItineraryItem[];
    const before = JSON.stringify(items); const voucher = { id: 'v', trip_id: 't', item_id: 'b', title: '大阪門票' }; const onVoucher = vi.fn();
    const h = harness(() => NextStopMode({ tripId: 't', day: 1, timezone: 'Asia/Tokyo', items, vouchers: [voucher as never], onVoucher }));
    h.render(); expect(text(h.render())).not.toContain('桃園出發');
    press(h.render(), '開啟旅途模式'); let tree = h.render(); expect(text(tree)).toContain('台灣時間');
    expect(nodes(tree).find((n) => n.props.accessibilityLabel === '上一站')!.props.disabled).toBe(true);
    press(tree, '目前站點導航'); await Promise.resolve(); expect(mocks.open).toHaveBeenCalledWith(expect.stringContaining('destination_place_id=place-a'));
    press(tree, '下一站'); tree = h.render(); expect(text(tree)).toContain('大阪門票'); press(tree, '出示票券 大阪門票'); expect(onVoucher).toHaveBeenCalledWith(voucher);
    expect(nodes(tree).find((n) => n.props.accessibilityLabel === '下一站')!.props.disabled).toBe(true);
    press(tree, '上一站'); expect(text(h.render())).toContain('桃園出發');
    press(h.render(), '退出旅途模式'); expect(text(h.render())).not.toContain('桃園出發');
    expect(JSON.stringify(items)).toBe(before); h.unmount();
  });
  it('handles empty days and resets on day changes without auto-advancing based on time', () => {
    let day = 1;
    const h = harness(() => NextStopMode({ tripId: 't', day, items: [{ id: 'a', trip_id: 't', day_number: 1, position: 0, location_name: '第一站' } as ItineraryItem], vouchers: [], onVoucher: vi.fn() }));
    h.render(); press(h.render(), '開啟旅途模式'); day = 2; h.render(); const tree = h.render(); expect(text(tree)).not.toContain('第一站'); expect(text(tree)).toContain('尚無景點'); h.unmount();
  });
});
describe('mobile form safety', () => {
  it('keeps the footer outside the scrollable fields and includes safe-area padding', () => {
    const h = harness(() => FormModalLayout({ children: React.createElement('field', null, '最後欄位'), footer: React.createElement('save-button', null, '儲存') }));
    const tree = h.render(); const scroll = nodes(tree).find((n) => String(n.type) === 'scroll')!;
    expect(text(scroll)).not.toContain('儲存'); expect(text(scroll)).toContain('最後欄位');
    const footer = nodes(tree).find((n) => n.props.testID === 'form-fixed-footer')!;
    expect(text(footer)).toContain('儲存'); expect(JSON.stringify(footer.props.style)).toContain('20'); h.unmount();
  });
  it('offers all three explicit close choices and recovery consent', () => {
    const protection = { status: '本機草稿未同步', recovery: { data: {}, conflict: false, savedAt: 1 }, confirmClose: true, restore: vi.fn(), discardRecovery: vi.fn(), cancelClose: vi.fn(), keepAndClose: vi.fn(), discardAndClose: vi.fn() };
    const tree = FormDraftNotice({ protection: protection as never });
    for (const label of ['恢復草稿', '捨棄舊草稿', '繼續編輯', '保留草稿並關閉', '放棄變更']) press(tree, label);
    for (const fn of [protection.restore, protection.discardRecovery, protection.cancelClose, protection.keepAndClose, protection.discardAndClose]) expect(fn).toHaveBeenCalledOnce();
  });
  it('requires a recovery choice before fields can be changed, while leaving the notice usable', () => {
    const h = harness(() => FormModalLayout({ children: React.createElement('input', null), notice: React.createElement('restore-action', null, '恢復草稿'), blocked: true, footer: null }));
    const tree = h.render(); const blocked = nodes(tree).find((n) => n.props.inert === true);
    expect(blocked).toBeDefined(); expect(text(blocked)).not.toContain('恢復草稿'); expect(text(tree)).toContain('恢復草稿'); h.unmount();
  });
});
