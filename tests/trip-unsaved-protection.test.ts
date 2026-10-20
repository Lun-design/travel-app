import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { harness, nodes, text } from './helpers/interaction-harness';
import type { Trip } from '../lib/trips';
vi.mock('react', async original => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (...p: Parameters<typeof React.useState>) => a.default.useState(...p), useEffect: (...p: Parameters<typeof React.useEffect>) => a.default.useEffect(...p), useRef: (v: unknown) => a.default.useRef(v) }; });
vi.mock('react-native', () => ({ View: 'div', Text: 'span', TextInput: 'input', Pressable: 'button', Modal: 'modal', ScrollView: 'section', Platform: { OS: 'web' }, useColorScheme: () => 'light', StyleSheet: { create: (v: unknown) => v } }));
vi.mock('@/lib/timezone', async () => import('../lib/timezone'));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
vi.mock('@/lib/trip-dates', async () => import('../lib/trip-dates'));
vi.mock('../src/components/FormPickers', () => ({ DatePickerField: 'date-picker', TimePickerField: 'time-picker' }));
import { CreateTripModal } from '../src/components/CreateTripModal';
const trip = { id: 't', title: '旅行', destination: '日本', start_date: '2026-12-01', end_date: '2026-12-03', default_departure_time: '08:17', timezone: 'Asia/Tokyo' } as Trip;
let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); cleanup = undefined; vi.restoreAllMocks(); });
function button(tree: React.ReactNode, label: string) { return nodes(tree).find(n => n.type === 'button' && text(n) === label); }
function click(tree: React.ReactNode, label: string) { const b = button(tree, label); expect(b, label).toBeDefined(); if (!b!.props.disabled) return b!.props.onPress!(); }
function input(tree: React.ReactNode) { return nodes(tree).find(n => n.props.placeholder === '行程名稱')!; }
function back(tree: React.ReactNode) { (nodes(tree).find(n => n.type === 'modal')!.props.onRequestClose as () => void)(); }
function setup(edit = true) {
  let props: React.ComponentProps<typeof CreateTripModal> = { visible: true, userId: 'u', initialTrip: edit ? trip : null, onClose: vi.fn(), onCreate: vi.fn(), onUpdate: vi.fn() };
  const h = harness(() => CreateTripModal(props)); cleanup = h.unmount; h.render();
  return { h, get props() { return props; }, set(next: Partial<typeof props>) { props = { ...props, ...next }; h.render(); } };
}
describe('trip form unsaved protection', () => {
  it('first-open untouched create form closes without relying on an extra render', () => {
    const close = vi.fn(); const h = harness(() => CreateTripModal({ visible: true, userId: 'u', onClose: close })); cleanup = h.unmount;
    click(h.render(), '取消'); expect(close).toHaveBeenCalledOnce();
  });
  it.each([false, true])('unchanged form closes directly (edit=%s)', edit => {
    const { h, props } = setup(edit); click(h.render(), '取消'); expect(props.onClose).toHaveBeenCalledOnce();
  });
  it.each([false, true])('cancel retains changed input until explicit discard (edit=%s)', edit => {
    const { h, props } = setup(edit); input(h.render()).props.onChangeText!('我的旅行'); click(h.render(), '取消');
    expect(props.onClose).not.toHaveBeenCalled(); expect(button(h.render(), '繼續編輯')).toBeDefined();
    click(h.render(), '繼續編輯'); expect(input(h.render()).props.value).toBe('我的旅行');
    click(h.render(), '取消'); click(h.render(), '放棄修改'); expect(props.onClose).toHaveBeenCalledOnce();
    expect(props.onCreate).not.toHaveBeenCalled(); expect(props.onUpdate).not.toHaveBeenCalled();
  });
  it('system back opens confirmation and back again resumes editing', () => {
    const { h, props } = setup(); input(h.render()).props.onChangeText!('修改'); back(h.render());
    expect(button(h.render(), '放棄修改')).toBeDefined(); expect(props.onClose).not.toHaveBeenCalled();
    back(h.render()); expect(button(h.render(), '放棄修改')).toBeUndefined(); expect(input(h.render()).props.value).toBe('修改');
  });
  it('same-trip background refresh cannot overwrite inputs or dirty baseline', () => {
    const s = setup(); input(s.h.render()).props.onChangeText!('本機編輯'); s.set({ initialTrip: { ...trip, title: '背景資料' } });
    expect(input(s.h.render()).props.value).toBe('本機編輯'); click(s.h.render(), '取消'); expect(s.props.onClose).not.toHaveBeenCalled();
  });
  it('editing back to original value closes without confirmation', () => {
    const { h, props } = setup(); input(h.render()).props.onChangeText!('修改'); input(h.render()).props.onChangeText!(trip.title);
    click(h.render(), '取消'); expect(props.onClose).toHaveBeenCalledOnce();
  });
  it.each(['destination', 'start', 'end', 'departure', 'timezone'])('protects changes to %s', field => {
    const { h, props } = setup(); const tree = h.render();
    if (field === 'destination') nodes(tree).find(n => n.props.placeholder === '目的地')!.props.onChangeText!('大阪');
    else {
      const node = field === 'timezone' ? nodes(tree).find(n => typeof n.type === 'function' && n.type.name === 'TimezonePickerField')! : nodes(tree).find(n => n.props.label === ({ start: '開始日期', end: '結束日期', departure: '預設每日出發時間' }[field as 'start' | 'end' | 'departure']))!;
      (node.props.onChange as (v: string) => void)(field === 'timezone' ? 'Asia/Taipei' : field === 'departure' ? '10:00' : '2026-12-02');
    }
    click(h.render(), '取消'); expect(props.onClose).not.toHaveBeenCalled(); expect(button(h.render(), '放棄修改')).toBeDefined();
  });
  it('switching trip/account or reopening resets confirmation and inputs', () => {
    const s = setup(); input(s.h.render()).props.onChangeText!('舊草稿'); click(s.h.render(), '取消');
    s.set({ initialTrip: { ...trip, id: 'other', title: '其他行程' } }); expect(input(s.h.render()).props.value).toBe('其他行程'); expect(button(s.h.render(), '放棄修改')).toBeUndefined();
    input(s.h.render()).props.onChangeText!('不應保留'); s.set({ userId: 'other-user' }); expect(input(s.h.render()).props.value).toBe('其他行程');
    s.set({ visible: false }); s.set({ visible: true, initialTrip: { ...trip, title: '最新資料' } }); expect(input(s.h.render()).props.value).toBe('最新資料');
  });
  it('save failure retains input and unsaved protection', async () => {
    const s = setup(); s.set({ onUpdate: vi.fn().mockRejectedValue(new Error('連線失敗')) }); vi.spyOn(console, 'error').mockImplementation(() => {});
    input(s.h.render()).props.onChangeText!('保留'); click(s.h.render(), '儲存變更'); await Promise.resolve(); await Promise.resolve();
    expect(text(s.h.render())).toContain('連線失敗'); expect(input(s.h.render()).props.value).toBe('保留');
    click(s.h.render(), '取消'); expect(s.props.onClose).not.toHaveBeenCalled(); expect(button(s.h.render(), '放棄修改')).toBeDefined();
  });
  it('preserves a plain-object Supabase error message without unsafe assertions', async () => {
    const s = setup(); s.set({ onUpdate: vi.fn().mockRejectedValue({ message: '權限不足，請重新登入', code: '42501' }) }); vi.spyOn(console, 'error').mockImplementation(() => {});
    click(s.h.render(), '儲存變更'); await Promise.resolve(); await Promise.resolve();
    expect(text(s.h.render())).toContain('權限不足，請重新登入'); expect(s.props.onClose).not.toHaveBeenCalled();
  });
  it('locks duplicate saves and closing immediately, then closes on success without prompt', async () => {
    const s = setup(); let finish!: () => void; const update = vi.fn(() => new Promise<void>(r => { finish = r; })); s.set({ onUpdate: update });
    input(s.h.render()).props.onChangeText!('新名稱'); const tree = s.h.render(); click(tree, '儲存變更'); click(tree, '儲存變更'); click(tree, '取消'); back(tree);
    expect(update).toHaveBeenCalledOnce(); expect(s.props.onClose).not.toHaveBeenCalled();
    finish(); await Promise.resolve(); await Promise.resolve(); expect(s.props.onClose).toHaveBeenCalledOnce(); expect(button(s.h.render(), '放棄修改')).toBeUndefined();
  });
  it('an old save completion cannot close another trip form', async () => {
    const s = setup(); let finish!: () => void; s.set({ onUpdate: () => new Promise<void>(r => { finish = r; }) });
    click(s.h.render(), '儲存變更'); s.set({ initialTrip: { ...trip, id: 'new', title: '新行程' } });
    finish(); await Promise.resolve(); await Promise.resolve(); expect(s.props.onClose).not.toHaveBeenCalled(); expect(input(s.h.render()).props.value).toBe('新行程');
  });
});
