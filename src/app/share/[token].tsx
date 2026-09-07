import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { TripMap } from '@/components/TripMap';
import { PuppyMascot } from '@/components/PuppyMascot';
import { getThemeForMode } from '@/lib/theme';
import { getPublicTripByToken, type PublicTripPayload } from '@/lib/trip-share-api';
import { sortItineraryItemsByStartTime } from '@/lib/itinerary';

export default function PublicShareScreen() {
  const { token: rawToken } = useLocalSearchParams<{ token: string }>();
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  const theme = getThemeForMode('light', useColorScheme());
  const [payload, setPayload] = useState<PublicTripPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [day, setDay] = useState(1);

  useEffect(() => {
    let active = true;
    if (!token) { setLoading(false); setError('分享連結無效。'); return () => { active = false; }; }
    setLoading(true);
    void getPublicTripByToken(token).then((result) => {
      if (!active) return;
      setPayload(result);
      if (!result) setError('這個分享連結已失效或已被撤銷。');
      else setDay(Math.min(...(result.items.map((item) => item.day_number).filter((value) => value > 0)), 1));
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : '目前無法載入分享行程。'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token]);

  const days = useMemo(() => [...new Set((payload?.items ?? []).map((item) => item.day_number))].sort((a, b) => a - b), [payload?.items]);
  const visibleItems = useMemo(() => payload ? sortItineraryItemsByStartTime(payload.items.filter((item) => item.day_number === day)) : [], [day, payload]);

  if (loading) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><PuppyMascot puppy="-5" size={80} accessibilityLabel="載入分享行程" /><ActivityIndicator color={theme.colors.primary} /><Text style={{ color: theme.colors.muted }}>正在載入分享行程…</Text></View>;
  if (!payload) return <View style={[styles.center, { backgroundColor: theme.colors.background }]}><PuppyMascot puppy="-7" size={150} accessibilityLabel="沒有分享行程" /><Text style={[styles.errorTitle, { color: theme.colors.text }]}>找不到這份行程</Text><Text style={[styles.errorText, { color: theme.colors.muted }]}>{error}</Text></View>;

  return <ScrollView style={{ backgroundColor: theme.colors.background }} contentContainerStyle={styles.page}>
    <View style={styles.hero}><Text style={styles.eyebrow}>SHARED ITINERARY</Text><Text style={[styles.title, { color: theme.colors.text }]}>{payload.trip.title}</Text><Text style={[styles.destination, { color: theme.colors.muted }]}>{payload.trip.destination} · {payload.trip.start_date} – {payload.trip.end_date}</Text><Text style={[styles.readonly, { color: theme.colors.primary, backgroundColor: theme.colors.surfaceMuted }]}>唯讀分享</Text></View>
    <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={[styles.sectionTitle, { color: theme.colors.text }]}>行程時間軸</Text><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayTabs}>{(days.length ? days : [1]).map((dayNumber) => <Pressable key={dayNumber} onPress={() => setDay(dayNumber)} style={[styles.dayTab, { borderColor: dayNumber === day ? theme.colors.primary : theme.colors.border, backgroundColor: dayNumber === day ? theme.colors.primary : 'transparent' }]}><Text style={{ color: dayNumber === day ? '#FFFDF8' : theme.colors.text, fontWeight: '800' }}>Day {dayNumber}</Text></Pressable>)}</ScrollView><View style={styles.map}><TripMap items={payload.items} day={day} /></View>{visibleItems.length ? visibleItems.map((item, index) => <View key={item.id} style={[styles.item, { borderColor: theme.colors.border }]}><View style={styles.itemTop}><Text style={[styles.time, { color: theme.colors.primary }]}>{item.time ?? '待安排'}</Text><Text style={[styles.category, { color: theme.colors.muted }]}>{item.category}</Text></View><Text style={[styles.itemTitle, { color: theme.colors.text }]}>{index + 1}. {item.location_name}</Text>{item.address ? <Text style={[styles.address, { color: theme.colors.muted }]}>{item.address}</Text> : null}{item.notes ? <Text style={[styles.notes, { color: theme.colors.muted }]}>{item.notes}</Text> : null}</View>) : <Text style={[styles.empty, { color: theme.colors.muted }]}>這一天還沒有排入景點。</Text>}</View>
    {payload.share.include_expenses && payload.expenses.length ? <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}><Text style={[styles.sectionTitle, { color: theme.colors.text }]}>旅費摘要</Text>{payload.expenses.map((expense) => <View key={expense.id} style={styles.expenseRow}><Text style={{ color: theme.colors.text, flex: 1 }}>{expense.title || expense.category || '支出'}</Text><Text style={{ color: theme.colors.primary, fontWeight: '800' }}>{expense.currency} {expense.amount.toFixed(2)}</Text></View>)}</View> : null}
    <Text style={[styles.footer, { color: theme.colors.muted }]}>由「出遊由起來」製作 · 此頁面僅供查看</Text>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 760, alignSelf: 'center', padding: 20, paddingBottom: 60, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  hero: { paddingTop: 18, paddingBottom: 8, gap: 7 },
  eyebrow: { color: '#9A6A45', fontSize: 11, letterSpacing: 2, fontWeight: '800' },
  title: { fontSize: 34, fontWeight: '900', letterSpacing: -0.5 },
  destination: { fontSize: 15 },
  readonly: { alignSelf: 'flex-start', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, fontSize: 12, fontWeight: '800' },
  card: { width: '100%', borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 },
  sectionTitle: { fontSize: 20, fontWeight: '900' },
  dayTabs: { gap: 8, paddingVertical: 2 },
  dayTab: { minHeight: 40, justifyContent: 'center', borderWidth: 1, borderRadius: 20, paddingHorizontal: 15 },
  map: { width: '100%', height: 260, overflow: 'hidden', borderRadius: 12 },
  item: { width: '100%', borderBottomWidth: 1, paddingVertical: 12, gap: 5 },
  itemTop: { flexDirection: 'row', justifyContent: 'space-between', gap: 8 },
  time: { fontSize: 13, fontWeight: '900' },
  category: { fontSize: 12 },
  itemTitle: { fontSize: 18, fontWeight: '800' },
  address: { fontSize: 13, lineHeight: 19 },
  notes: { fontSize: 13, fontStyle: 'italic' },
  empty: { paddingVertical: 20, textAlign: 'center' },
  expenseRow: { flexDirection: 'row', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#E5E2D9' },
  footer: { textAlign: 'center', fontSize: 12, paddingTop: 4 },
  errorTitle: { fontSize: 22, fontWeight: '900' },
  errorText: { textAlign: 'center', lineHeight: 21 },
});
