import React from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { Trip, TripMemberWithProfile } from '@/lib/trips';
import type { AppTheme, ThemeMode } from '@/lib/theme';
import { PuppyMascot } from '@/components/PuppyMascot';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import type { Profile } from '@/lib/profiles';
import { getProfileDisplayName } from '@/lib/profiles';
import { EDITORIAL_COLORS } from '@/lib/theme';
import { MemberProfileModal } from './MemberProfileModal';
import { MemberListModal } from './MemberListModal';

type Props = {
  trip: Trip;
  members: TripMemberWithProfile[];
  userId: string;
  theme: AppTheme;
  themeMode: ThemeMode;
  mascotSize: number;
  insets: EdgeInsets;
  onBack: () => void;
  onInvite: () => void;
  onThemeModeChange: (mode: ThemeMode) => void;
  onSettings: () => void;
  onShare?: () => void;
  onSearch?: () => void;
  profile?: Profile | null;
  onProfile: () => void;
  compact?: boolean;
};

const HEADER_AVATAR_LIMIT = 4;

export function TripDetailHeader({ trip, members, userId, theme, themeMode, mascotSize, insets, onBack, onInvite, onThemeModeChange, onSettings, onShare, onSearch, profile, onProfile, compact = false }: Props) {
  const [selectedMemberId, setSelectedMemberId] = React.useState<string | null>(null);
  const [menuOpen, setMenuOpen] = React.useState(false);
  const pendingAction = React.useRef<(() => void) | null>(null);
  React.useEffect(() => {
    pendingAction.current = null;
    setMenuOpen(false); setSelectedMemberId(null);
    return () => { pendingAction.current = null; };
  }, [trip.id, userId]);
  const selectedMember = members.find((member) => member.user_id === selectedMemberId) ?? null;
  const nextThemeMode = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'system' : 'light';
  function finishDismissal() {
    const action = pendingAction.current;
    pendingAction.current = null;
    action?.();
  }
  function act(action: () => void) {
    // iOS must finish dismissing its native controller before presenting another.
    if (Platform.OS === 'ios') pendingAction.current = action;
    setMenuOpen(false);
    if (Platform.OS !== 'ios') action();
  }
  function showMember(id: string) { act(() => setSelectedMemberId(id)); }
  return <View style={[styles.header, compact && styles.compactHeader, { paddingTop: insets.top }]}>
    <View style={styles.titleRow}>
      <Pressable accessibilityRole="button" accessibilityLabel="返回我的行程" style={styles.iconButton} onPress={onBack}><Text style={[styles.back, { color: theme.colors.primary }]}>‹</Text></Pressable>
      <View style={styles.titleCopy}>
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.title, { color: theme.colors.text }]}>{trip.title}</Text>
        <Text numberOfLines={1} ellipsizeMode="tail" style={[styles.destination, { color: theme.colors.muted }]}>{trip.destination} · {trip.start_date} – {trip.end_date}</Text>
      </View>
      {!compact ? <PuppyMascot puppy="-11" size={Math.min(mascotSize, 44)} style={styles.mascot} accessibilityLabel="旅程裝飾" /> : null}
      {onSearch ? <Pressable accessibilityRole="button" accessibilityLabel="搜尋此行程" style={[styles.iconButton, { backgroundColor: theme.colors.surfaceMuted }]} onPress={onSearch}><Text style={[styles.searchIcon, { color: theme.colors.primary }]}>⌕</Text></Pressable> : null}
      <Pressable accessibilityRole="button" accessibilityLabel="開啟行程選單" accessibilityState={{ expanded: menuOpen }} style={[styles.iconButton, { backgroundColor: theme.colors.surfaceMuted }]} onPress={() => setMenuOpen(true)}><Text style={[styles.searchIcon, { color: theme.colors.primary }]}>⋯</Text></Pressable>
    </View>
    <Modal testID="trip-management-menu" visible={menuOpen} transparent animationType="fade" onDismiss={finishDismissal} onRequestClose={() => setMenuOpen(false)}>
      {menuOpen ? <View style={styles.menuOverlay}>
        <Pressable accessibilityRole="button" accessibilityLabel="關閉行程選單背景" style={styles.backdrop} onPress={() => setMenuOpen(false)} />
        <View accessibilityViewIsModal style={[styles.menu, { backgroundColor: theme.colors.surface }]}>
          <View style={styles.menuHeading}><Text accessibilityRole="header" style={[styles.menuTitle, { color: theme.colors.text }]}>行程選單</Text><Pressable accessibilityRole="button" accessibilityLabel="關閉行程選單" style={styles.iconButton} onPress={() => setMenuOpen(false)}><Text style={{ color: theme.colors.text, fontSize: 22 }}>×</Text></Pressable></View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.menuContent}>
            <Text style={{ color: theme.colors.muted }}>{trip.destination} · {trip.start_date} – {trip.end_date}</Text>
            <Text style={[styles.menuLabel, { color: theme.colors.text }]}>旅伴（{members.length}）</Text>
            <View style={styles.members}>
              {members.slice(0, HEADER_AVATAR_LIMIT).map(member => <Pressable key={member.user_id} accessibilityRole="button" accessibilityLabel={`查看${getProfileDisplayName(member.profile, '旅伴')}的資料`} onPress={() => showMember(member.user_id)} style={styles.memberButton}><ProfileAvatar profile={member.profile} userId={member.user_id} size={34} /></Pressable>)}
              {members.length > HEADER_AVATAR_LIMIT ? <Pressable accessibilityRole="button" accessibilityLabel="查看全部旅伴" style={styles.memberButton} onPress={() => showMember('__all__')}><Text style={{ color: theme.colors.primary }}>＋{members.length - HEADER_AVATAR_LIMIT}</Text></Pressable> : null}
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="查看我的資料" style={styles.menuAction} onPress={() => act(() => members.some(member => member.user_id === userId) ? setSelectedMemberId(userId) : onProfile())}><ProfileAvatar profile={profile} userId={userId} size={28} /><Text style={{ color: theme.colors.text }}>我的資料</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="邀請旅伴" style={styles.menuAction} onPress={() => act(onInvite)}><Text style={{ color: theme.colors.primary }}>＋ 邀請旅伴</Text></Pressable>
            {onShare ? <Pressable accessibilityRole="button" accessibilityLabel="分享行程" style={styles.menuAction} onPress={() => act(onShare)}><Text style={{ color: theme.colors.primary }}>🔗 分享行程</Text></Pressable> : null}
            {trip.created_by === userId ? <Pressable accessibilityRole="button" accessibilityLabel="行程設定" style={styles.menuAction} onPress={() => act(onSettings)}><Text style={{ color: theme.colors.primary }}>⚙️ 行程設定</Text></Pressable> : null}
            <Pressable accessibilityRole="button" accessibilityLabel={`切換主題，目前為${themeMode === 'light' ? '明亮' : themeMode === 'dark' ? '暗黑' : '跟隨系統'}`} style={styles.menuAction} onPress={() => act(() => onThemeModeChange(nextThemeMode))}><Text style={{ color: theme.colors.text }}>{themeMode === 'light' ? '☀️ 明亮' : themeMode === 'dark' ? '🌙 暗黑' : '📱 跟隨系統'} · 切換主題</Text></Pressable>
          </ScrollView>
        </View>
      </View> : null}
    </Modal>
    <MemberProfileModal member={selectedMember} theme={theme} onClose={() => setSelectedMemberId(null)} onEdit={selectedMember?.user_id === userId ? () => { setSelectedMemberId(null); onProfile(); } : undefined} />
    <MemberListModal visible={selectedMemberId === '__all__'} members={members} theme={theme} onSelect={setSelectedMemberId} onClose={() => setSelectedMemberId(null)} />
  </View>;
}

const styles = StyleSheet.create({
  header: { width: '100%', maxWidth: '100%', marginBottom: 8, flexShrink: 0 },
  compactHeader: { marginBottom: 6 },
  titleRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0, minHeight: 56 },
  titleCopy: { flex: 1, minWidth: 0 },
  mascot: { flexShrink: 0, alignSelf: 'center', marginRight: 4 },
  iconButton: { width: 44, minHeight: 44, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 12 },
  searchIcon: { fontSize: 24, fontWeight: '700' },
  back: { color: EDITORIAL_COLORS.terracotta, fontWeight: '700', fontSize: 30 },
  title: { fontSize: 22, fontWeight: '800' },
  destination: { fontSize: 11, marginTop: 3 },
  members: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  memberButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  menuOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 },
  backdrop: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(31,31,31,.4)' },
  menu: { width: '100%', maxWidth: 440, maxHeight: '85%', borderRadius: 20, padding: 16 },
  menuHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  menuTitle: { fontSize: 20, fontWeight: '800' },
  menuLabel: { fontWeight: '700', marginTop: 8 },
  menuContent: { gap: 8, paddingBottom: 8 },
  menuAction: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10 },
});
