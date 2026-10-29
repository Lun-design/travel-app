import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PackingItem } from '../lib/packing-api';
import { harness, nodes, press, text } from './helpers/interaction-harness';
// @ts-expect-error RNWeb internal responder has no public declaration; exercise its actual key filtering.
import PressResponder from 'react-native-web/dist/modules/usePressEvents/PressResponder.js';
const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), alert: vi.fn() }));
vi.mock('react', async original => {
  const a = await original<typeof import('react') & { default: typeof React }>();
  return { ...a, useState: (...args: Parameters<typeof React.useState>) => a.default.useState(...args), useRef: (v: unknown) => a.default.useRef(v), useEffect: (...args: Parameters<typeof React.useEffect>) => a.default.useEffect(...args), useMemo: (...args: Parameters<typeof React.useMemo>) => a.default.useMemo(...args) };
});
vi.mock('react-native', () => ({ View: 'div', Text: 'span', TextInput: 'input', Modal: 'dialog', ScrollView: 'section', Pressable: 'button', Alert: { alert: api.alert }, useColorScheme: () => 'light', StyleSheet: { create: (v: unknown) => v } }));
vi.mock('@/lib/packing-api', () => ({ listPackingItems: api.list, createPackingItem: api.create, updatePackingItem: api.update, deletePackingItem: api.remove, importPackingTemplate: vi.fn() }));
vi.mock('@/lib/packing-utils', async () => import('../lib/packing-utils'));
vi.mock('@/lib/puppy-details', async () => import('../lib/puppy-details'));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
vi.mock('@/lib/weather-api', () => ({ fetchWeatherForecast: vi.fn() }));
vi.mock('@/lib/offline-store', () => ({ offlineStore: {} }));
vi.mock('@/lib/profiles', () => ({ getProfileDisplayName: (_: unknown, fallback: string) => fallback }));
vi.mock('../src/components/PuppyMascot', () => ({ PuppyMascot: 'mascot' }));
vi.mock('../src/components/ProfileAvatar', () => ({ ProfileAvatar: 'avatar' }));
import { PackingPanel } from '../src/components/PackingPanel';

const row = (id: string, extra: Partial<PackingItem> = {}): PackingItem => ({ id, trip_id: 't', name: `物品-${id}`, category: '證件', is_checked: false, assigned_to: null, created_at: '', ...extra });
const rows = [row('mine', { assigned_to: 'u' }), row('all', { assigned_to_all: true }), row('done', { assigned_to: 'u', is_checked: true }), row('other', { assigned_to: 'v' }), row('clothes', { category: '衣物' })];
let unmount: (() => void) | undefined;
const add = (tree: React.ReactNode) => nodes(tree).find(n => n.type === 'button' && text(n) === '新增')!.props.onPress!();
async function setup(data = rows) {
  api.list.mockResolvedValue(data);
  let props = { tripId: 't', userId: 'u', members: [], refreshToken: 0 };
  const h = harness(() => PackingPanel(props)); unmount = h.unmount;
  h.render(); await vi.waitFor(() => expect(api.list).toHaveBeenCalled());
  await Promise.resolve(); await Promise.resolve();
  return { ...h, setProps: (next: Partial<typeof props>) => { props = { ...props, ...next }; }, input: () => nodes(h.render()).find(n => n.type === 'input')!, names: () => nodes(h.render()).filter(n => n.props.numberOfLines === 2 && text(n).startsWith('物品-')).map(text) };
}
beforeEach(() => { api.create.mockResolvedValue(row('new')); api.update.mockResolvedValue(undefined); api.remove.mockResolvedValue(undefined); });
afterEach(() => { unmount?.(); unmount = undefined; vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('packing view and add feedback', () => {
  it('shows an eight-paw progress strip while preserving the numeric completion count', async () => {
    const h = await setup();
    const progress = nodes(h.render()).find(n => n.props.accessibilityLabel === '打包爪印進度：1 / 5')!;
    expect(text(progress)).toContain('🐾');
    expect(nodes(progress).filter(n => n.props.accessible === false)).toHaveLength(8);
    expect(text(h.render())).toMatch(/1\s*\/\s*5\s*\(\s*20\s*%\s*\)/);
  });

  it('activates a web checkbox once with Space even though RNWeb delegates only Enter for this role', async () => {
    vi.stubGlobal('document', {}); const h = await setup();
    const checkbox = nodes(h.render()).find(n => n.props.accessibilityLabel === '打包：物品-mine')!;
    const target = { tagName: 'DIV', getAttribute: () => 'checkbox' };
    const event = { key: ' ', target, currentTarget: target, repeat: false, preventDefault: vi.fn() };
    const responder = new PressResponder({ onPress: checkbox.props.onPress });
    responder.getEventHandlers().onKeyDown(event);
    (checkbox.props.onKeyDown as ((e: typeof event) => void) | undefined)?.(event);
    expect(api.update).toHaveBeenCalledOnce(); expect(event.preventDefault).toHaveBeenCalledOnce();
    responder.reset();
  });
  it('preserves the current assignee in the accessible name', async () => {
    const h = await setup();
    const row = nodes(h.render()).find(n => n.type === 'div' && n.key === 'all')!;
    const assign = nodes(row).find(n => n.type === 'button' && text(n).includes('所有人'))!;
    expect(assign.props.accessibilityLabel).toContain('目前：所有人');
  });
  it('announces category expansion and selected assignment choices', async () => {
    const h = await setup(); press(h.render(), '打包分類：證件');
    expect(nodes(h.render()).find(n => n.props.accessibilityLabel === '打包分類：證件')!.props.accessibilityState).toMatchObject({ expanded: false });
    press(h.render(), '打包分類：證件'); press(h.render(), '指派攜帶人：物品-all，目前：所有人');
    const selected = nodes(h.render()).find(n => n.props.accessibilityLabel === '指派選項：所有人')!;
    expect(selected.props.accessibilityRole).toBe('radio'); expect(selected.props.accessibilityState).toMatchObject({ checked: true, disabled: false });
    expect(api.update).not.toHaveBeenCalled();
  });
  it('makes the checkbox and item name one spacious accessible target without nested actions', async () => {
    const h = await setup(); const checkbox = nodes(h.render()).find(n => n.props.accessibilityLabel === '打包：物品-mine')!;
    expect(text(checkbox)).toContain('物品-mine');
    expect(nodes(checkbox).filter(n => n.type === 'button')).toHaveLength(1);
    const style = Object.assign({}, ...[checkbox.props.style].flat(Infinity).filter(Boolean));
    expect(style.minHeight).toBeGreaterThanOrEqual(44); expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(checkbox.props.accessibilityState).toMatchObject({ checked: false, disabled: false });
    press(h.render(), '打包：物品-mine'); await vi.waitFor(() => expect(api.update).toHaveBeenCalledOnce());
    expect(api.update.mock.calls[0][1]).toEqual({ is_checked: true, is_packed: true });
  });
  it('uses a paw stamp for checked packing items while keeping the checkbox accessible', async () => {
    const h = await setup();
    const checkedItem = nodes(h.render()).find(n => n.props.accessibilityRole === 'checkbox' && Boolean((n.props.accessibilityState as { checked?: boolean } | undefined)?.checked))!;
    expect(text(checkedItem)).toContain('🐾');
    expect((checkedItem.props.accessibilityState as { checked?: boolean }).checked).toBe(true);
  });
  it('keeps assignment and deletion beside, not inside, the checkbox target', async () => {
    const h = await setup(); const checkbox = nodes(h.render()).find(n => n.props.accessibilityLabel === '打包：物品-mine')!;
    const row = nodes(h.render()).find(n => n.type === 'div' && n.key === 'mine')!;
    const assign = nodes(row).find(n => n.props.accessibilityLabel === '指派攜帶人：物品-mine，目前：u')!;
    const remove = nodes(row).find(n => n.props.accessibilityLabel === '刪除打包項目：物品-mine')!;
    expect(assign).toBeDefined(); expect(remove).toBeDefined();
    expect(nodes(checkbox)).not.toContain(assign); expect(nodes(checkbox)).not.toContain(remove);
    for (const button of [assign, remove]) {
      const style = Object.assign({}, ...[button.props.style].flat(Infinity).filter(Boolean));
      expect(style.minWidth).toBeGreaterThanOrEqual(44); expect(style.minHeight).toBeGreaterThanOrEqual(44);
    }
    assign.props.onPress!(); expect(api.update).not.toHaveBeenCalled(); expect(api.remove).not.toHaveBeenCalled();
    expect(nodes(h.render()).some(n => n.type === 'dialog' && n.props.visible && text(n).includes('指派攜帶人'))).toBe(true);
  });
  it('prevents duplicate name clicks and accurately disables other rows while a shared mutation is pending', async () => {
    let finish!: () => void;
    api.update.mockImplementationOnce(() => new Promise<void>(r => { finish = r; }));
    const h = await setup(); const toggle = nodes(h.render()).find(n => n.props.accessibilityLabel === '打包：物品-mine')!.props.onPress!;
    toggle(); toggle(); expect(api.update).toHaveBeenCalledOnce();
    const current = nodes(h.render()).find(n => n.props.accessibilityLabel === '打包：物品-mine')!;
    expect(current.props.accessibilityState).toMatchObject({ checked: true, disabled: true, busy: true });
    for (const label of ['打包：物品-other', '指派攜帶人：物品-other，目前：v', '刪除打包項目：物品-other']) {
      const control = nodes(h.render()).find(n => n.props.accessibilityLabel === label)!;
      expect(control.props.disabled).toBe(true); expect(control.props.accessibilityState).toMatchObject({ disabled: true });
    }
    finish(); await vi.waitFor(() => expect(nodes(h.render()).find(n => n.props.accessibilityLabel === '打包：物品-other')!.props.disabled).toBe(false));
  });
  it('restores the checkbox after a failed optimistic update using the existing reload path', async () => {
    api.update.mockRejectedValueOnce(new Error('failed'));
    const h = await setup(); press(h.render(), '打包：物品-mine');
    await vi.waitFor(() => expect(api.alert).toHaveBeenCalledWith('更新打包狀態失敗', 'failed'));
    await vi.waitFor(() => expect(nodes(h.render()).find(n => n.props.accessibilityLabel === '打包：物品-mine')!.props.accessibilityState).toMatchObject({ checked: false, disabled: false }));
  });
  it('filters by category without changing create category or total progress', async () => {
    const h = await setup();
    press(h.render(), '檢視分類：衣物');
    expect(h.names()).toEqual(['物品-clothes']);
    expect(text(h.render())).toContain('1 / 5');
    h.input().props.onChangeText!('新物品');
    press(h.render(), '新增打包項目');
    await vi.waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create.mock.calls[0][0]).toMatchObject({ category: '未分類', name: '新物品' });
    expect(api.update).not.toHaveBeenCalled();
  });
  it('combines my items with incomplete, including shared assignments', async () => {
    const h = await setup();
    press(h.render(), '只看我的項目'); press(h.render(), '只看未完成');
    expect(h.names()).toEqual(['物品-mine', '物品-all']);
    expect(api.update).not.toHaveBeenCalled(); expect(api.create).not.toHaveBeenCalled();
    press(h.render(), '清除打包篩選');
    expect(h.names()).toHaveLength(5);
  });
  it('preserves filters on refresh but resets them when trip or account changes', async () => {
    const h = await setup();
    press(h.render(), '檢視分類：衣物');
    h.setProps({ refreshToken: 1 }); h.render(); await Promise.resolve(); await Promise.resolve();
    expect(h.names()).toEqual(['物品-clothes']);
    h.setProps({ tripId: 'next' }); h.render(); await Promise.resolve(); await Promise.resolve();
    expect(h.names()).toHaveLength(5);
    press(h.render(), '只看未完成');
    h.setProps({ userId: 'v' }); h.render(); await Promise.resolve(); await Promise.resolve();
    expect(h.names()).toHaveLength(5);
  });
  it('distinguishes empty lists from no filter matches and provides a working reset', async () => {
    const h = await setup();
    press(h.render(), '檢視分類：藥品');
    expect(text(h.render())).toContain('沒有符合篩選的項目');
    press(h.render(), '清除打包篩選'); expect(h.names()).toHaveLength(5);
  });
  it.each([' Power BANK ', 'power-bank'])('keeps duplicate input %s, reveals and highlights the existing row without requests', async (name) => {
    const h = await setup([row('existing', { name: 'Power bank', category: '未分類' })]);
    press(h.render(), '檢視分類：衣物');
    h.input().props.onChangeText!(name); press(h.render(), '新增打包項目');
    expect(h.input().props.value).toBe(name);
    expect(text(h.render())).toContain('此項目已存在');
    expect(nodes(h.render()).some(n => n.props.testID === 'packing-highlight-existing')).toBe(true);
    expect(text(h.render())).toContain('Power bank');
    expect(api.create).not.toHaveBeenCalled();
  });
  it('allows only one create from keyboard and button before the next render', async () => {
    const h = await setup([]);
    api.create.mockImplementationOnce(() => new Promise(() => {}));
    h.input().props.onChangeText!('新物品');
    const input = h.input(); const tree = h.render();
    (input.props.onSubmitEditing as () => void)(); add(tree);
    expect(api.create).toHaveBeenCalledTimes(1);
  });
  it('ignores create completion after switching trips', async () => {
    const h = await setup([]);
    let finish!: (v: PackingItem) => void;
    api.create.mockImplementationOnce(() => new Promise<PackingItem>(r => { finish = r; }));
    h.input().props.onChangeText!('舊行程物品'); add(h.render());
    h.setProps({ tripId: 'next' }); h.render(); await Promise.resolve(); await Promise.resolve();
    finish(row('old-created')); await Promise.resolve();
    expect(h.names()).not.toContain('物品-old-created');
  });
  it('retains input after a create error and permits retry', async () => {
    const h = await setup([]);
    api.create.mockRejectedValueOnce(new Error('offline failure'));
    h.input().props.onChangeText!('新物品'); add(h.render());
    await vi.waitFor(() => expect(api.alert).toHaveBeenCalledWith('新增項目失敗', 'offline failure'));
    expect(h.input().props.value).toBe('新物品');
    add(h.render()); await vi.waitFor(() => expect(api.create).toHaveBeenCalledTimes(2));
  });
  it('checks the visible original item and keeps global progress authoritative', async () => {
    const h = await setup();
    press(h.render(), '只看我的項目'); press(h.render(), '只看未完成');
    press(h.render(), '打包：物品-mine');
    await vi.waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(api.update.mock.calls[0]).toEqual(['mine', { is_checked: true, is_packed: true }, expect.anything()]);
    expect(h.names()).toEqual(['物品-all']);
    expect(text(h.render())).toContain('2 / 5');
  });
  it('uses the category picker for creation independently of list filters', async () => {
    const h = await setup();
    press(h.render(), '新增項目分類');
    const modal = nodes(h.render()).find(n => n.type === 'dialog' && n.props.visible)!;
    nodes(modal).find(n => n.type === 'button' && text(n) === '衣物')!.props.onPress!();
    press(h.render(), '檢視分類：證件');
    h.input().props.onChangeText!('新衣物'); add(h.render());
    await vi.waitFor(() => expect(api.create).toHaveBeenCalled());
    expect(api.create.mock.calls[0][0]).toMatchObject({ category: '衣物', name: '新衣物' });
  });
  it('retains member assignment and deletion handlers under active filters', async () => {
    const h = await setup();
    press(h.render(), '只看我的項目');
    const itemRow = () => nodes(h.render()).find(n => n.type === 'div' && n.key === 'mine')!;
    nodes(itemRow()).find(n => n.type === 'button' && text(n).trim() === 'u')!.props.onPress!();
    nodes(h.render()).find(n => n.type === 'button' && text(n) === '👥 所有人')!.props.onPress!();
    await vi.waitFor(() => expect(api.update).toHaveBeenCalledWith('mine', { assigned_to: null, assigned_to_all: true }, expect.anything()));
    api.list.mockResolvedValue(rows.filter(r => r.id !== 'mine'));
    nodes(itemRow()).find(n => n.type === 'button' && text(n) === '×')!.props.onPress!();
    await vi.waitFor(() => expect(h.names()).not.toContain('物品-mine'));
    expect(api.remove).toHaveBeenCalledWith('mine', expect.anything());
    expect(h.names()).toEqual(['物品-all', '物品-done']);
  });
  it('reports a genuinely empty list without blaming filters', async () => {
    const h = await setup([]);
    expect(text(h.render())).toContain('還沒有打包項目');
    expect(text(h.render())).toContain('0 / 0');
    expect(text(h.render())).not.toContain('沒有符合篩選');
  });
  it('cleans highlight timers on scope change and unmount', async () => {
    const h = await setup([row('existing', { name: 'Power bank', category: '未分類' })]);
    vi.useFakeTimers();
    h.input().props.onChangeText!('Power bank'); add(h.render()); h.render();
    expect(vi.getTimerCount()).toBe(1);
    h.setProps({ tripId: 'next' }); h.render(); h.render();
    expect(vi.getTimerCount()).toBe(0);
    expect(text(h.render())).not.toContain('此項目已存在');
    h.unmount(); expect(vi.getTimerCount()).toBe(0);
    unmount = undefined;
  });
  it('reloads existing rows if creation finishes before the first list request', async () => {
    let finish!: (v: PackingItem[]) => void;
    api.list.mockImplementationOnce(() => new Promise<PackingItem[]>(r => { finish = r; }));
    const h = await setup();
    api.list.mockResolvedValue([...rows, row('new')]);
    h.input().props.onChangeText!('新物品'); add(h.render());
    await vi.waitFor(() => expect(api.create).toHaveBeenCalledOnce());
    finish(rows); await Promise.resolve(); await Promise.resolve();
    await vi.waitFor(() => expect(h.names()).toHaveLength(6));
    expect(h.names()).toContain('物品-mine');
    expect(h.names()).toContain('物品-new');
    expect(text(h.render())).toContain('1 / 6');
  });
});
