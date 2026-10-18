import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { harness, nodes, text } from './helpers/interaction-harness';
import type { Expense } from '../lib/expenses-api';
import type { TripMemberWithProfile } from '../lib/trips';
vi.mock('react', async (original) => { const a = await original<typeof import('react') & { default: typeof React }>(); return { ...a, useState: (...args: Parameters<typeof React.useState>) => a.default.useState(...args) }; });
vi.mock('react-native', () => ({ View: 'div', Text: 'span', Pressable: 'button', Image: 'img', Alert: { alert: vi.fn() }, useColorScheme: () => 'light', StyleSheet: { create: (value: unknown) => value } }));
vi.mock('../lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/profiles', async () => import('../lib/profiles'));
vi.mock('@/lib/exchange-rates', async () => import('../lib/exchange-rates'));
vi.mock('@/lib/theme', async () => import('../lib/theme'));
vi.mock('@/lib/settlement-api', () => ({ settleExpense: vi.fn() }));
import { ExpenseList } from '../src/components/ExpenseList';
import { ProfileAvatar } from '../src/components/ProfileAvatar';
const members = [
  { user_id: 'alice', profile: { display_name: '可愛小白', avatar_url: 'https://example.test/alice.png' } },
  { user_id: 'bob', profile: { display_name: '超帥小白', avatar_url: null } },
] as TripMemberWithProfile[];
const expense = { id: 'e', trip_id: 't', payer_id: 'alice', title: 'USJ門票', amount: 4032, currency: 'TWD', category: '門票', created_at: '2026-10-19', splits: [{ user_id: 'alice', amount: 2016 }, { user_id: 'bob', amount: 2016 }] } satisfies Expense;
function setup(record: Expense) {
  const onEdit = vi.fn(), onDelete = vi.fn(async () => undefined);
  const h = harness(() => ExpenseList({ expenses: [record], members, onEdit, onDelete }));
  const shares = () => nodes(h.render()).find((node) => node.props.accessibilityLabel === '此筆分攤明細');
  return { h, shares, onEdit, onDelete };
}
describe('expense card member breakdown', () => {
  it('shows each member’s saved share with their own avatar and marks the payer', () => {
    const { h, shares } = setup(expense);
    try {
      const section = shares(); expect(section).toBeDefined();
      expect(text(section)).toContain('可愛小白'); expect(text(section)).toContain('超帥小白');
      expect(text(section).match(/TWD 2,016\.00/g)).toHaveLength(2);
      const avatars = nodes(section).filter((node) => node.type === ProfileAvatar);
      expect(avatars.map((node) => node.props.userId)).toEqual(['alice', 'bob']);
      expect(avatars[0].props.profile).toMatchObject({ avatar_url: 'https://example.test/alice.png' });
      expect(nodes(ProfileAvatar(avatars[0].props)).find((node) => node.type === 'img')?.props.source?.uri).toBe('https://example.test/alice.png');
      expect(text(ProfileAvatar(avatars[1].props))).toBe('超');
      expect(text(section).match(/墊付者/g)).toHaveLength(1);
    } finally { h.unmount(); }
  });
  it('uses unequal and zero saved shares in the original currency without redividing', () => {
    const record = { ...expense, currency: 'JPY', splits: [{ user_id: 'alice', amount: 4032 }, { user_id: 'bob', amount: 0 }] };
    const before = JSON.stringify(record); const { h, shares } = setup(record);
    try {
      expect(text(shares())).toContain('JPY 4,032.00'); expect(text(shares())).toContain('JPY 0.00');
      expect(text(shares())).not.toContain('2,016'); expect(JSON.stringify(record)).toBe(before);
    } finally { h.unmount(); }
  });
  it('retains settled expense shares without describing them as outstanding debt', () => {
    const { h, shares } = setup({ ...expense, is_settled: true });
    try {
      expect(text(h.render())).toContain('已結清'); expect(text(shares())).toContain('TWD 2,016.00');
      expect(text(shares())).not.toMatch(/尚欠|待付/);
    } finally { h.unmount(); }
  });
  it('supports absent profiles and does not invent splits for missing data', () => {
    const { h, shares } = setup({ ...expense, splits: [{ user_id: 'departed-member', amount: 4032 }] });
    try {
      expect(text(shares())).toContain('departed');
      const avatar = nodes(shares()).find((node) => node.type === ProfileAvatar)!;
      expect(text(ProfileAvatar(avatar.props))).toBe('D');
    } finally { h.unmount(); }
    const empty = setup({ ...expense, splits: undefined } as unknown as Expense);
    try { expect(text(empty.h.render())).toContain('尚未設定分攤明細'); }
    finally { empty.h.unmount(); }
  });
  it('shows an explicit unknown amount instead of NaN or a fabricated zero', () => {
    const { h, shares } = setup({ ...expense, splits: [{ user_id: 'bob', amount: null }] } as unknown as Expense);
    try { expect(text(shares())).toContain('金額待確認'); expect(text(shares())).not.toMatch(/NaN|0\.00/); }
    finally { h.unmount(); }
  });
  it('keeps editing and deleting wired to the original expense', async () => {
    const { h, onEdit, onDelete } = setup(expense);
    try {
      const buttons = nodes(h.render()).filter((node) => node.type === 'button');
      buttons.find((node) => text(node) === '編輯')!.props.onPress!();
      await buttons.find((node) => text(node) === '刪除')!.props.onPress!();
      expect(onEdit).toHaveBeenCalledWith(expense); expect(onDelete).toHaveBeenCalledWith(expense);
    } finally { h.unmount(); }
  });
});
