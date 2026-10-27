import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppTheme } from '@/lib/theme';
import { getTripJournalPalette } from '@/lib/trip-journal';
import { PuppyMascot } from '@/components/PuppyMascot';

/** Display-only disclosure: keep data panels mounted while they are folded. */
export function TripTravelInfo({ theme, preparation, shortcuts }: {
  theme: AppTheme; preparation: React.ReactNode; shortcuts: (expandRequest: number) => React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState(0);
  const palette = getTripJournalPalette(theme);
  return <View style={styles.container}>
    <View style={[styles.toolbar, { backgroundColor: palette.soft }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={open ? '收合旅程資訊' : '展開旅程資訊'} accessibilityState={{ expanded: open }} style={styles.toggle} onPress={() => setOpen(value => !value)}><View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><PuppyMascot puppy="journal-reading" size={44} /></View><View style={styles.toggleCopy}><Text numberOfLines={1} style={{ color: palette.ink, fontWeight: '600', fontSize: 12 }}>旅程資訊 {open ? '⌃' : '⌄'}</Text><Text numberOfLines={1} style={{ color: palette.mutedOnSoft, fontSize: 10 }}>行前準備・重要地址</Text></View></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="快速查看住宿與集合資訊" style={styles.quick} onPress={() => { setOpen(true); setRequest(value => value + 1); }}><Text style={{ color: palette.accentText, fontSize: 12, fontWeight: '600' }}>住宿／集合 ↗</Text></Pressable>
    </View>
    <View testID="trip-travel-info-body" style={!open ? styles.hidden : styles.body} pointerEvents={open ? 'auto' : 'none'} accessibilityElementsHidden={!open} importantForAccessibility={open ? 'auto' : 'no-hide-descendants'}>
      {preparation}
      {shortcuts(request)}
    </View>
  </View>;
}
const styles = StyleSheet.create({
  container: { width: '100%', marginVertical: 4 },
  toolbar: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6, borderRadius: 12, marginBottom: 4 },
  toggle: { flex: 1, minWidth: 0, minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 6 },
  toggleCopy: { flex: 1, minWidth: 0, gap: 2 },
  quick: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  hidden: { display: 'none' }, body: { gap: 4 },
});
