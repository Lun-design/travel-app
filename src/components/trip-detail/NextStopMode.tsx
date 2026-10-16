import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { moveTravelCursor, stationVouchers, travelStops } from '@/lib/travel-mode';
import { getTimeContextLabel } from '@/lib/time-context';
import { getGoogleMapsNavigationUrl } from '@/lib/map-links';
import { getAppTheme, type AppTheme } from '@/lib/theme';
import type { ItineraryItem } from '@/lib/itinerary';
import type { Voucher } from '@/lib/vouchers';
export function NextStopMode({ tripId, day, timezone, items, vouchers, onVoucher, theme = getAppTheme('light') }: { tripId: string; day: number; timezone?: string; items: ItineraryItem[]; vouchers: Voucher[]; onVoucher: (voucher: Voucher) => void; theme?: AppTheme }) {
  const scope = `${tripId}:${day}`;
  const [cursor, setCursor] = useState<{ scope: string; id: string | null } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { setCursor(null); setError(''); }, [scope]);
  const stops = travelStops(items, tripId, day);
  const active = cursor?.scope === scope;
  const index = Math.max(0, stops.findIndex((v) => v.id === cursor?.id));
  const item = stops[index];
  if (!active) return <Pressable accessibilityRole="button" accessibilityLabel="開啟旅途模式" disabled={!stops.length} style={[styles.start, { backgroundColor: theme.colors.surfaceMuted }]} onPress={() => setCursor({ scope, id: stops[0]?.id ?? null })}><Text style={{ color: theme.colors.primary }}>{stops.length ? '🧭 開啟旅途模式 · 手動看下一站' : '當日尚無景點，可新增後開啟旅途模式'}</Text></Pressable>;
  return <View style={[styles.card, { backgroundColor: theme.colors.card }]}>
    <View style={styles.row}><Text style={[styles.heading, { color: theme.colors.text }]}>旅途模式 · {stops.length ? `${index + 1} / ${stops.length}` : '尚無景點'}</Text><Pressable accessibilityRole="button" accessibilityLabel="退出旅途模式" style={styles.button} onPress={() => setCursor(null)}><Text style={{ color: theme.colors.primary }}>退出 ×</Text></Pressable></View>
    {item ? <><Text style={[styles.title, { color: theme.colors.text }]}>{item.location_name}</Text><Text style={{ color: theme.colors.muted }}>{item.time ?? '時間未定'} · {getTimeContextLabel(item, timezone)}</Text><Text selectable style={{ color: theme.colors.muted }}>{item.address || '地址未填，可依景點名稱導航'}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="目前站點導航" style={[styles.button, { backgroundColor: theme.colors.surfaceMuted }]} onPress={() => { void Linking.openURL(getGoogleMapsNavigationUrl(item)).catch(() => setError('無法開啟導航，請稍後再試。')); }}><Text style={{ color: theme.colors.primary }}>開啟 Google Maps 導航</Text></Pressable>
      {stationVouchers(vouchers, tripId, item.id).map((v) => <Pressable key={v.id} accessibilityRole="button" accessibilityLabel={`出示票券 ${v.title}`} style={styles.button} onPress={() => onVoucher(v)}><Text style={{ color: theme.colors.primary }}>🎫 {v.title}</Text></Pressable>)}
    </> : <Text style={{ color: theme.colors.muted }}>當日尚無景點，可退出後繼續安排。</Text>}
    {error ? <Text accessibilityRole="alert" style={{ color: '#944B3C' }}>{error}</Text> : null}
    <View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel="上一站" disabled={!item || index === 0} style={[styles.button, (!item || index === 0) && styles.disabled]} onPress={() => { setCursor({ scope, id: moveTravelCursor(stops, item?.id ?? null, -1) }); setError(''); }}><Text style={{ color: theme.colors.primary }}>← 上一站</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="下一站" disabled={!item || index >= stops.length - 1} style={[styles.button, (!item || index >= stops.length - 1) && styles.disabled]} onPress={() => { setCursor({ scope, id: moveTravelCursor(stops, item?.id ?? null, 1) }); setError(''); }}><Text style={{ color: theme.colors.primary }}>{index >= stops.length - 1 ? '已是最後一站' : '下一站 →'}</Text></Pressable></View>
    <Text style={[styles.hint, { color: theme.colors.muted }]}>僅切換檢視，不會調整時間、排序或完成狀態。</Text>
  </View>;
}
const styles = StyleSheet.create({ start: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 22, justifyContent: 'center', alignSelf: 'flex-start', marginVertical: 6 }, card: { padding: 16, borderRadius: 16, gap: 10, marginVertical: 8 }, row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }, heading: { fontSize: 13, fontWeight: '700' }, title: { fontSize: 20, fontWeight: '700' }, button: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 22 }, disabled: { opacity: 0.4 }, hint: { fontSize: 12, lineHeight: 18 } });
