import React from 'react'; import { Pressable, ScrollView, StyleSheet, Text, useColorScheme } from 'react-native';
import { getThemeForMode, type ThemeMode } from '@/lib/theme';
import { tripDateForDay } from '@/lib/trip-dates';

type Props = { days: number[]; selected: number; onChange: (day: number) => void; themeMode?: ThemeMode; startDate?: string; accentColor?: string };

export function DayTabs({ days, selected, onChange, themeMode = 'system', startDate, accentColor }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  return <ScrollView style={styles.scroller} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.wrap}>{days.map((day) => {
    const active = day === selected;
    const date = startDate ? tripDateForDay(startDate, day) : null;
    const dateValue = date ? new Date(`${date}T00:00:00Z`) : null;
    const weekday = dateValue && !Number.isNaN(dateValue.getTime()) ? new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(dateValue).toUpperCase() : `DAY ${day}`;
    const dateLabel = dateValue && !Number.isNaN(dateValue.getTime()) ? `${String(dateValue.getUTCMonth() + 1).padStart(2, '0')}/${String(dateValue.getUTCDate()).padStart(2, '0')}` : `DAY ${day}`;
    const activeColor = accentColor ?? theme.colors.primary;
    return <Pressable key={day} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={`Day ${day} ${weekday} ${dateLabel}`} onPress={() => onChange(day)} style={[styles.tab, { backgroundColor: active ? activeColor : theme.colors.surfaceMuted, borderColor: active ? activeColor : theme.colors.border }, active && styles.activeTab]}><Text style={{ color: active ? theme.colors.surface : theme.colors.text, fontWeight: active ? '800' : '700', letterSpacing: 1.1, fontSize: 11 }}>{weekday}</Text><Text style={{ color: active ? theme.colors.surface : theme.colors.text, fontWeight: active ? '900' : '700', fontSize: 15 }}>{dateLabel}</Text><Text style={{ color: active ? theme.colors.surface : theme.colors.muted, fontWeight: '600', fontSize: 9 }}>Day {day}</Text></Pressable>;
  })}</ScrollView>;
}
const styles = StyleSheet.create({ scroller: { height: 78, flexGrow: 0, alignSelf: 'stretch', marginTop: 6, marginBottom: 8 }, wrap: { gap: 8, paddingVertical: 6, alignItems: 'center' }, tab: { height: 66, minWidth: 76, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 2 }, activeTab: { shadowColor: '#1f1f1f', shadowOpacity: 0.12, shadowRadius: 5, shadowOffset: { width: 0, height: 2 }, elevation: 2 } });
