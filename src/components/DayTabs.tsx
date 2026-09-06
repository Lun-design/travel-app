import React from 'react'; import { Pressable, ScrollView, StyleSheet, Text, useColorScheme } from 'react-native';
import { getThemeForMode, type ThemeMode } from '@/lib/theme';

export function DayTabs({ days, selected, onChange, themeMode = 'system' }: { days: number[]; selected: number; onChange: (day: number) => void; themeMode?: ThemeMode }) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  return <ScrollView style={styles.scroller} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wrap}>{days.map((day) => { const active = day === selected; return <Pressable key={day} onPress={() => onChange(day)} style={[styles.tab, { backgroundColor: active ? theme.colors.primary : theme.colors.surfaceMuted, borderColor: active ? theme.colors.primary : theme.colors.border }]}><Text style={{ color: active ? theme.colors.surface : theme.colors.text, fontWeight: active ? '700' : '600', letterSpacing: 0.2 }}>Day {day}</Text></Pressable>; })}</ScrollView>;
}
const styles = StyleSheet.create({ scroller: { height: 56, flexGrow: 0, alignSelf: 'stretch', marginTop: 6, marginBottom: 8 }, wrap: { gap: 8, paddingVertical: 6, alignItems: 'center' }, tab: { height: 44, minWidth: 72, paddingHorizontal: 16, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' } });
