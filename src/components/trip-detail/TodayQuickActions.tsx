import React, { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { Trip } from '@/lib/trips';
import type { ItineraryItem } from '@/lib/itinerary';
import type { Voucher } from '@/lib/vouchers';
import { getDayVouchers, getTodayTripDay } from '@/lib/travel-ux';
import { getGoogleMapsNavigationUrl } from '@/lib/map-links';
import { EDITORIAL_COLORS } from '@/lib/theme';

export function TodayQuickActions({ trip, day, items, vouchers, onDayChange, onVoucher }: { trip: Trip; day: number; items: ItineraryItem[]; vouchers: Voucher[]; onDayChange: (day: number) => void; onVoucher: (voucher: Voucher) => void }) {
  const [now, setNow] = useState(() => new Date());
  const [error, setError] = useState('');
  useEffect(() => { const timer = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(timer); }, []);
  const today = getTodayTripDay(trip, now);
  const dayVouchers = getDayVouchers(trip, day, items, vouchers);
  const first = items.filter((item) => item.day_number === day && !item.is_backup).sort((a, b) => a.position - b.position)[0];
  if (today === null && !dayVouchers.length) return null;
  return <View style={styles.root}>
    <ScrollView horizontal contentContainerStyle={styles.row} showsHorizontalScrollIndicator={false}>
      {today !== null ? <Pressable accessibilityRole="button" style={styles.pill} onPress={() => onDayChange(today)}><Text style={styles.label}>{today === day ? '📅 今天的行程' : `📅 跳到今天 · Day ${today}`}</Text></Pressable> : null}
      {today === day && first ? <Pressable accessibilityRole="link" style={styles.pill} onPress={() => { void Linking.openURL(getGoogleMapsNavigationUrl(first)).catch(() => setError('無法開啟導航，請稍後再試。')); }}><Text style={styles.label}>🧭 首站導航</Text></Pressable> : null}
      {dayVouchers.map((voucher) => <Pressable key={voucher.id} accessibilityRole="button" accessibilityLabel={`查看當日票券 ${voucher.title}`} style={styles.pill} onPress={() => onVoucher(voucher)}><Text numberOfLines={1} style={styles.ticket}>🎫 {voucher.title}</Text></Pressable>)}
    </ScrollView>
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
  </View>;
}
const styles = StyleSheet.create({
  root: { marginVertical: 6 },
  row: { gap: 8, alignItems: 'center' },
  pill: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, backgroundColor: EDITORIAL_COLORS.sand, borderRadius: 22 },
  label: { fontSize: 12, color: EDITORIAL_COLORS.terracotta, fontWeight: '600' },
  ticket: { fontSize: 12, color: EDITORIAL_COLORS.taupe, maxWidth: 200 },
  error: { fontSize: 12, color: EDITORIAL_COLORS.dangerText },
});
