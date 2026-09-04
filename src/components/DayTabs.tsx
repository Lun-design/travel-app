import React from 'react'; import { Pressable, ScrollView, StyleSheet, Text, useColorScheme } from 'react-native';
import { getThemeForMode, type ThemeMode } from '@/lib/theme';

export function DayTabs({ days, selected, onChange, themeMode = 'system' }: { days: number[]; selected: number; onChange: (day: number) => void; themeMode?: ThemeMode }) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  return <ScrollView style={styles.scroller} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wrap}>{days.map((day) => { const active = day === selected; return <Pressable key={day} onPress={() => onChange(day)} style={[styles.tab, { backgroundColor: active ? theme.colors.primary : theme.colors.surfaceMuted }]}><Text style={{ color: active ? '#fff' : theme.colors.text, fontWeight: active ? '700' : '600' }}>Day {day}</Text></Pressable>; })}</ScrollView>;
}
const styles = StyleSheet.create({ scroller: { height: 52, flexGrow: 0, alignSelf: 'stretch', marginTop: 4, marginBottom: 6 }, wrap: { gap: 8, paddingVertical: 6, alignItems: 'center' }, tab: { height: 40, minWidth: 72, paddingHorizontal: 16, borderRadius: 20, alignItems: 'center', justifyContent: 'center' } });
