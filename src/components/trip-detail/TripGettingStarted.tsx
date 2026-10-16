import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { getAppTheme, type AppTheme } from '@/lib/theme';
export function TripGettingStarted({ isTripEmpty, isDayEmpty, day, theme = getAppTheme('light'), onAdd, onImport, onInvite }: {
  isTripEmpty: boolean; isDayEmpty: boolean; day: number; theme?: AppTheme; onAdd: () => void; onImport?: () => void; onInvite?: () => void;
}) {
  if (!isTripEmpty && !isDayEmpty) return null;
  return <View style={[styles.card, { backgroundColor: theme.colors.card }]}>
    <Text style={[styles.title, { color: theme.colors.text }]}>{isTripEmpty ? '從第一站，開始這趟旅程' : `Day ${day} 還有自由安排的空間`}</Text>
    <Text style={[styles.hint, { color: theme.colors.muted }]}>只需景點名稱就能加入，時間與其他細節可以稍後補上。</Text>
    <View style={styles.actions}>
      <Pressable accessibilityRole="button" accessibilityLabel={isTripEmpty ? '新增第一站' : '新增當日景點'} onPress={onAdd} style={[styles.button, { backgroundColor: theme.colors.primary }]}><Text style={{ color: '#FFF', fontWeight: '700' }}>{isTripEmpty ? '＋ 新增第一站' : '＋ 新增當日景點'}</Text></Pressable>
      {isTripEmpty && onImport ? <Pressable accessibilityRole="button" accessibilityLabel="匯入行程" onPress={onImport} style={[styles.button, { backgroundColor: theme.colors.surfaceMuted }]}><Text style={{ color: theme.colors.primary }}>匯入行程</Text></Pressable> : null}
      {isTripEmpty && onInvite ? <Pressable accessibilityRole="button" accessibilityLabel="邀請旅伴" onPress={onInvite} style={[styles.button, { backgroundColor: theme.colors.surfaceMuted }]}><Text style={{ color: theme.colors.primary }}>邀請旅伴</Text></Pressable> : null}
    </View>
  </View>;
}
const styles = StyleSheet.create({ card: { padding: 18, borderRadius: 16, marginVertical: 12, gap: 10 }, title: { fontSize: 18, fontWeight: '700' }, hint: { fontSize: 13, lineHeight: 20 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, button: { minHeight: 44, paddingHorizontal: 14, justifyContent: 'center', borderRadius: 22 } });
