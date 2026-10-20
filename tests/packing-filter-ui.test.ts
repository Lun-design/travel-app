import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PackingItem } from '../lib/packing-api';
import { harness, nodes, press, text } from './helpers/interaction-harness';
const api = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn(), alert: vi.fn() }));
vi.mock('react', async original => {
  const a = await original<typeof import('react') & { default: typeof React }>();
  return { ...a, useState: (...args: Parameters<typeof React.useState>) => a.default.useState(...args), useRef: (v: unknown) => a.default.useRef(v), useEffect: (...args: Parameters<typeof React.useEffect>) => a.default.useEffect(...args), useMemo: (...args: Parameters<typeof React.useMemo>) => a.default.useMemo(...args) };
});
vi.mock('react-native', () => ({ View: 'div', Text: 'span', TextInput: 'input', Modal: 'dialog', ScrollView: 'section', Pressable: 'button', Alert: { alert: api.alert }, useColorScheme: () => 'light', StyleSheet: { create: (v: unknown) => v } }));
vi.mock('@/lib/packing-api', () => ({ listPackingItems: api.list, createPackingItem: api.create, updatePackingItem: api.update, deletePackingItem: api.remove, importPackingTemplate: vi.fn() }));
vi.mock('@/lib/packing-utils', async () => import('../lib/packing-utils'));
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
afterEach(() => { unmount?.(); unmount = undefined; vi.useRealTimers(); });

describe('packing view and add feedback', () => {
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
