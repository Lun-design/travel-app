import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { Trip, TripMemberWithProfile } from '@/lib/trips';
import type { AppTheme, ThemeMode } from '@/lib/theme';
import { PuppyMascot } from '@/components/PuppyMascot';
import { EDITORIAL_COLORS } from '@/lib/theme';

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
};

export function TripDetailHeader({ trip, members, userId, theme, themeMode, mascotSize, insets, onBack, onInvite, onThemeModeChange, onSettings }: Props) {
  const nextThemeMode = themeMode === 'light' ? 'dark' : themeMode === 'dark' ? 'system' : 'light';
  return <View style={[styles.header, { paddingTop: insets.top }]}>
    <View style={styles.titleRow}>
      <View style={styles.titleCopy}>
        <Pressable onPress={onBack}><Text style={styles.back}>‹ 返回我的行程</Text></Pressable>
        <Text style={[styles.title, { color: theme.colors.text }]}>{trip.title}</Text>
      </View>
      <PuppyMascot puppy="-11" size={mascotSize} style={styles.mascot} accessibilityLabel="旅程裝飾" />
    </View>
    <View style={styles.metaRow}>
      <View style={styles.dateBlock}><Text style={[styles.destination, { color: theme.colors.muted }]}>{trip.destination} · {trip.start_date} – {trip.end_date}</Text></View>
      <View style={styles.members}>{members.slice(0, 4).map((member, index) => <View key={member.user_id} style={[styles.avatar, { marginLeft: index ? -9 : 0, borderColor: theme.colors.background, backgroundColor: theme.colors.surfaceMuted }]}><Text style={[styles.avatarText, { color: theme.colors.primary }]}>{(member.profile?.display_name || member.user_id)[0].toUpperCase()}</Text></View>)}<Pressable style={[styles.invite, { backgroundColor: theme.colors.surfaceMuted }]} onPress={onInvite}><Text style={[styles.inviteText, { color: theme.colors.primary }]}>＋ 邀請</Text></Pressable></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`切換主題，目前為${themeMode === 'light' ? '明亮' : themeMode === 'dark' ? '暗黑' : '跟隨系統'}`} style={[styles.themeButton, { backgroundColor: theme.colors.surfaceMuted }]} onPress={() => onThemeModeChange(nextThemeMode)}><Text style={styles.themeIcon}>{themeMode === 'light' ? '☀️' : themeMode === 'dark' ? '🌙' : '📱'}</Text></Pressable>
      {trip.created_by === userId ? <Pressable style={[styles.settings, { backgroundColor: theme.colors.surfaceMuted }]} onPress={onSettings}><Text style={[styles.settingsText, { color: theme.colors.primary }]}>⚙️ 行程設定</Text></Pressable> : null}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  header: { width: '100%', maxWidth: '100%', gap: 12, marginBottom: 14, flexShrink: 0 },
  titleRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 0 },
  titleCopy: { flex: 1, minWidth: 0 },
  mascot: { flexShrink: 0 },
  metaRow: { width: '100%', flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, minWidth: 0 },
  dateBlock: { flex: 1, minWidth: 120 },
  back: { color: EDITORIAL_COLORS.terracotta, fontWeight: '700', marginBottom: 9, minHeight: 44, paddingVertical: 12 },
  title: { fontSize: 30, fontWeight: '800' },
  destination: {},
  members: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  avatar: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontWeight: '800' },
  invite: { marginLeft: 12, borderRadius: 13, paddingHorizontal: 12, paddingVertical: 9 },
  inviteText: { fontWeight: '700' },
  themeButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 18 },
  themeIcon: { fontSize: 17 },
  settings: { flexShrink: 0, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 },
  settingsText: { fontWeight: '700' },
});
