import React, { useEffect, useRef, useState } from 'react'; import { Pressable, ScrollView, StyleSheet, Text, useColorScheme } from 'react-native';
import { DAY_ACTIVE_COLOR, getThemeForMode, type ThemeMode } from '@/lib/theme';
import { tripDateForDay } from '@/lib/trip-dates';

type Props = { days: number[]; selected: number; onChange: (day: number) => void; themeMode?: ThemeMode; startDate?: string; accentColor?: string; dense?: boolean };

export function DayTabs({ days, selected, onChange, themeMode = 'system', startDate, accentColor, dense = false }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const scrollRef = useRef<ScrollView>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const selectedIndex = days.indexOf(selected);
  const dayCount = days.length;
  useEffect(() => {
    if (!dense || viewportWidth <= 0 || selectedIndex < 0) return;
    const tabCenter = selectedIndex * 88 + 40;
    scrollRef.current?.scrollTo({ x: Math.max(0, tabCenter - viewportWidth / 2), animated: true });
  }, [dayCount, dense, selectedIndex, viewportWidth]);
  return <ScrollView ref={scrollRef} onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)} accessibilityRole="tablist" accessibilityLabel="行程日期" style={[styles.scroller, dense && styles.denseScroller]} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.wrap, dense && styles.denseWrap]}>{days.map((day) => {
    const active = day === selected;
    const date = startDate ? tripDateForDay(startDate, day) : null;
    const dateValue = date ? new Date(`${date}T00:00:00Z`) : null;
    const weekday = dateValue && !Number.isNaN(dateValue.getTime()) ? new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(dateValue).toUpperCase() : `DAY ${day}`;
    const dateLabel = dateValue && !Number.isNaN(dateValue.getTime()) ? `${String(dateValue.getUTCMonth() + 1).padStart(2, '0')}/${String(dateValue.getUTCDate()).padStart(2, '0')}` : `DAY ${day}`;
    const activeColor = dense && theme.isDark ? theme.colors.primary : accentColor ?? DAY_ACTIVE_COLOR;
    const inactiveColor = dense ? theme.colors.muted : '#94A3B8';
    const activeTextColor = dense && theme.isDark ? theme.colors.background : '#FFFFFF';
    return <Pressable key={day} accessibilityRole="tab" accessibilityState={{ selected: active }} accessibilityLabel={`Day ${day} ${weekday} ${dateLabel}`} onPress={() => onChange(day)} style={[styles.tab, dense && styles.denseTab, { backgroundColor: active ? activeColor : 'transparent', borderColor: 'transparent', borderWidth: 0 }, active && styles.activeTab]}>{dense ? <><Text numberOfLines={1} style={{ color: active ? activeTextColor : inactiveColor, fontWeight: '800', fontSize: 13 }}>Day {day}</Text><Text numberOfLines={1} style={{ color: active ? activeTextColor : inactiveColor, fontSize: 10 }}>{dateLabel} {weekday}</Text></> : <><Text style={{ color: active ? '#FFFFFF' : inactiveColor, fontWeight: active ? '800' : '700', letterSpacing: 1.1, fontSize: 11 }}>{weekday}</Text><Text style={{ color: active ? '#FFFFFF' : inactiveColor, fontWeight: active ? '900' : '700', fontSize: 15 }}>{dateLabel}</Text><Text style={{ color: active ? '#FFFFFF' : inactiveColor, fontWeight: '600', fontSize: 9 }}>Day {day}</Text></>}</Pressable>;
  })}</ScrollView>;
}
const styles = StyleSheet.create({ scroller: { height: 78, flexGrow: 0, alignSelf: 'stretch', marginTop: 6, marginBottom: 8 }, denseScroller: { height: 68, marginTop: 0, marginBottom: 0 }, denseTab: { width: 80, minWidth: 80, height: 50, paddingHorizontal: 3, paddingVertical: 4 }, wrap: { gap: 8, paddingVertical: 6, alignItems: 'center' }, denseWrap: { paddingVertical: 4 }, tab: { height: 66, minWidth: 76, paddingHorizontal: 13, paddingVertical: 7, borderRadius: 12, borderWidth: 0, alignItems: 'center', justifyContent: 'center', gap: 2 }, activeTab: { shadowColor: '#1f1f1f', shadowOpacity: 0.1, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 } });
