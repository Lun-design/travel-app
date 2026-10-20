import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { harness, nodes, press, text } from './helpers/interaction-harness';
import type { Expense } from '../lib/expenses-api';
vi.mock('react', async original => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (...p: Parameters<typeof React.useState>) => a.default.useState(...p), useRef: (v: unknown) => a.default.useRef(v), useEffect: (...p: Parameters<typeof React.useEffect>) => a.default.useEffect(...p), useMemo: (...p: Parameters<typeof React.useMemo>) => a.default.useMemo(...p) }; });
vi.mock('react-native', () => ({ View: 'div', Text: 'span', TextInput: 'input', Pressable: 'button', Modal: 'dialog', ScrollView: 'section', Alert: { alert: vi.fn() }, useColorScheme: () => 'light', StyleSheet: { create: (v: unknown) => v } }));
vi.mock('@/lib/exchange-rates', async () => import('../lib/exchange-rates'));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
vi.mock('@/lib/profiles', () => ({ getProfileDisplayName: (_p: unknown, fallback: string) => fallback }));
vi.mock('@/lib/receipt-ocr', () => ({ sumReceiptItems: (items: { price: number }[]) => items.reduce((total, item) => total + item.price, 0) }));
vi.mock('../src/hooks/useFormDraft', () => ({ useFormDraft: ({ onClose }: { onClose: () => void }) => ({ requestClose: onClose, markSaved: vi.fn(), recovery: null }) }));
vi.mock('../src/components/FormModalLayout', () => ({ FormModalLayout: 'form-layout' }));
vi.mock('../src/components/FormDraftNotice', () => ({ FormDraftNotice: 'draft-notice' }));
import { ExpenseModal } from '../src/components/ExpenseModal';
const expense: Expense = { id: 'e', trip_id: 't', payer_id: 'a', title: '晚餐', amount: 100, currency: 'TWD', category: '餐飲', created_at: '', splits: [{ user_id: 'a', amount: 50 }, { user_id: 'b', amount: 50 }] };
const members = [{ user_id: 'a', trip_id: 't' }, { user_id: 'b', trip_id: 't' }] as Parameters<typeof ExpenseModal>[0]['members'];
let cleanup: (() => void) | undefined;
afterEach(() => { cleanup?.(); cleanup = undefined; });
function setup() {
  const save = vi.fn(async () => {}), lock = vi.fn(async () => {});
  const h = harness(() => ExpenseModal({ visible: true, tripId: 't', expense, members, userId: 'a', onClose: vi.fn(), onSave: save, onLockRate: lock })); cleanup = h.unmount; h.render();
  return { ...h, save, lock };
}
function control(tree: React.ReactNode, label: string) { return nodes(tree).find(n => n.props.accessibilityLabel === label)!; }
function roomy(button: ReturnType<typeof control>) {
  expect(button).toBeDefined();
  const style = Object.assign({}, ...[button.props.style].flat(Infinity).filter(Boolean));
  expect(style.minHeight).toBeGreaterThanOrEqual(44); expect(style.minWidth).toBeGreaterThanOrEqual(44);
}
describe('expense modal touch targets and semantics', () => {
  it('groups radio choices so assistive technology can distinguish each selection context', () => {
    const h = setup(); const groups = nodes(h.render()).filter(n => n.props.accessibilityRole === 'radiogroup').map(n => n.props.accessibilityLabel);
    expect(groups).toEqual(expect.arrayContaining(['費用幣別', '費用類別', '付款人', '分攤方式']));
  });
  it('selects currencies with 44px radio buttons without changing the amount or splits', async () => {
    const h = setup();
    for (const value of ['TWD', 'JPY', 'KRW', 'USD', 'EUR']) {
      const button = control(h.render(), `費用幣別：${value}`); roomy(button);
      expect(button.props.accessibilityRole).toBe('radio'); expect(button.props.accessibilityState).toMatchObject({ checked: value === 'TWD' });
    }
    press(h.render(), '費用幣別：JPY'); expect(control(h.render(), '費用幣別：JPY').props.accessibilityState).toMatchObject({ checked: true });
    press(h.render(), '儲存旅費'); await vi.waitFor(() => expect(h.save).toHaveBeenCalledOnce());
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ currency: 'JPY', amount: 100 }), [{ user_id: 'a', amount: 50 }, { user_id: 'b', amount: 50 }]);
  });
  it('keeps locking the original rate through a roomy labelled action', async () => {
    const h = setup(); const jpy = nodes(h.render()).find(n => n.type === 'button' && text(n) === 'JPY')!; jpy.props.onPress!();
    nodes(h.render()).find(n => n.props.placeholder === '自訂匯率')!.props.onChangeText!('0.21');
    const button = control(h.render(), '鎖定自訂匯率'); roomy(button); expect(button.props.accessibilityRole).toBe('button');
    press(h.render(), '鎖定自訂匯率'); await vi.waitFor(() => expect(h.lock).toHaveBeenCalledExactlyOnceWith('JPY', 0.21));
  });
  it('retains add/remove receipt-item actions with independent 44px targets', () => {
    const h = setup(); const add = control(h.render(), '新增商品明細'); roomy(add); add.props.onPress!();
    expect(control(h.render(), '商品 1 名稱')).toBeDefined();
    const remove = control(h.render(), '刪除商品 1'); roomy(remove); expect(remove.props.accessibilityRole).toBe('button'); remove.props.onPress!();
    expect(control(h.render(), '商品 1 名稱')).toBeUndefined(); expect(h.save).not.toHaveBeenCalled();
  });
  it('exposes current payer, split method and member selection without changing their original actions', () => {
    const h = setup();
    expect(control(h.render(), '付款人：a').props.accessibilityState).toMatchObject({ checked: true });
    press(h.render(), '付款人：b'); expect(control(h.render(), '付款人：b').props.accessibilityState).toMatchObject({ checked: true });
    expect(control(h.render(), '分攤成員：a').props.accessibilityRole).toBe('checkbox');
    press(h.render(), '分攤成員：a'); expect(control(h.render(), '分攤成員：a').props.accessibilityState).toMatchObject({ checked: false });
    press(h.render(), '分攤方式：比例'); expect(control(h.render(), '分攤方式：比例').props.accessibilityState).toMatchObject({ checked: true });
    expect(h.save).not.toHaveBeenCalled();
  });
  it('announces disabled controls while the original form submission is pending', async () => {
    let finish!: () => void; const h = setup(); h.save.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
    press(h.render(), '儲存旅費');
    for (const label of ['費用幣別：JPY', '新增商品明細', '付款人：a', '分攤成員：a']) {
      expect(control(h.render(), label).props.disabled).toBe(true); expect(control(h.render(), label).props.accessibilityState).toMatchObject({ disabled: true });
    }
    finish(); await Promise.resolve();
  });
});
