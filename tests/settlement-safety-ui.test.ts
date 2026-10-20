import React from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { harness, nodes, text } from './helpers/interaction-harness';
import type { Expense } from '../lib/expenses-api';
import { SettlementPreviewChangedError, type SettlementRecord } from '../lib/settlement-api';
const api = vi.hoisted(() => ({ list: vi.fn(), settle: vi.fn(), create: vi.fn(), remove: vi.fn() }));
vi.mock('react', async (original) => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (...args: Parameters<typeof React.useState>) => a.default.useState(...args), useRef: (v: unknown) => a.default.useRef(v), useEffect: (...args: Parameters<typeof React.useEffect>) => a.default.useEffect(...args) }; });
vi.mock('react-native', () => ({ View: 'div', Text: 'span', TextInput: 'input', Modal: 'dialog', ScrollView: 'section', Pressable: 'button', Image: 'img', Share: { share: vi.fn() }, Alert: { alert: vi.fn() }, useColorScheme: () => 'light', StyleSheet: { create: (v: unknown) => v } }));
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/profiles', async () => import('../lib/profiles'));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
vi.mock('@/lib/exchange-rates', async () => import('../lib/exchange-rates'));
vi.mock('@/lib/settlement', async () => import('../lib/settlement'));
vi.mock('@/lib/settlement-api', async () => ({ ...await import('../lib/settlement-api'), listSettlementRecordsForExpense: api.list, settleExpense: api.settle, createSettlementRecord: api.create, deleteSettlementRecord: api.remove }));
vi.mock('../src/components/PuppyMascot', () => ({ PuppyMascot: 'mascot' }));
import { ExpenseList } from '../src/components/ExpenseList';
import { SettlementCard } from '../src/components/SettlementCard';
import { ProfileAvatar } from '../src/components/ProfileAvatar';

const expense: Expense = { id: 'e', trip_id: 't', payer_id: 'a', title: '住宿費', amount: 36666, currency: 'TWD', category: '住宿', created_at: '', splits: [{ user_id: 'a', amount: 18333 }, { user_id: 'b', amount: 18333 }] };
const record: SettlementRecord = { id: 'r', trip_id: 't', expense_id: 'e', from_user_id: 'b', to_user_id: 'a', amount: 500, currency: 'TWD', note: null, settled_by: 'b', settled_at: '2026-10-20T00:00:00Z' };
const members = [{ user_id: 'a', profile: { display_name: '小白', avatar_url: 'a.png' } }, { user_id: 'b', profile: { display_name: '旅伴', avatar_url: 'b.png' } }] as Parameters<typeof ExpenseList>[0]['members'];
// Expand only the stateless shared confirmation component. Keep hook components
// under the harness, and omit hidden native Modals just as the actual UI does.
function expand(node: React.ReactNode): React.ReactNode {
  if (Array.isArray(node)) return node.map(expand);
  if (!React.isValidElement<Record<string, unknown>>(node)) return node;
  if (node.type === 'dialog' && !node.props.visible) return null;
  if (typeof node.type === 'function' && node.type.name === 'ActionConfirmationModal') return expand((node.type as (p: Record<string, unknown>) => React.ReactNode)(node.props));
  return React.cloneElement(node, {}, expand(node.props.children as React.ReactNode));
}
function button(tree: React.ReactNode, label: string) {
  const found = nodes(expand(tree)).find((n) => n.type === 'button' && (n.props.accessibilityLabel === label || text(n) === label));
  if (!found?.props.onPress) throw new Error(`Missing button ${label}`);
  return found;
}
function click(tree: React.ReactNode, label: string) { const b = button(tree, label); if (b.props.disabled) throw new Error(`Disabled ${label}`); return b.props.onPress!(); }
function listHarness() {
  const onDelete = vi.fn(async () => undefined), onExpenseSettled = vi.fn(async () => undefined);
  let expenses = [expense], tripId = 't';
  const h = harness(() => ExpenseList({ expenses, members, tripId, userId: 'a', onEdit: vi.fn(), onDelete, onExpenseSettled })); h.render();
  return { h, onDelete, onExpenseSettled, setExpenses: (next: Expense[]) => { expenses = next; }, setTrip: (next: string) => { tripId = next; } };
}
beforeEach(() => { api.list.mockResolvedValue([record]); api.settle.mockResolvedValue({}); api.remove.mockResolvedValue(undefined); api.create.mockResolvedValue(record); });

describe('settlement touch targets', () => {
  it('keeps settlement and history deletion readable, roomy and confirmation-only', () => {
    const h = harness(() => SettlementCard({ tripId: 't', userId: 'b', members, settlements: [{ from: 'b', to: 'a', amount: 17833, currency: 'TWD' }], settlementRecords: [record], labelFor: id => id === 'a' ? '小白' : '旅伴' }));
    try {
      h.render();
      for (const label of ['標記為已結清', '刪除']) {
        const control = button(h.render(), label);
        expect(control.props.accessibilityLabel).toContain('旅伴'); expect(control.props.accessibilityLabel).toContain('小白');
        expect(control.props.accessibilityState).toMatchObject({ disabled: false });
        const style = Object.assign({}, ...[control.props.style].flat(Infinity).filter(Boolean));
        expect(style.minWidth).toBeGreaterThanOrEqual(44); expect(style.minHeight).toBeGreaterThanOrEqual(44);
      }
      click(h.render(), '標記為已結清'); expect(api.create).not.toHaveBeenCalled(); click(h.render(), '取消');
      click(h.render(), '刪除'); expect(api.remove).not.toHaveBeenCalled(); click(h.render(), '取消');
    } finally { h.unmount(); }
  });
});
describe('expense confirmation safety', () => {
  it('opens a partial-settlement preview with avatars without writing; cancel writes nothing', async () => {
    const { h } = listHarness();
    try {
      await click(h.render(), '結清此筆');
      expect(api.settle).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(text(expand(h.render()))).toContain('17,833.00'));
      const modal = nodes(expand(h.render())).find((n) => n.type === 'dialog');
      expect(text(modal)).toContain('不會實際轉帳');
      expect(nodes(modal).filter((n) => n.type === ProfileAvatar).map((n) => n.props.userId)).toEqual(expect.arrayContaining(['a', 'b']));
      click(h.render(), '取消'); expect(api.settle).not.toHaveBeenCalled();
    } finally { h.unmount(); }
  });
  it('confirms exactly once even when the same handler is called repeatedly', async () => {
    const { h, onExpenseSettled } = listHarness();
    try {
      await click(h.render(), '結清此筆'); await vi.waitFor(() => expect(button(h.render(), '確認記錄結清').props.disabled).toBe(false));
      const confirm = button(h.render(), '確認記錄結清').props.onPress!;
      await Promise.all([confirm(), confirm(), confirm()]);
      expect(api.settle).toHaveBeenCalledTimes(1); expect(onExpenseSettled).toHaveBeenCalledWith('e');
    } finally { h.unmount(); }
  });
  it('requires confirmation before deleting and keeps the original callback', async () => {
    const { h, onDelete } = listHarness();
    try {
      click(h.render(), '刪除'); expect(onDelete).not.toHaveBeenCalled();
      expect(text(expand(h.render()))).toContain('住宿費');
      click(h.render(), '取消'); expect(onDelete).not.toHaveBeenCalled();
      click(h.render(), '刪除'); const confirm = button(h.render(), '確認刪除費用').props.onPress!;
      await Promise.all([confirm(), confirm()]); expect(onDelete).toHaveBeenCalledExactlyOnceWith(expense);
    } finally { h.unmount(); }
  });
  it('keeps a failed submission visible and allows retry', async () => {
    api.settle.mockRejectedValueOnce(new Error('離線，請重試'));
    const { h } = listHarness();
    try {
      await click(h.render(), '結清此筆'); await click(h.render(), '確認記錄結清');
      expect(text(expand(h.render()))).toContain('離線，請重試');
      await click(h.render(), '確認記錄結清'); expect(api.settle).toHaveBeenCalledTimes(2);
    } finally { h.unmount(); }
  });
  it('does not enable settlement after preview load fails', async () => {
    api.list.mockRejectedValueOnce(new Error('預覽載入失敗'));
    const { h } = listHarness();
    try {
      await click(h.render(), '結清此筆');
      expect(button(h.render(), '確認記錄結清').props.disabled).toBe(true); expect(api.settle).not.toHaveBeenCalled();
      await click(h.render(), '重新載入預覽');
      expect(button(h.render(), '確認記錄結清').props.disabled).toBe(false);
    } finally { h.unmount(); }
  });
  it('ignores a cancelled preview finishing after switching trips', async () => {
    let finish!: (v: SettlementRecord[]) => void;
    api.list.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    const { h, setTrip } = listHarness();
    try {
      click(h.render(), '結清此筆'); click(h.render(), '取消'); setTrip('other'); h.render();
      finish([record]); await Promise.resolve(); await Promise.resolve();
      expect(nodes(expand(h.render())).some((n) => n.type === 'dialog')).toBe(false); expect(api.settle).not.toHaveBeenCalled();
    } finally { h.unmount(); }
  });
  it('requires a fresh confirmation when expense props change', async () => {
    const { h, setExpenses } = listHarness();
    try {
      await click(h.render(), '結清此筆');
      setExpenses([{ ...expense, splits: [{ user_id: 'a', amount: 18366 }, { user_id: 'b', amount: 18300 }] }]); h.render();
      await click(h.render(), '確認記錄結清');
      expect(api.settle).not.toHaveBeenCalled(); expect(text(expand(h.render()))).toContain('重新確認');
    } finally { h.unmount(); }
  });
  it('cannot confirm a changed expense using repeated clicks on the previous rendered confirmation', async () => {
    const { h, setExpenses, onDelete } = listHarness();
    try {
      click(h.render(), '刪除');
      const confirm = button(h.render(), '確認刪除費用').props.onPress!;
      setExpenses([{ ...expense, title: '更新後住宿費', amount: 40000 }]); h.render();
      await Promise.all([confirm(), confirm()]);
      expect(onDelete).not.toHaveBeenCalled(); expect(text(expand(h.render()))).toContain('重新確認');
    } finally { h.unmount(); }
  });
  it('updates a changed server preview but requires another explicit confirmation', async () => {
    api.settle.mockRejectedValueOnce(new SettlementPreviewChangedError([{ expense_id: 'e', from_user_id: 'b', to_user_id: 'a', amount: 17000, currency: 'TWD' }]));
    const { h } = listHarness();
    try {
      await click(h.render(), '結清此筆'); await click(h.render(), '確認記錄結清');
      expect(api.settle).toHaveBeenCalledTimes(1); expect(text(expand(h.render()))).toContain('17,000.00');
      expect(text(expand(h.render()))).toContain('重新確認');
      await click(h.render(), '確認記錄結清'); expect(api.settle).toHaveBeenCalledTimes(2);
    } finally { h.unmount(); }
  });
  it('does not retry a committed settlement when its parent refresh fails', async () => {
    const { h, onExpenseSettled } = listHarness(); onExpenseSettled.mockRejectedValueOnce(new Error('reload failed'));
    try {
      await click(h.render(), '結清此筆'); await click(h.render(), '確認記錄結清');
      expect(api.settle).toHaveBeenCalledTimes(1); expect(text(expand(h.render()))).toContain('已結清');
      expect(nodes(expand(h.render())).some((n) => n.type === 'dialog')).toBe(false);
    } finally { h.unmount(); }
  });
  it('does not leak an old changed-preview message into a different expense modal', async () => {
    const { h, setExpenses } = listHarness();
    try {
      await click(h.render(), '結清此筆');
      let finish!: (v: SettlementRecord[]) => void;
      api.list.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
      setExpenses([{ ...expense, amount: 40000 }]); h.render();
      const pending = click(h.render(), '確認記錄結清');
      click(h.render(), '取消');
      setExpenses([{ ...expense, id: 'other', title: '另一筆活動' }]); h.render();
      await click(h.render(), '結清此筆');
      finish([record]); await pending;
      const modal = nodes(expand(h.render())).find((node) => node.type === 'dialog');
      expect(text(modal)).toContain('另一筆活動'); expect(text(modal)).not.toContain('費用資料已更新');
    } finally { h.unmount(); }
  });
});
describe('settlement history safety', () => {
  it('confirms history deletion and explains that actual transfers are not reversed', async () => {
    const deleted = vi.fn();
    const h = harness(() => SettlementCard({ settlements: [], settlementRecords: [record], members, labelFor: (id) => id, tripId: 't', userId: 'a', onSettlementDeleted: deleted })); h.render();
    try {
      click(h.render(), '刪除'); expect(api.remove).not.toHaveBeenCalled();
      expect(text(expand(h.render()))).toContain('不會撤銷真實轉帳');
      click(h.render(), '取消'); expect(api.remove).not.toHaveBeenCalled();
      click(h.render(), '刪除'); const confirm = button(h.render(), '確認刪除結清紀錄').props.onPress!;
      await Promise.all([confirm(), confirm()]); expect(api.remove).toHaveBeenCalledExactlyOnceWith('r'); expect(deleted).toHaveBeenCalledWith('r');
    } finally { h.unmount(); }
  });
  it('guards the existing general settlement confirm against same-tick duplicate clicks', async () => {
    const h = harness(() => SettlementCard({ settlements: [{ from: 'b', to: 'a', amount: 100, currency: 'TWD' }], members, labelFor: (id) => id, tripId: 't', userId: 'a' })); h.render();
    try {
      click(h.render(), '標記為已結清');
      const confirm = button(h.render(), '確認結清').props.onPress!;
      await Promise.all([confirm(), confirm(), confirm()]); expect(api.create).toHaveBeenCalledTimes(1);
    } finally { h.unmount(); }
  });
  it('does not submit an updated general settlement using the previous rendered handler', async () => {
    let settlements = [{ from: 'b', to: 'a', amount: 100, currency: 'TWD' }];
    const h = harness(() => SettlementCard({ settlements, members, labelFor: (id) => id, tripId: 't', userId: 'a' })); h.render();
    try {
      click(h.render(), '標記為已結清'); const confirm = button(h.render(), '確認結清').props.onPress!;
      settlements = [{ ...settlements[0], amount: 200 }]; h.render();
      await Promise.all([confirm(), confirm()]); expect(api.create).not.toHaveBeenCalled();
      expect(text(expand(h.render()))).toContain('重新確認');
    } finally { h.unmount(); }
  });
  it('keeps a failed history deletion available for retry without removing it locally', async () => {
    api.remove.mockRejectedValueOnce(new Error('無法連線'));
    const deleted = vi.fn();
    const h = harness(() => SettlementCard({ settlements: [], settlementRecords: [record], members, labelFor: (id) => id, tripId: 't', userId: 'a', onSettlementDeleted: deleted })); h.render();
    try {
      click(h.render(), '刪除'); await click(h.render(), '確認刪除結清紀錄');
      expect(deleted).not.toHaveBeenCalled(); expect(text(expand(h.render()))).toContain('無法連線');
      await click(h.render(), '確認刪除結清紀錄'); expect(deleted).toHaveBeenCalledExactlyOnceWith('r');
    } finally { h.unmount(); }
  });
});
