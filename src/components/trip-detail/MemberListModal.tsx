import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { TripMemberWithProfile } from '@/lib/trips';
import type { AppTheme } from '@/lib/theme';
import { getProfileDisplayName } from '@/lib/profiles';
import { ProfileAvatar } from '@/components/ProfileAvatar';

export function MemberListModal({ visible, members, theme, onSelect, onClose }: { visible: boolean; members: TripMemberWithProfile[]; theme: AppTheme; onSelect: (id: string) => void; onClose: () => void }) {
  if (!visible) return null;
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable style={styles.dismiss} accessibilityLabel="關閉全部旅伴背景" onPress={onClose} />
      <ScrollView style={[styles.card, { backgroundColor: theme.colors.surface }]} contentContainerStyle={styles.content}>
        <View style={styles.heading}><Text style={[styles.title, { color: theme.colors.text }]}>全部旅伴 · {members.length} 人</Text><Pressable style={styles.close} accessibilityRole="button" accessibilityLabel="關閉全部旅伴" onPress={onClose}><Text style={{ color: theme.colors.muted, fontSize: 26 }}>×</Text></Pressable></View>
        {members.map((member) => <Pressable key={member.user_id} accessibilityRole="button" accessibilityLabel={`查看${getProfileDisplayName(member.profile, '旅伴')}的資料`} style={styles.row} onPress={() => onSelect(member.user_id)}>
          <ProfileAvatar profile={member.profile} userId={member.user_id} size={36} />
          <View style={styles.copy}><Text style={[styles.name, { color: theme.colors.text }]}>{getProfileDisplayName(member.profile, '旅伴')}</Text><Text style={{ fontSize: 12, color: theme.colors.muted }}>{member.role === 'owner' ? '行程主人' : '受邀成員'}</Text></View>
          <Text style={{ color: theme.colors.muted }}>›</Text>
        </Pressable>)}
      </ScrollView>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.4)' },
  dismiss: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
  card: { width: '100%', maxWidth: 420, maxHeight: '85%', flexGrow: 0, borderRadius: 24 },
  content: { padding: 20, gap: 10 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 20, fontWeight: '700' },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 6 },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  name: { fontSize: 15, fontWeight: '600' },
});
