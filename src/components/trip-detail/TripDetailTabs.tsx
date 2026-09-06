import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AppTheme } from '@/lib/theme';
import { EDITORIAL_COLORS } from '@/lib/theme';

export type TripDetailTab = 'timeline' | 'expenses' | 'packing' | 'documents';
export const TRIP_DETAIL_TABS: { value: TripDetailTab; label: string }[] = [
  { value: 'timeline', label: '行程時間軸' },
  { value: 'expenses', label: '💰 旅費分帳' },
  { value: 'packing', label: '🧳 打包清單' },
  { value: 'documents', label: '🎫 預約與票券' },
];

export function TripDetailTabs({ value, onChange, theme }: { value: TripDetailTab; onChange: (value: TripDetailTab) => void; theme: AppTheme }) {
  return <View style={styles.tabShell}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroller} contentContainerStyle={[styles.tabs, { backgroundColor: theme.colors.tabTrack }]}>
      {TRIP_DETAIL_TABS.map((tab) => <Pressable key={tab.value} style={[styles.tab, tab.value === value && styles.active, { backgroundColor: tab.value === value ? theme.colors.surface : 'transparent' }]} onPress={() => onChange(tab.value)}><Text numberOfLines={1} style={[styles.label, { color: tab.value === value ? theme.colors.primary : theme.colors.muted }]}>{tab.label}</Text></Pressable>)}
    </ScrollView>
    <View pointerEvents="none" style={styles.tabScrollHint}><Text style={styles.hintText}>›</Text></View>
  </View>;
}

const styles = StyleSheet.create({
  tabShell: { width: '100%', minHeight: 44, height: 44, flexShrink: 0, position: 'relative', overflow: 'hidden', marginBottom: 7 },
  tabScroller: { width: '100%', minHeight: 44, height: 44, flexGrow: 0, flexShrink: 0 },
  tabs: { minWidth: '100%', minHeight: 44, height: 44, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 13, paddingVertical: 4, paddingRight: 4, paddingLeft: 12 },
  tabScrollHint: { position: 'absolute', top: 0, right: 0, bottom: 0, width: 30, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 5, backgroundColor: 'rgba(241, 238, 230, 0.94)' },
  hintText: { color: EDITORIAL_COLORS.taupe, fontSize: 23, fontWeight: '900', lineHeight: 24 },
  tab: { height: 36, flexGrow: 0, flexShrink: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10 },
  label: { lineHeight: 20, textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false },
  active: {},
});
