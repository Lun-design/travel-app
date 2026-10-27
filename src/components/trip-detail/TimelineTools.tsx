import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { AppTheme } from '@/lib/theme';
import { getTripJournalPalette } from '@/lib/trip-journal';

export function TimelineTools({ compact, scopeKey, theme, children }: { compact: boolean; scopeKey: string; theme: AppTheme; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  React.useEffect(() => setOpen(false), [scopeKey]);
  const expanded = !compact || open;
  const palette = getTripJournalPalette(theme);
  return <View style={styles.root}>
    {compact ? <Pressable accessibilityRole="button" accessibilityLabel={open ? '收合旅程工具' : '展開旅程工具'} accessibilityState={{ expanded }} style={[styles.toggle, { backgroundColor: palette.paper }]} onPress={() => setOpen(value => !value)}><Text style={{ color: palette.accentText, fontSize: 12, fontWeight: '600' }}>旅程工具 {open ? '⌃' : '⌄'}</Text><Text numberOfLines={1} style={{ color: palette.muted, fontSize: 11 }}>票券・旅途模式・地圖</Text></Pressable> : null}
    <View testID="timeline-tools-body" style={expanded ? styles.body : styles.hidden} pointerEvents={expanded ? 'auto' : 'none'} accessibilityElementsHidden={!expanded} importantForAccessibility={expanded ? 'auto' : 'no-hide-descendants'}>{children}</View>
  </View>;
}
const styles = StyleSheet.create({ root: { width: '100%', marginBottom: 8 }, toggle: { minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, borderRadius: 12 }, hidden: { display: 'none' }, body: { width: '100%' } });
