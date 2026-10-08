import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { TripMemberWithProfile } from '@/lib/trips';
import type { AppTheme } from '@/lib/theme';
import { getProfileDisplayName } from '@/lib/profiles';
import { ProfileAvatar } from '@/components/ProfileAvatar';

type Props = {
  member: TripMemberWithProfile | null;
  theme: AppTheme;
  onClose: () => void;
  onEdit?: () => void;
};

export function MemberProfileModal({ member, theme, onClose, onEdit }: Props) {
  if (!member) return null;
  const joinedAt = new Date(member.joined_at);
  const fields = [
    ['姓名', member.profile?.full_name?.trim() || '尚未提供'],
    ['Email', member.profile?.email?.trim() || '尚未提供'],
    ['行程權限', member.role === 'owner' ? '管理行程' : member.role === 'editor' ? '可編輯行程' : '僅可查看行程'],
    ['加入日期', Number.isNaN(joinedAt.getTime()) ? '尚未提供' : joinedAt.toLocaleDateString('zh-TW')],
  ];
  return <Modal transparent visible animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable style={styles.dismiss} onPress={onClose} accessibilityRole="button" accessibilityLabel="關閉旅伴資料背景" />
      <ScrollView style={[styles.card, { backgroundColor: theme.colors.surface }]} contentContainerStyle={styles.content}>
        <View style={styles.header}><Text style={[styles.heading, { color: theme.colors.text }]}>旅伴資料</Text><Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="關閉旅伴資料" style={styles.close}><Text style={[styles.closeText, { color: theme.colors.muted }]}>×</Text></Pressable></View>
        <View style={styles.identity}>
          <ProfileAvatar profile={member.profile} userId={member.user_id} size={80} />
          <Text style={[styles.name, { color: theme.colors.text }]}>{getProfileDisplayName(member.profile, '旅伴')}</Text>
          <Text style={[styles.role, { backgroundColor: theme.colors.surfaceMuted, color: theme.colors.primary }]}>{member.role === 'owner' ? '行程主人' : '受邀成員'}</Text>
        </View>
        {fields.map(([label, value]) => <View key={label} style={styles.field}><Text style={[styles.label, { color: theme.colors.muted }]}>{label}</Text><Text selectable style={[styles.value, { color: theme.colors.text }]}>{value}</Text></View>)}
        {onEdit ? <Pressable onPress={onEdit} accessibilityRole="button" style={[styles.edit, { backgroundColor: theme.colors.primary }]}><Text style={styles.editText}>編輯個人檔案</Text></Pressable> : null}
      </ScrollView>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.4)' },
  dismiss: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  card: { width: '100%', maxWidth: 420, maxHeight: '85%', flexGrow: 0, borderRadius: 24 },
  content: { padding: 24, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heading: { fontSize: 20, fontWeight: '700' },
  close: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 28 },
  identity: { alignItems: 'center', gap: 10, paddingBottom: 8 },
  name: { fontSize: 22, fontWeight: '700', textAlign: 'center' },
  role: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 5, fontSize: 12, fontWeight: '600', overflow: 'hidden' },
  field: { gap: 4 },
  label: { fontSize: 12 },
  value: { fontSize: 15 },
  edit: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 12, padding: 12 },
  editText: { color: '#FFF', fontWeight: '700' },
});
