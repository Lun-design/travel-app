import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AppTheme } from '@/lib/theme';
import { EDITORIAL_COLORS } from '@/lib/theme';
import { getTripJournalPalette } from '@/lib/trip-journal';

export type TripDetailTab = 'timeline' | 'expenses' | 'packing' | 'documents' | 'places';
export const TRIP_DETAIL_TABS: { value: TripDetailTab; label: string }[] = [
  { value: 'timeline', label: '行程時間軸' },
  { value: 'expenses', label: '💰 旅費分帳' },
  { value: 'packing', label: '🧳 打包清單' },
  { value: 'documents', label: '🎫 預約與票券' },
  { value: 'places', label: '💡 靈感收藏庫' },
];

export function TripDetailTabs({ value, onChange, theme }: { value: TripDetailTab; onChange: (value: TripDetailTab) => void; theme: AppTheme }) {
  const palette = getTripJournalPalette(theme);
  return <View style={styles.tabShell}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} accessibilityRole="tablist" accessibilityLabel="行程功能" style={styles.tabScroller} contentContainerStyle={[styles.tabs, { borderBottomColor: palette.line }]}>
      {TRIP_DETAIL_TABS.map((tab) => <Pressable key={tab.value} accessibilityRole="tab" accessibilityLabel={tab.label} accessibilityState={{ selected: tab.value === value }} style={[styles.tab, tab.value === value && styles.active, { borderBottomColor: tab.value === value ? palette.accent : 'transparent' }]} onPress={() => onChange(tab.value)}><Text numberOfLines={1} style={[styles.label, { color: tab.value === value ? palette.accentText : palette.muted, fontWeight: tab.value === value ? '700' : '500' }]}>{tab.label}</Text></Pressable>)}
    </ScrollView>
    <View pointerEvents="none" style={[styles.tabScrollHint, { backgroundColor: palette.page }]}><Text style={[styles.hintText, { color: palette.muted }]}>›</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  tabShell: { width: '100%', minHeight: 44, height: 44, flexShrink: 0, position: 'relative', overflow: 'hidden', marginBottom: 7 },
  tabScroller: { width: '100%', minHeight: 44, height: 44, flexGrow: 0, flexShrink: 0 },
  tabs: { minWidth: '100%', minHeight: 44, height: 44, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 1, paddingRight: 28, paddingLeft: 12 },
  tabScrollHint: { position: 'absolute', top: 0, right: 0, bottom: 0, width: 30, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 5, backgroundColor: 'rgba(241, 238, 230, 0.94)' },
  hintText: { color: EDITORIAL_COLORS.taupe, fontSize: 23, fontWeight: '900', lineHeight: 24 },
  tab: { height: 44, flexGrow: 0, flexShrink: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10, borderBottomWidth: 2 },
  label: { fontSize: 12, lineHeight: 20, textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false },
  active: {},
});
