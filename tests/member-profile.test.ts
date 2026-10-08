import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { getAppTheme } from '../lib/theme';
import type { Trip, TripMemberWithProfile } from '../lib/trips';

vi.mock('react-native', () => ({
  View: 'div', Text: 'span', Pressable: 'button', ScrollView: 'section',
  Modal: 'dialog', StyleSheet: { create: (styles: unknown) => styles },
}));
vi.mock('@/components/PuppyMascot', () => ({ PuppyMascot: () => null }));
vi.mock('@/components/ProfileAvatar', () => ({ ProfileAvatar: () => null }));
vi.mock('@/lib/profiles', () => ({
  getProfileDisplayName: (profile: { display_name?: string; full_name?: string } | null, fallback: string) => profile?.display_name || profile?.full_name || fallback,
}));
vi.mock('@/lib/theme', async () => await import('../lib/theme'));
import { TripDetailHeader } from '../src/components/trip-detail/TripDetailHeader';
import { MemberProfileModal } from '../src/components/trip-detail/MemberProfileModal';

type ElementProps = { children?: React.ReactNode; accessibilityLabel?: string; onPress?: () => void; onClose?: () => void; member?: TripMemberWithProfile | null; onEdit?: () => void };
function elements(node: React.ReactNode): React.ReactElement<ElementProps>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!React.isValidElement<ElementProps>(node)) return [];
  return [node, ...elements(node.props.children)];
}
function textContent(node: React.ReactNode): string {
  if (Array.isArray(node)) return node.map(textContent).join(' ');
  if (React.isValidElement<ElementProps>(node)) return textContent(node.props.children);
  return typeof node === 'string' || typeof node === 'number' ? String(node) : '';
}
const trip = { id: 'trip', title: '大阪', created_by: 'owner' } as Trip;
const members: TripMemberWithProfile[] = ['owner', 'editor', 'viewer'].map((role) => ({
  trip_id: 'trip', user_id: role, role: role as TripMemberWithProfile['role'], joined_at: '2026-10-08T00:00:00Z',
  profile: { display_name: role, full_name: `${role} name`, email: `${role}@example.com`, avatar_url: null },
}));

describe('trip member avatar interactions', () => {
  it.each(['owner', 'editor', 'viewer'])('opens the correct member details for %s and closes again', (id) => {
    let selected: string | null = null;
    vi.spyOn(React, 'useState').mockImplementation(() => [selected, (value: unknown) => { selected = value as string | null; }] as ReturnType<typeof React.useState>);
    const onProfile = vi.fn();
    const render = () => TripDetailHeader({ trip, members, userId: 'owner', theme: getAppTheme('light'), themeMode: 'light', mascotSize: 40, insets: { top: 0, bottom: 0, left: 0, right: 0 }, onBack: vi.fn(), onInvite: vi.fn(), onThemeModeChange: vi.fn(), onSettings: vi.fn(), onProfile });
    const avatar = elements(render()).find((element) => element.props.accessibilityLabel === `查看${id}的資料`);
    expect(avatar?.props.onPress).toBeTypeOf('function');
    avatar!.props.onPress!();
    const modal = elements(render()).find((element) => element.props.member?.user_id === id);
    expect(modal?.props.member).toEqual(members.find((member) => member.user_id === id));
    if (id === 'owner') {
      modal!.props.onEdit!();
      expect(onProfile).toHaveBeenCalledOnce();
    } else expect(modal?.props.onEdit).toBeUndefined();
    modal!.props.onClose!();
    expect(selected).toBeNull();
  });
});

describe('member details presentation', () => {
  it.each([
    ['owner', '行程主人', '管理行程'],
    ['editor', '受邀成員', '可編輯行程'],
    ['viewer', '受邀成員', '僅可查看行程'],
  ])('shows profile data and the correct role for %s', (id, role, permission) => {
    const member = members.find((candidate) => candidate.user_id === id)!;
    const tree = MemberProfileModal({ member, theme: getAppTheme('light'), onClose: vi.fn() });
    const text = textContent(tree);
    expect(text).toContain(`${id} name`);
    expect(text).toContain(`${id}@example.com`);
    expect(text).toContain(role);
    expect(text).toContain(permission);
    expect(text).not.toContain('編輯個人檔案');
  });

  it('closes through both the X button and background, with safe missing profile values', () => {
    const onClose = vi.fn();
    const tree = MemberProfileModal({ member: { ...members[1], profile: null, joined_at: 'invalid' }, theme: getAppTheme('light'), onClose });
    expect(textContent(tree)).toContain('旅伴');
    expect(textContent(tree)).toContain('尚未提供');
    expect(textContent(tree)).not.toContain('Invalid Date');
    for (const label of ['關閉旅伴資料', '關閉旅伴資料背景']) {
      elements(tree).find((element) => element.props.accessibilityLabel === label)!.props.onPress!();
    }
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(MemberProfileModal({ member: null, theme: getAppTheme('light'), onClose })).toBeNull();
  });
});
