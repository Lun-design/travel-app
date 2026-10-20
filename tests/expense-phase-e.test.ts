import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Expense } from '../lib/expenses-api';
import type { SettlementRecord } from '../lib/settlement-api';
import { harness, nodes, press, text } from './helpers/interaction-harness';
const api = vi.hoisted(() => ({ list: vi.fn(), budget: vi.fn(), save: vi.fn(), removeChannel: vi.fn(), channel: vi.fn(), forExpense: vi.fn() }));
vi.mock('react', async original => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (...p: Parameters<typeof React.useState>) => a.default.useState(...p), useRef: (v: unknown) => a.default.useRef(v), useEffect: (...p: Parameters<typeof React.useEffect>) => a.default.useEffect(...p), useMemo: (...p: Parameters<typeof React.useMemo>) => a.default.useMemo(...p) }; });
vi.mock('react-native', () => ({ View: 'div', Text: 'span', TextInput: 'input', Pressable: 'button', ActivityIndicator: 'loading', ScrollView: 'section', Alert: { alert: vi.fn() }, useColorScheme: () => 'light', StyleSheet: { create: (v: unknown) => v } }));
vi.mock('../lib/supabase', () => ({ supabase: { channel: api.channel, removeChannel: api.removeChannel } }));
vi.mock('@/lib/supabase', async () => import('../lib/supabase'));
vi.mock('../lib/settlement-api', () => ({ listSettlementRecords: api.list }));
vi.mock('@/lib/settlement-api', () => ({ listSettlementRecords: api.list, listSettlementRecordsForExpense: api.forExpense, settleExpense: vi.fn(), SettlementPreviewChangedError: class extends Error {} }));
vi.mock('@/lib/expenses-analytics', async () => import('../lib/expenses-analytics'));
vi.mock('@/lib/exchange-rates', async () => import('../lib/exchange-rates'));
vi.mock('@/lib/settlement', async () => import('../lib/settlement'));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
vi.mock('@/lib/profiles', () => ({ getProfileDisplayName: (p: { display_name?: string } | undefined, fallback: string) => p?.display_name ?? fallback }));
vi.mock('@/lib/budget-api', () => ({ getTripBudget: api.budget, saveTripBudget: api.save }));
vi.mock('../src/components/ProfileAvatar', () => ({ ProfileAvatar: 'avatar' }));
vi.mock('../src/components/SettlementCard', () => ({ SettlementCard: 'settlement-card' }));
vi.mock('../src/components/ActionConfirmationModal', () => ({ ActionConfirmationModal: 'confirmation' }));
vi.mock('@/components/BudgetDashboard', () => ({ BudgetDashboard: 'budget-dashboard' }));
vi.mock('@/components/ExpenseList', () => ({ ExpenseList: 'expense-list' }));
import { useSettlementRecords, type SettlementRecordsState } from '../src/hooks/useSettlementRecords';
import { BudgetDashboard } from '../src/components/BudgetDashboard';
import { ExpenseList } from '../src/components/ExpenseList';
import { ExpensesPanel } from '../src/components/trip-detail/ExpensesPanel';
const expense: Expense = { id: 'e', trip_id: 't', payer_id: 'a', title: '住宿費', amount: 36666, currency: 'TWD', category: '住宿', created_at: '', splits: [{ user_id: 'a', amount: 18333 }, { user_id: 'b', amount: 18333 }] };
const record: SettlementRecord = { id: 'r', trip_id: 't', expense_id: 'e', from_user_id: 'b', to_user_id: 'a', amount: 500, currency: 'TWD', note: null, settled_by: 'b', settled_at: '' };
const members = [{ user_id: 'a', profile: { display_name: '墊付者' } }, { user_id: 'b', profile: { display_name: '旅伴', avatar_url: 'b.png' } }] as Parameters<typeof BudgetDashboard>[0]['members'];
let cleanup: (() => void) | undefined;
let realtime: (() => void) | undefined;
beforeEach(() => {
  api.list.mockResolvedValue([record]); api.budget.mockResolvedValue(null); api.save.mockImplementation(async value => value); api.removeChannel.mockResolvedValue(undefined);
  api.channel.mockImplementation(() => { const channel = { on: (_event: unknown, _filter: unknown, callback: () => void) => { realtime = callback; return channel; }, subscribe: () => channel }; return channel; });
});
afterEach(() => { cleanup?.(); cleanup = undefined; vi.unstubAllGlobals(); });
const ready = () => ({ records: [record], loading: false, hasLoaded: true, error: null as string | null, reload: vi.fn(async () => {}), add: vi.fn(), remove: vi.fn() });
function hookHarness<T>(run: () => T) {
  const h = harness(() => run() as unknown as React.ReactNode);
  return { ...h, render: () => h.render() as unknown as T };
}
describe('expense panel integration', () => {
  it('shares one history snapshot and refreshes without remounting the budget', async () => {
    const refresh = vi.fn();
    const h = harness(() => ExpensesPanel({ tripId: 't', userId: 'b', expenses: [expense], members, rates: {}, rateLabel: '', themeMode: 'light', onEdit: vi.fn(), onDelete: vi.fn(), onAdd: vi.fn(), onExpenseSettled: refresh, focusRequest: 2 }));
    cleanup = h.unmount; h.render();
    await vi.waitFor(() => expect(api.list).toHaveBeenCalledOnce());
    const child = (type: string) => nodes(h.render()).find(n => n.type === type)!;
    await vi.waitFor(() => expect((child('expense-list').props.settlementState as SettlementRecordsState).hasLoaded).toBe(true));
    const snapshot = nodes(h.render());
    expect(snapshot.find(n => n.type === 'expense-list')!.props.settlementState).toBe(snapshot.find(n => n.type === 'budget-dashboard')!.props.settlementState);
    expect(child('expense-list').props.focusRequest).toBe(2);
    const key = child('budget-dashboard').key;
    await (child('expense-list').props.onExpenseSettled as () => Promise<void>)();
    expect(api.list).toHaveBeenCalledTimes(2); expect(refresh).toHaveBeenCalledOnce();
    expect(child('budget-dashboard').key).toBe(key);
  });
});
describe('shared settlement history', () => {
  it('loads once, updates from realtime and unsubscribes', async () => {
    const h = hookHarness(() => useSettlementRecords('t', 'b')); cleanup = h.unmount; h.render();
    await vi.waitFor(() => expect(h.render().hasLoaded).toBe(true));
    expect(api.list).toHaveBeenCalledOnce();
    api.list.mockResolvedValueOnce([]); realtime!();
    await vi.waitFor(() => expect(h.render().records).toEqual([]));
    h.unmount(); cleanup = undefined; expect(api.removeChannel).toHaveBeenCalledOnce();
  });
  it('retains previous records on error and permits retry', async () => {
    const h = hookHarness(() => useSettlementRecords('t', 'b')); cleanup = h.unmount; h.render();
    await vi.waitFor(() => expect(h.render().hasLoaded).toBe(true));
    api.list.mockRejectedValueOnce(new Error('denied')); await h.render().reload();
    expect(h.render().records).toEqual([record]); expect(h.render().error).toContain('denied');
    await h.render().reload(); expect(h.render().error).toBeNull();
  });
  it('ignores old trip responses and local mutations invalidate pending reads', async () => {
    let finish!: (r: SettlementRecord[]) => void;
    api.list.mockImplementationOnce(() => new Promise<SettlementRecord[]>(resolve => { finish = resolve; }));
    let trip = 't';
    const h = hookHarness(() => useSettlementRecords(trip, 'b')); cleanup = h.unmount; h.render();
    trip = 'new'; api.list.mockResolvedValueOnce([]); h.render();
    await vi.waitFor(() => expect(h.render().hasLoaded).toBe(true));
    finish([record]); await Promise.resolve(); expect(h.render().records).toEqual([]);
    let stale!: (r: SettlementRecord[]) => void;
    api.list.mockImplementationOnce(() => new Promise<SettlementRecord[]>(resolve => { stale = resolve; }));
    void h.render().reload(); h.render().add({ ...record, trip_id: 'new' });
    stale([]); await Promise.resolve();
    expect(h.render().records).toHaveLength(1); expect(h.render().loading).toBe(false);
  });
  it('does not fetch or subscribe when another component supplies the shared state', () => {
    const h = hookHarness(() => useSettlementRecords('t', 'b', false)); cleanup = h.unmount; h.render();
    expect(api.list).not.toHaveBeenCalled(); expect(api.channel).not.toHaveBeenCalled();
  });
  it('ignores older realtime responses and responses finishing after unmount', async () => {
    const h = hookHarness(() => useSettlementRecords('t', 'b')); cleanup = h.unmount; h.render();
    await vi.waitFor(() => expect(h.render().hasLoaded).toBe(true));
    let finish!: (r: SettlementRecord[]) => void;
    api.list.mockImplementationOnce(() => new Promise<SettlementRecord[]>(r => { finish = r; })); realtime!();
    api.list.mockResolvedValueOnce([]); realtime!();
    await vi.waitFor(() => expect(h.render().records).toEqual([]));
    finish([record]); await Promise.resolve(); expect(h.render().records).toEqual([]);
    api.list.mockImplementationOnce(() => new Promise<SettlementRecord[]>(r => { finish = r; })); realtime!();
    h.unmount(); cleanup = undefined; finish([record]); await Promise.resolve();
    expect(h.render().records).toEqual([]);
  });
});
describe('personal summary keeps the original math and controls', () => {
  function setup() {
    let state = ready();
    const h = harness(() => BudgetDashboard({ tripId: 't', userId: 'b', expenses: [expense], members, rates: {}, themeMode: 'light', settlementState: state })); cleanup = h.unmount; h.render();
    return { ...h, setState: (next: Partial<typeof state>) => { state = { ...state, ...next }; } };
  }
  it('offers accessible 44px budget currency choices and saves the selected original currency', async () => {
    const h = setup(); press(h.render(), '展開預算與統計');
    expect(nodes(h.render()).find(n => n.type === 'button' && text(n) === 'JPY')!.props.disabled).toBe(true);
    await vi.waitFor(() => expect(nodes(h.render()).find(n => n.type === 'button' && text(n) === 'JPY')!.props.disabled).toBe(false));
    const button = nodes(h.render()).find(n => n.type === 'button' && text(n) === 'JPY')!;
    const style = Object.assign({}, ...[button.props.style].flat(Infinity).filter(Boolean));
    expect(style.minHeight).toBeGreaterThanOrEqual(44); expect(style.minWidth).toBeGreaterThanOrEqual(44);
    expect(button.props.accessibilityRole).toBe('radio'); expect(button.props.accessibilityLabel).toBe('預算幣別：JPY');
    button.props.onPress!();
    expect(nodes(h.render()).find(n => n.props.accessibilityLabel === '預算幣別：JPY')!.props.accessibilityState).toMatchObject({ checked: true });
    await vi.waitFor(() => expect(nodes(h.render()).find(n => n.props.accessibilityLabel === '儲存旅費預算')!.props.disabled).toBe(false));
    nodes(h.render()).find(n => n.type === 'input')!.props.onChangeText!('30000');
    await press(h.render(), '儲存旅費預算'); expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ currency: 'JPY', total_amount: 30000 }));
  });
  it('shows avatar and 17,833 remaining after the real partial settlement', () => {
    const h = setup();
    expect(text(h.render())).toContain('我的剩餘應付 TWD 17,833.00');
    expect(text(h.render())).toContain('整趟總支出');
    expect(nodes(h.render()).some(n => n.type === 'avatar' && n.props.userId === 'b')).toBe(true);
    expect(nodes(h.render()).some(n => n.type === 'settlement-card')).toBe(true);
    expect(api.list).not.toHaveBeenCalled();
  });
  it('never claims balanced during loading or a failed history read', () => {
    const h = setup(); h.setState({ records: [], loading: true, hasLoaded: false });
    expect(text(h.render())).toContain('正在確認結清紀錄');
    h.setState({ loading: false, error: '無法載入', hasLoaded: false });
    expect(text(h.render())).toContain('無法確認目前餘額');
    expect(text(h.render())).not.toContain('已平衡');
  });
  it('shows balanced after full clearance and budget saving remains available after expansion', async () => {
    const h = setup(); h.setState({ records: [{ ...record, amount: 18333 }] });
    expect(text(h.render())).toContain('已平衡');
    press(h.render(), '展開預算與統計');
    await vi.waitFor(() => expect(nodes(h.render()).find(n => n.props.accessibilityLabel === '儲存旅費預算')!.props.disabled).toBe(false));
    nodes(h.render()).find(n => n.type === 'input')!.props.onChangeText!('40000');
    await press(h.render(), '儲存旅費預算');
    expect(api.save).toHaveBeenCalledWith(expect.objectContaining({ total_amount: 40000 }));
  });
  it('preserves a typed budget draft and expanded state when settlement history refreshes', async () => {
    const h = setup(); press(h.render(), '展開預算與統計');
    await vi.waitFor(() => expect(nodes(h.render()).find(n => n.props.accessibilityLabel === '儲存旅費預算')!.props.disabled).toBe(false));
    nodes(h.render()).find(n => n.type === 'input')!.props.onChangeText!('45678');
    h.setState({ loading: true }); h.render();
    h.setState({ loading: false, records: [{ ...record, amount: 18333 }] });
    expect(nodes(h.render()).find(n => n.type === 'input')!.props.value).toBe('45678');
    expect(nodes(h.render()).some(n => n.type === 'settlement-card')).toBe(true);
  });
});
describe('expense list view controls', () => {
  function setup() {
    let props = { tripId: 't', userId: 'b', expenses: [expense, { ...expense, id: 'self', title: '自付餐費', category: '餐飲', splits: [{ user_id: 'a', amount: 36666 }] }], members, onEdit: vi.fn(), onDelete: vi.fn(), settlementState: ready(), focusedExpenseId: null as string | null, focusRequest: 0 };
    const h = harness(() => ExpenseList(props)); cleanup = h.unmount; h.render();
    return { ...h, setProps: (next: Partial<typeof props>) => { props = { ...props, ...next }; } };
  }
  const cards = (tree: React.ReactNode) => nodes(tree).filter(n => typeof n.props.nativeID === 'string').map(n => n.props.nativeID);
  it('gives each original expense action a distinct accessible target at least 44px', () => {
    const h = setup(); const edit = vi.fn(); h.setProps({ onEdit: edit });
    const card = nodes(h.render()).find(n => n.props.nativeID === 'expense-e')!;
    for (const [label, action] of [['編輯費用：住宿費', '編輯'], ['結清費用：住宿費', '結清此筆'], ['刪除費用：住宿費', '刪除']]) {
      const control = nodes(card).find(n => n.type === 'button' && text(n) === action)!;
      expect(control.props.accessibilityRole).toBe('button'); expect(control.props.accessibilityLabel).toBe(label);
      expect(control.props.accessibilityState).toMatchObject({ disabled: false });
      const style = Object.assign({}, ...[control.props.style].flat(Infinity).filter(Boolean));
      expect(style.minWidth).toBeGreaterThanOrEqual(44); expect(style.minHeight).toBeGreaterThanOrEqual(44);
      if (action === '編輯') control.props.onPress!();
    }
    expect(edit).toHaveBeenCalledExactlyOnceWith(expense);
  });
  it('does not present unconfirmed history as an empty outstanding balance', () => {
    const h = setup(); press(h.render(), '費用：待結清');
    h.setProps({ settlementState: { ...ready(), loading: true } });
    expect(cards(h.render())).toEqual([]);
    expect(text(h.render())).not.toContain('沒有符合篩選的費用');
    h.setProps({ settlementState: { ...ready(), error: 'offline' } });
    expect(text(h.render())).toContain('無法確認待結清費用');
    expect(text(h.render())).not.toContain('沒有符合篩選的費用');
  });
  it('reveals the same search target on every new search request without resetting ordinary filtering', () => {
    const h = setup();
    h.setProps({ focusedExpenseId: 'e', focusRequest: 1 }); h.render();
    press(h.render(), '費用類別：餐飲'); expect(cards(h.render())).toEqual(['expense-self']);
    h.setProps({ expenses: [expense, { ...expense, id: 'self', category: '餐飲' }] });
    expect(cards(h.render())).toEqual(['expense-self']);
    h.setProps({ focusRequest: 2 }); h.render();
    expect(cards(h.render())).toEqual(['expense-e', 'expense-self']);
  });
  it('combines filters, clears misses and does not affect original card actions', () => {
    const h = setup(); press(h.render(), '費用：與我有關'); press(h.render(), '費用：待結清');
    expect(cards(h.render())).toEqual(['expense-e']);
    press(h.render(), '費用類別：餐飲'); expect(text(h.render())).toContain('沒有符合篩選的費用');
    press(h.render(), '清除費用篩選'); expect(cards(h.render())).toHaveLength(2);
    expect(api.forExpense).not.toHaveBeenCalled();
  });
  it('reacts to refreshed records and clears filters for a search target or new trip', () => {
    const h = setup(); press(h.render(), '費用：待結清');
    h.setProps({ settlementState: { ...ready(), records: [{ ...record, amount: 18333 }] } });
    expect(cards(h.render())).toEqual([]);
    h.setProps({ focusedExpenseId: 'self' }); h.render(); expect(cards(h.render())).toHaveLength(2);
    press(h.render(), '費用類別：住宿'); h.setProps({ tripId: 'other', focusedExpenseId: null }); h.render(); expect(cards(h.render())).toHaveLength(2);
  });
});
