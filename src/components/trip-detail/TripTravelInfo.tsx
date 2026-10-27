import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppTheme } from '@/lib/theme';

/** Display-only disclosure: keep data panels mounted while they are folded. */
export function TripTravelInfo({ theme, preparation, shortcuts }: {
  theme: AppTheme; preparation: React.ReactNode; shortcuts: (expandRequest: number) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState(0);
  return <View style={styles.container}>
    <View style={styles.toolbar}>
      <Pressable accessibilityRole="button" accessibilityLabel={open ? '收合旅程資訊' : '展開旅程資訊'} accessibilityState={{ expanded: open }} style={[styles.toggle, { backgroundColor: theme.colors.surfaceMuted }]} onPress={() => setOpen(value => !value)}><Text style={{ color: theme.colors.primary, fontWeight: '700' }}>旅程資訊 {open ? '⌃' : '⌄'}</Text><Text style={{ color: theme.colors.muted, fontSize: 11 }}>行前準備・重要地址</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="快速查看住宿與集合資訊" style={styles.quick} onPress={() => { setOpen(true); setRequest(value => value + 1); }}><Text style={{ color: theme.colors.primary }}>住宿／集合 ↗</Text></Pressable>
    </View>
    <View testID="trip-travel-info-body" style={!open ? styles.hidden : styles.body} pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>
      {preparation}
      {shortcuts(request)}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  container: { width: '100%', marginVertical: 4 },
  toolbar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  toggle: { minHeight: 44, paddingHorizontal: 12, paddingVertical: 5, borderRadius: 12, justifyContent: 'center', gap: 2 },
  quick: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  hidden: { display: 'none' }, body: { gap: 4 },
});
