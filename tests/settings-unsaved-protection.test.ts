import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { harness, nodes, text } from './helpers/interaction-harness';
vi.mock('react', async original => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (...p: Parameters<typeof React.useState>) => a.default.useState(...p), useEffect: (...p: Parameters<typeof React.useEffect>) => a.default.useEffect(...p), useRef: (v: unknown) => a.default.useRef(v) }; });
vi.mock('react-native', () => ({ View: 'div', Text: 'span', Pressable: 'button', Modal: 'modal', ScrollView: 'section', Platform: { OS: 'web' }, useColorScheme: () => 'light', StyleSheet: { create: (v: unknown) => v } }));
vi.mock('@/lib/timezone', async () => import('../lib/timezone'));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
vi.mock('@/lib/trip-dates', async () => import('../lib/trip-dates'));
vi.mock('../src/components/FormPickers', () => ({ DatePickerField: 'date-picker', TimePickerField: 'time-picker' }));
import { TripSettingsModal } from '../src/components/TripSettingsModal';
let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); });
const defaults = { visible: true, userId: 'u', tripId: 't', startDate: '2026-12-01', endDate: '2026-12-03', departureTime: '08:17', timezone: 'Australia/Adelaide', notificationPermission: 'granted' as const };
function setup() {
  let props = { ...defaults, onClose: vi.fn(), onSave: vi.fn<React.ComponentProps<typeof TripSettingsModal>['onSave']>().mockResolvedValue(undefined), onThemeModeChange: vi.fn(), onReminderToggle: vi.fn(), themeMode: 'system' as 'system' | 'dark', remindersEnabled: false };
  const h = harness(() => TripSettingsModal(props)); cleanup = h.unmount; h.render();
  return { h, get props() { return props; }, set(next: Partial<typeof props>) { props = { ...props, ...next }; h.render(); } };
}
function button(tree: React.ReactNode, label: string) { return nodes(tree).find(n => n.type === 'button' && text(n) === label); }
function click(tree: React.ReactNode, label: string) { const b = button(tree, label); expect(b, label).toBeDefined(); if (!b!.props.disabled) return b!.props.onPress!(); }
function field(tree: React.ReactNode, label: string) { return nodes(tree).find(n => n.props.label === label && typeof n.props.onChange === 'function')!; }
function change(tree: React.ReactNode, label: string, value: string) { (field(tree, label).props.onChange as (value: string) => void)(value); }
function back(tree: React.ReactNode) { (nodes(tree).find(n => n.type === 'modal')!.props.onRequestClose as () => void)(); }
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
describe('settings unsaved protection', () => {
  it('unchanged settings cancel without confirmation or API writes', () => {
    const s = setup(); click(s.h.render(), '取消'); expect(s.props.onClose).toHaveBeenCalledOnce(); expect(s.props.onSave).not.toHaveBeenCalled();
  });
  it.each(['開始日期', '結束日期', '預設每日出發時間', '時區'])('protects changes to %s', label => {
    const s = setup();
    if (label === '時區') { const zone = nodes(s.h.render()).find(n => typeof n.type === 'function' && n.type.name === 'TimezonePickerField')!; (zone.props.onChange as (v: string) => void)('Asia/Tokyo'); }
    else change(s.h.render(), label, label === '預設每日出發時間' ? '10:00' : '2026-12-02');
    click(s.h.render(), '取消'); expect(s.props.onClose).not.toHaveBeenCalled(); expect(button(s.h.render(), '放棄修改')).toBeDefined();
  });
  it('continue editing retains values and explicit discard closes without saving', () => {
    const s = setup(); change(s.h.render(), '開始日期', '2026-12-02'); click(s.h.render(), '取消'); click(s.h.render(), '繼續編輯');
    expect(field(s.h.render(), '開始日期').props.value).toBe('2026-12-02'); click(s.h.render(), '取消'); click(s.h.render(), '放棄修改');
    expect(s.props.onClose).toHaveBeenCalledOnce(); expect(s.props.onSave).not.toHaveBeenCalled();
  });
  it('system back asks before closing; back on confirmation resumes editing', () => {
    const s = setup(); change(s.h.render(), '開始日期', '2026-12-02'); back(s.h.render());
    expect(button(s.h.render(), '放棄修改')).toBeDefined(); expect(s.props.onClose).not.toHaveBeenCalled();
    back(s.h.render()); expect(button(s.h.render(), '放棄修改')).toBeUndefined(); expect(field(s.h.render(), '開始日期').props.value).toBe('2026-12-02');
  });
  it('restoring original field value permits immediate close', () => {
    const s = setup(); change(s.h.render(), '開始日期', '2026-12-02'); change(s.h.render(), '開始日期', defaults.startDate);
    click(s.h.render(), '取消'); expect(s.props.onClose).toHaveBeenCalledOnce();
  });
  it('background server props do not overwrite active inputs or baseline', () => {
    const s = setup(); change(s.h.render(), '開始日期', '2026-12-02'); s.set({ startDate: '2026-12-03', departureTime: '11:00', timezone: 'Asia/Tokyo' });
    expect(field(s.h.render(), '開始日期').props.value).toBe('2026-12-02'); expect(field(s.h.render(), '預設每日出發時間').props.value).toBe('08:17');
    click(s.h.render(), '取消'); expect(s.props.onClose).not.toHaveBeenCalled();
  });
  it('new trip/account and reopening reset fields and confirmation', () => {
    const s = setup(); change(s.h.render(), '開始日期', '2026-12-02'); click(s.h.render(), '取消'); s.set({ tripId: 'other', startDate: '2026-12-03' });
    expect(field(s.h.render(), '開始日期').props.value).toBe('2026-12-03'); expect(button(s.h.render(), '放棄修改')).toBeUndefined();
    change(s.h.render(), '開始日期', '2026-12-02'); s.set({ userId: 'other' }); expect(field(s.h.render(), '開始日期').props.value).toBe('2026-12-03');
    s.set({ visible: false }); s.set({ visible: true, startDate: '2026-12-01' }); expect(field(s.h.render(), '開始日期').props.value).toBe('2026-12-01');
  });
  it('theme and reminder changes remain immediate and do not mark the form dirty', () => {
    const s = setup(); click(s.h.render(), '🌙 暗黑'); expect(s.props.onThemeModeChange).toHaveBeenCalledWith('dark');
    const toggle = nodes(s.h.render()).find(n => n.props.accessibilityRole === 'switch')!; toggle.props.onPress!(); expect(s.props.onReminderToggle).toHaveBeenCalledWith(true);
    s.set({ themeMode: 'dark', remindersEnabled: true });
    expect(text(s.h.render())).toContain('立即生效'); click(s.h.render(), '取消'); expect(s.props.onClose).toHaveBeenCalledOnce(); expect(s.props.onSave).not.toHaveBeenCalled();
  });
  it('discarding form fields never reverts immediate theme/reminder changes', () => {
    const s = setup(); click(s.h.render(), '🌙 暗黑'); nodes(s.h.render()).find(n => n.props.accessibilityRole === 'switch')!.props.onPress!(); s.set({ themeMode: 'dark', remindersEnabled: true });
    change(s.h.render(), '開始日期', '2026-12-02'); click(s.h.render(), '取消'); click(s.h.render(), '放棄修改');
    expect(s.props.onThemeModeChange).toHaveBeenCalledExactlyOnceWith('dark'); expect(s.props.onReminderToggle).toHaveBeenCalledExactlyOnceWith(true); expect(s.props.onSave).not.toHaveBeenCalled();
  });
  it('locks saves and close synchronously, disables date/time fields then closes on success', async () => {
    const s = setup(); let finish!: () => void; s.set({ onSave: vi.fn(() => new Promise<void>(r => { finish = r; })) });
    change(s.h.render(), '開始日期', '2026-12-02'); const tree = s.h.render(); click(tree, '儲存設定'); click(tree, '儲存設定'); click(tree, '取消'); back(tree);
    expect(s.props.onSave).toHaveBeenCalledOnce(); expect(s.props.onClose).not.toHaveBeenCalled(); expect(field(s.h.render(), '開始日期').props.disabled).toBe(true); expect(field(s.h.render(), '預設每日出發時間').props.disabled).toBe(true);
    finish(); await tick(); expect(s.props.onClose).toHaveBeenCalledOnce(); expect(button(s.h.render(), '放棄修改')).toBeUndefined();
    expect(s.props.onSave).toHaveBeenCalledWith({ start_date: '2026-12-02', end_date: '2026-12-03', default_departure_time: '08:17', timezone: 'Australia/Adelaide' });
  });
  it('save failure preserves values, backend message and close protection', async () => {
    const s = setup(); vi.spyOn(console, 'error').mockImplementation(() => {}); s.set({ onSave: vi.fn().mockRejectedValue({ message: '權限不足' }) });
    change(s.h.render(), '開始日期', '2026-12-02'); click(s.h.render(), '儲存設定'); await tick();
    expect(text(s.h.render())).toContain('權限不足'); expect(field(s.h.render(), '開始日期').props.value).toBe('2026-12-02'); click(s.h.render(), '取消'); expect(s.props.onClose).not.toHaveBeenCalled(); expect(button(s.h.render(), '放棄修改')).toBeDefined();
  });
  it.each([false, true])('ignores an old save result after switching scopes (reject=%s)', async reject => {
    const s = setup(); let finish!: () => void; let fail!: (error: unknown) => void; s.set({ onSave: vi.fn(() => new Promise<void>((r, j) => { finish = r; fail = j; })) });
    click(s.h.render(), '儲存設定'); s.set({ tripId: 'other', startDate: '2026-12-02' }); if (reject) fail(new Error('舊錯誤')); else finish(); await tick();
    expect(s.props.onClose).not.toHaveBeenCalled(); expect(text(s.h.render())).not.toContain('舊錯誤'); expect(field(s.h.render(), '開始日期').props.value).toBe('2026-12-02'); expect(button(s.h.render(), '儲存設定')?.props.disabled).toBe(false);
  });
  it('ignores pending save completion after unmount', async () => {
    const s = setup(); let finish!: () => void; s.set({ onSave: vi.fn(() => new Promise<void>(r => { finish = r; })) }); click(s.h.render(), '儲存設定'); s.h.unmount(); finish(); await tick(); expect(s.props.onClose).not.toHaveBeenCalled();
  });
});
