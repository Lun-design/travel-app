import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { buildRouteSegments, type ItineraryItem, type RouteSegment } from '@/lib/itinerary';
import { tripDateForDay } from '@/lib/trip-dates';
import { createMockWeatherSummary, fetchWeatherForecast, isWeatherAlert, type WeatherSummary } from '@/lib/weather-api';
import type { Voucher } from '@/lib/vouchers';
import type { ScheduleContext, ScheduledItem } from '@/lib/schedule';
import { getGoogleMapsDirectionsUrl } from '@/lib/map-links';
import { PuppyMascot } from './PuppyMascot';

const icons: Record<string, string> = { spot: '📍', food: '🍜', hotel: '🛏️', flight: '✈️', trail: '🥾', outdoor: '🌲' };

export type ItineraryTimelineProps = {
  items: ItineraryItem[];
  onEdit: (item: ItineraryItem) => void;
  onDelete: (item: ItineraryItem) => void;
  onReorder?: (items: { id: string; position: number }[]) => Promise<void>;
  focusedItemId?: string | null;
  scheduleContext?: ScheduleContext;
  vouchers?: Voucher[];
  onPreviewVoucher?: (voucher: Voucher) => void;
};

/** Load one cached daily weather summary per located item without blocking the timeline. */
export function useWeatherByItem(items: ItineraryItem[], context?: Pick<ScheduleContext, 'tripStartDate' | 'dayNumber'>) {
  const [weatherById, setWeatherById] = useState<Record<string, WeatherSummary>>({});
  const itemKey = items.map((item) => `${item.id}:${item.latitude ?? ''}:${item.longitude ?? ''}`).join('|');

  useEffect(() => {
    let active = true;
    const date = context ? tripDateForDay(context.tripStartDate, context.dayNumber) : null;
    const weatherItems = date ? items : [];
    setWeatherById({});
    if (!date || !weatherItems.length) return () => { active = false; };

    void Promise.all(weatherItems.map(async (item) => {
      const latitude = item.latitude === null || item.latitude === undefined ? null : Number(item.latitude);
      const longitude = item.longitude === null || item.longitude === undefined ? null : Number(item.longitude);
      const weather = latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude)
        ? await fetchWeatherForecast(latitude, longitude, date)
        : createMockWeatherSummary(date);
      return [item.id, weather] as const;
    })).then((entries) => {
      if (!active) return;
      setWeatherById(Object.fromEntries(entries.flatMap(([id, weather]) => weather ? [[id, weather]] : [])) as Record<string, WeatherSummary>);
    });

    return () => { active = false; };
  }, [context?.dayNumber, context?.tripStartDate, itemKey]);

  return weatherById;
}

export function segmentsForItems(items: ItineraryItem[]) {
  return items.length ? buildRouteSegments(items, items[0].day_number) : [];
}

export function orderPayload(items: ItineraryItem[]) {
  return items.map(({ id, position }) => ({ id, position }));
}

export function TimelineCard({ item, segment, scheduled, weather, vouchers, onPreviewVoucher, grip, active, onEdit, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: {
  item: ItineraryItem;
  segment?: RouteSegment;
  scheduled?: ScheduledItem;
  weather?: WeatherSummary;
  vouchers?: Voucher[];
  onPreviewVoucher?: (voucher: Voucher) => void;
  grip: React.ReactNode;
  active?: boolean;
  onEdit: (item: ItineraryItem) => void;
  onDelete: (item: ItineraryItem) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  const duration = scheduled?.durationMinutes ?? item.duration_minutes ?? 60;
  const itemVouchers = vouchers?.filter((voucher) => voucher.item_id === item.id) ?? [];
  const navigationUrl = getGoogleMapsDirectionsUrl(item.latitude, item.longitude);
  const [favorite, setFavorite] = useState(false);
  return <View>
    <View style={styles.row}>
      <View style={styles.rail}><View style={styles.line} /><View style={styles.dot} /></View>
      <View style={[styles.card, active && styles.cardActive]}>
        {(scheduled?.openingWarning || scheduled?.overlapWarning) ? <View style={styles.warningStack}>
          {scheduled.openingWarning ? <Text style={styles.openingWarning}>⚠️ 抵達時景點可能已休息</Text> : null}
          {scheduled.overlapWarning ? <Text style={styles.overlapWarning}>❌ 行程時間重疊</Text> : null}
        </View> : null}
        <View style={styles.cardBody}>
          {grip}
          <View style={styles.content}>
            <View style={styles.cardHeader}>
              <Text style={styles.time}>{scheduled?.arrivalTime ?? item.time ?? '未設定'}{scheduled?.estimated ? ' · 推算' : ''}</Text>
              <View style={styles.categoryWrap}>{item.category === 'food' ? <PuppyMascot puppy="-10" size={46} style={styles.inlineMascot} accessibilityLabel="美食景點" /> : null}<Text numberOfLines={1} style={styles.category}>{icons[item.category] ?? '📌'} {item.category}</Text></View>
            </View>
            {weather ? <View style={styles.weatherRow}>
              {!isWeatherAlert(weather) && (weather.precipitationProbability === null || weather.precipitationProbability <= 20) ? <PuppyMascot puppy="-9" size={56} style={styles.inlineMascot} accessibilityLabel="適合出遊" /> : null}
              <Text style={styles.weatherText}>{weather.icon} {formatTemperature(weather)} · {weather.condition}</Text>
              {weather.precipitationProbability !== null ? <Text style={styles.rainProbability}>降雨 {Math.round(weather.precipitationProbability)}%</Text> : null}
            </View> : null}
            {weather && isWeatherAlert(weather) ? <View style={styles.weatherAlerts}>
              {weather.precipitationWarning ? <Text style={styles.weatherWarning}>☔ 記得帶傘 / 降雨預警</Text> : null}
              {weather.extremeWarning ? <Text style={styles.extremeWarning}>⚠️ 極端天候預警</Text> : null}
            </View> : null}
            <Text style={styles.name}>{item.location_name}</Text>
            <Text style={styles.duration}>⏱ 停留 {duration} 分鐘 · 離開 {scheduled?.departureTime ?? '—'}</Text>
            {item.address ? <Text style={styles.address}>{item.address}</Text> : null}
            {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
            {navigationUrl ? <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(navigationUrl).catch(() => undefined); }}><Text style={styles.navigation}>🧭 開啟 Google Maps 導航</Text></Pressable> : null}
            <View style={styles.actions}>{onMoveUp ? <Pressable accessibilityRole="button" accessibilityLabel="上移景點" disabled={!canMoveUp} onPress={onMoveUp}><Text style={[styles.reorderText, !canMoveUp && styles.disabledAction]}>▲ 上移</Text></Pressable> : null}{onMoveDown ? <Pressable accessibilityRole="button" accessibilityLabel="下移景點" disabled={!canMoveDown} onPress={onMoveDown}><Text style={[styles.reorderText, !canMoveDown && styles.disabledAction]}>▼ 下移</Text></Pressable> : null}<Pressable onPress={() => onEdit(item)}><Text style={styles.edit}>編輯</Text></Pressable><Pressable onPress={() => onDelete(item)}><Text style={styles.delete}>刪除</Text></Pressable>{itemVouchers.length > 0 && onPreviewVoucher ? <Pressable onPress={() => onPreviewVoucher(itemVouchers[0])}><Text style={styles.voucher}>🎫 檢視票券{itemVouchers.length > 1 ? ` (${itemVouchers.length})` : ''}</Text></Pressable> : null}<Pressable onPress={() => setFavorite((current) => !current)}><View style={styles.favorite}>{favorite ? <PuppyMascot puppy="-3" size={28} accessibilityLabel="已收藏景點" /> : <Text style={styles.favoriteText}>♡ 收藏</Text>}</View></Pressable></View>
          </View>
        </View>
      </View>
    </View>
    {segment ? <View style={styles.transition}><PuppyMascot puppy="-8" size={46} style={styles.inlineMascot} accessibilityLabel="下一站交通" /><Text style={styles.transitionText}>下一站 {formatDistance(segment.distanceKm)} · 車程約 {segment.estimatedDriveMinutes} 分鐘</Text></View> : null}
  </View>;
}

function formatTemperature(weather: WeatherSummary) {
  const min = weather.temperatureMinC === null ? null : Math.round(weather.temperatureMinC);
  const max = weather.temperatureMaxC === null ? null : Math.round(weather.temperatureMaxC);
  if (min !== null && max !== null) return `${min}–${max}°C`;
  if (max !== null) return `${max}°C`;
  if (min !== null) return `${min}°C`;
  return '氣溫未明';
}

export function EmptyTimeline() {
  return <View style={styles.empty}><PuppyMascot puppy="-7" size={165} accessibilityLabel="尚未安排景點" /><Text style={styles.emptyText}>這一天還沒有安排景點。</Text></View>;
}

export function NativeGripHandle({ label, onLongPress }: { label: string; onLongPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} style={styles.grip} onLongPress={onLongPress} delayLongPress={120}>
    <Text style={styles.gripText}>⠿</Text>
  </Pressable>;
}

function formatDistance(distanceKm: number) {
  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} 公尺` : `${distanceKm.toFixed(1)} 公里`;
}

const styles = StyleSheet.create({
  empty: { width: '100%', maxWidth: '100%', boxSizing: 'border-box', padding: 38, alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 28 },
  emptyText: { color: '#64748b' },
  row: { width: '100%', maxWidth: '100%', flexDirection: 'row', minHeight: 130 },
  rail: { width: 24, alignItems: 'center' },
  line: { position: 'absolute', top: 18, bottom: 0, width: 2, backgroundColor: '#dbeafe' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#2563eb', borderWidth: 3, borderColor: '#dbeafe', zIndex: 1 },
  card: { flex: 1, minWidth: 0, maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', marginBottom: 12, padding: 12, borderRadius: 15, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', position: 'relative' },
  cardActive: { backgroundColor: '#eff6ff', borderColor: '#60a5fa', shadowColor: '#0f172a', shadowOpacity: 0.16, shadowRadius: 12, elevation: 5 },
  cardBody: { width: '100%', maxWidth: '100%', flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  grip: { width: 32, minHeight: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#e2e8f0' },
  gripText: { color: '#64748b', fontSize: 25, fontWeight: '900' },
  content: { flex: 1, minWidth: 0, gap: 5 },
  cardHeader: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
  time: { color: '#2563eb', fontWeight: '800' },
  category: { color: '#64748b', fontSize: 12, flexShrink: 1 },
  categoryWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
  inlineMascot: { flexShrink: 0 },
  weatherRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  weatherText: { color: '#334155', fontSize: 12, fontWeight: '700' },
  rainProbability: { color: '#2563eb', fontSize: 12, fontWeight: '800' },
  weatherAlerts: { gap: 4 },
  weatherWarning: { alignSelf: 'flex-start', color: '#075985', backgroundColor: '#e0f2fe', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '800' },
  extremeWarning: { alignSelf: 'flex-start', color: '#9a3412', backgroundColor: '#ffedd5', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '800' },
  name: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  duration: { color: '#475569', fontSize: 13 },
  warningStack: { position: 'absolute', top: 10, right: 10, zIndex: 2, alignItems: 'flex-end', gap: 4, maxWidth: '72%' },
  openingWarning: { alignSelf: 'flex-start', color: '#92400e', backgroundColor: '#fef3c7', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '800' },
  overlapWarning: { alignSelf: 'flex-start', color: '#991b1b', backgroundColor: '#fee2e2', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '800' },
  address: { color: '#64748b', fontSize: 13 },
  notes: { color: '#475569', fontSize: 13, fontStyle: 'italic' },
  navigation: { alignSelf: 'flex-start', color: '#1d4ed8', fontSize: 12, fontWeight: '800', paddingVertical: 2 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 5 },
  reorderText: { color: '#475569', fontWeight: '800' },
  disabledAction: { color: '#cbd5e1' },
  edit: { color: '#2563eb', fontWeight: '700' },
  delete: { color: '#dc2626', fontWeight: '700' },
  voucher: { color: '#7c3aed', fontWeight: '700' },
  favorite: { minWidth: 48, alignItems: 'center', justifyContent: 'center' },
  favoriteText: { color: '#64748b', fontWeight: '700' },
  transition: { alignSelf: 'center', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: -5, marginBottom: 10, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  transitionIcon: { fontSize: 13 },
  transitionText: { color: '#1d4ed8', fontSize: 12, fontWeight: '700', flexShrink: 1 },
});
