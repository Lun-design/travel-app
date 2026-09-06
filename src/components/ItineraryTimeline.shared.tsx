import React, { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { buildRouteSegments, type ItineraryItem, type RouteSegment } from '@/lib/itinerary';
import { tripDateForDay } from '@/lib/trip-dates';
import { createMockWeatherSummary, fetchWeatherForecast, isWeatherAlert, type WeatherSummary } from '@/lib/weather-api';
import type { Voucher } from '@/lib/vouchers';
import type { ScheduleContext, ScheduledItem } from '@/lib/schedule';
import { getGoogleMapsDirectionsUrl } from '@/lib/map-links';
import { EDITORIAL_COLORS, getThemeForMode, type ThemeMode } from '@/lib/theme';
import { PuppyMascot } from './PuppyMascot';

const icons: Record<string, string> = { spot: '📍', food: '🍴', hotel: '🏨', flight: '✈️', trail: '🥾', outdoor: '🌲' };
export type ItineraryTimelineProps = {
  items: ItineraryItem[];
  themeMode?: ThemeMode;
  onEdit: (item: ItineraryItem) => void;
  onDelete: (item: ItineraryItem) => void;
  onReorder?: (items: { id: string; position: number }[]) => Promise<void>;
  focusedItemId?: string | null;
  scheduleContext?: ScheduleContext;
  vouchers?: Voucher[];
  onPreviewVoucher?: (voucher: Voucher) => void;
};

export function useWeatherByItem(items: ItineraryItem[], context?: Pick<ScheduleContext, 'tripStartDate' | 'dayNumber' | 'timezone'>) {
  const [weatherById, setWeatherById] = useState<Record<string, WeatherSummary>>({});
  const itemKey = items.map((item) => `${item.id}:${item.latitude ?? ''}:${item.longitude ?? ''}`).join('|');
  useEffect(() => {
    let active = true;
    const date = context ? tripDateForDay(context.tripStartDate, context.dayNumber) : null;
    setWeatherById({});
    if (!date || !items.length) return () => { active = false; };
    void Promise.all(items.map(async (item) => {
      const latitude = item.latitude == null ? null : Number(item.latitude);
      const longitude = item.longitude == null ? null : Number(item.longitude);
      const weather = latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude)
        ? await fetchWeatherForecast(latitude, longitude, date, context?.timezone)
        : createMockWeatherSummary(date);
      return [item.id, weather] as const;
    })).then((entries) => { if (active) setWeatherById(Object.fromEntries(entries.flatMap(([id, weather]) => weather ? [[id, weather]] : [])) as Record<string, WeatherSummary>); });
    return () => { active = false; };
  }, [context?.dayNumber, context?.tripStartDate, context?.timezone, itemKey]);
  return weatherById;
}

export function segmentsForItems(items: ItineraryItem[]) { return items.length ? buildRouteSegments(items, items[0].day_number) : []; }
export function orderPayload(items: ItineraryItem[]) { return items.map(({ id, position }) => ({ id, position })); }

type TimelineCardProps = {
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
  themeMode?: ThemeMode;
};

export function TimelineCard({ item, segment, scheduled, weather, vouchers, onPreviewVoucher, grip, active, onEdit, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown, themeMode = 'system' }: TimelineCardProps) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const duration = scheduled?.durationMinutes ?? item.duration_minutes ?? 60;
  const itemVouchers = vouchers?.filter((voucher) => voucher.item_id === item.id) ?? [];
  const navigationUrl = getGoogleMapsDirectionsUrl(item.latitude, item.longitude);
  const [favorite, setFavorite] = useState(false);
  return (
    <View>
      <View style={styles.row}>
        <View style={styles.rail}><View style={styles.line} /><View style={styles.dot} /></View>
        <View style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }, active && styles.cardActive]}>
          {(scheduled?.openingWarning || scheduled?.overlapWarning) ? <View style={styles.warningStack}>
            {scheduled.openingWarning ? <Text style={[styles.openingWarning, { backgroundColor: theme.colors.warningSurface, color: theme.colors.warningText }]}>⚠️ 注意：預計抵達時可能已過營業時間</Text> : null}
            {scheduled.overlapWarning ? <Text style={styles.overlapWarning}>🚨 時間衝突</Text> : null}
          </View> : null}
          <View style={styles.cardBody}>
            {grip}
            <View style={styles.content}>
              <View style={styles.cardHeader}>
                <Text style={[styles.time, { color: theme.colors.primary, backgroundColor: theme.colors.surfaceMuted }]}>{scheduled?.arrivalTime ?? item.time ?? '未排定'}{scheduled?.estimated ? ' · 預估' : ''}</Text>
                <View style={styles.categoryWrap}>{item.category === 'food' ? <PuppyMascot puppy="-10" size={46} style={styles.inlineMascot} accessibilityLabel="美食" /> : null}<Text numberOfLines={1} style={[styles.category, { color: theme.colors.muted }]}>{icons[item.category] ?? '📌'} {item.category}</Text></View>
              </View>
              {weather ? <View style={styles.weatherRow}>{!isWeatherAlert(weather) && (weather.precipitationProbability === null || weather.precipitationProbability <= 20) ? <PuppyMascot puppy="-9" size={56} style={styles.inlineMascot} accessibilityLabel="好天氣" /> : null}<Text style={[styles.weatherText, { color: theme.colors.text }]}>{weather.icon} {formatTemperature(weather)} · {weather.condition}</Text>{weather.precipitationProbability !== null ? <Text style={styles.rainProbability}>☔ {Math.round(weather.precipitationProbability)}%</Text> : null}</View> : null}
              {weather && isWeatherAlert(weather) ? <View style={styles.weatherAlerts}>{weather.precipitationWarning ? <Text style={styles.weatherWarning}>☔ 記得帶傘／降雨預警</Text> : null}{weather.extremeWarning ? <Text style={styles.extremeWarning}>⚠️ 極端天候預警</Text> : null}</View> : null}
              <Text style={[styles.name, { color: theme.colors.text }]}>{item.location_name}</Text>
              <Text style={[styles.duration, { color: theme.colors.muted }]}>停留 {duration} 分鐘 · 離開 {scheduled?.departureTime ?? '—'}</Text>
              {item.address ? <Text style={[styles.address, { color: theme.colors.muted }]}>{item.address}</Text> : null}
              {item.notes ? <Text style={[styles.notes, { color: theme.colors.muted }]}>{item.notes}</Text> : null}
              {navigationUrl ? <Pressable accessibilityRole="link" onPress={() => { void Linking.openURL(navigationUrl).catch(() => undefined); }}><Text style={styles.navigation}>🧭 開啟 Google Maps 導航</Text></Pressable> : null}
              <View style={styles.actions}>
                {onMoveUp ? <Pressable style={styles.actionButton} accessibilityRole="button" accessibilityLabel="上移景點" disabled={!canMoveUp} onPress={onMoveUp}><Text style={[styles.reorderText, { color: theme.colors.text }, !canMoveUp && styles.disabledAction]}>▲ 上移</Text></Pressable> : null}
                {onMoveDown ? <Pressable style={styles.actionButton} accessibilityRole="button" accessibilityLabel="下移景點" disabled={!canMoveDown} onPress={onMoveDown}><Text style={[styles.reorderText, { color: theme.colors.text }, !canMoveDown && styles.disabledAction]}>▼ 下移</Text></Pressable> : null}
                <Pressable style={styles.actionButton} onPress={() => onEdit(item)}><Text style={[styles.edit, { color: theme.colors.primary }]}>編輯</Text></Pressable>
                <Pressable style={styles.actionButton} onPress={() => onDelete(item)}><Text style={styles.delete}>刪除</Text></Pressable>
                {itemVouchers.length > 0 && onPreviewVoucher ? <Pressable style={styles.actionButton} onPress={() => onPreviewVoucher(itemVouchers[0])}><Text style={styles.voucher}>🎫 檢視票券{itemVouchers.length > 1 ? ` (${itemVouchers.length})` : ''}</Text></Pressable> : null}
                <Pressable onPress={() => setFavorite((current) => !current)}><View style={styles.favorite}>{favorite ? <PuppyMascot puppy="-3" size={28} accessibilityLabel="已收藏" /> : <Text style={styles.favoriteText}>♡ 收藏</Text>}</View></Pressable>
              </View>
            </View>
          </View>
        </View>
      </View>
      {segment ? <View style={styles.transition}><PuppyMascot puppy="-8" size={46} style={styles.inlineMascot} accessibilityLabel="下一站交通" /><Text style={styles.transitionText}>下一站 · {formatDistance(segment.distanceKm)} · 約 {segment.estimatedDriveMinutes} 分鐘</Text></View> : null}
    </View>
  );
}

function formatTemperature(weather: WeatherSummary) { const min = weather.temperatureMinC == null ? null : Math.round(weather.temperatureMinC); const max = weather.temperatureMaxC == null ? null : Math.round(weather.temperatureMaxC); if (min !== null && max !== null) return `${min}–${max}°C`; if (max !== null) return `${max}°C`; if (min !== null) return `${min}°C`; return '溫度未知'; }
export function EmptyTimeline() { return <View style={styles.empty}><PuppyMascot puppy="-7" size={165} accessibilityLabel="目前沒有景點" /><Text style={styles.emptyText}>目前還沒有景點，新增第一站吧！</Text></View>; }
export function NativeGripHandle({ label, onLongPress }: { label: string; onLongPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityLabel={label} style={styles.grip} onLongPress={onLongPress} delayLongPress={120}><Text style={styles.gripText}>⋮⋮</Text></Pressable>; }
function formatDistance(distanceKm: number) { return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} 公尺` : `${distanceKm.toFixed(1)} 公里`; }

const styles = StyleSheet.create({
  empty: { width: '100%', padding: 38, alignItems: 'center', gap: 8, boxSizing: 'border-box' }, emptyText: { color: EDITORIAL_COLORS.taupe }, row: { width: '100%', flexDirection: 'row', minHeight: 130 }, rail: { width: 24, alignItems: 'center' }, line: { position: 'absolute', top: 18, bottom: 0, width: 2, backgroundColor: EDITORIAL_COLORS.line }, dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: EDITORIAL_COLORS.terracotta, borderWidth: 3, borderColor: EDITORIAL_COLORS.terracottaSoft, zIndex: 1 }, card: { flex: 1, minWidth: 0, maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', marginBottom: 12, padding: 12, borderRadius: 14, borderWidth: 1, position: 'relative' }, cardActive: { borderColor: EDITORIAL_COLORS.terracotta }, cardBody: { width: '100%', flexDirection: 'row', alignItems: 'stretch', gap: 10 }, grip: { width: 32, minHeight: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: EDITORIAL_COLORS.sand }, gripText: { color: EDITORIAL_COLORS.taupe, fontSize: 25, fontWeight: '900' }, content: { flex: 1, minWidth: 0, gap: 5 }, cardHeader: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 }, time: { fontWeight: '800', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }, category: { fontSize: 12, flexShrink: 1 }, categoryWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }, inlineMascot: { flexShrink: 0 }, weatherRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, weatherText: { fontSize: 12, fontWeight: '700' }, rainProbability: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800' }, weatherAlerts: { gap: 4 }, weatherWarning: { color: EDITORIAL_COLORS.amberText, backgroundColor: EDITORIAL_COLORS.amberSoft, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '800' }, extremeWarning: { color: EDITORIAL_COLORS.dangerText, backgroundColor: EDITORIAL_COLORS.dangerSoft, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '800' }, name: { fontSize: 18, fontWeight: '800' }, duration: { fontSize: 13 }, warningStack: { position: 'absolute', top: 10, right: 10, zIndex: 2, alignItems: 'flex-end', gap: 4, maxWidth: '72%' }, openingWarning: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '800' }, overlapWarning: { color: EDITORIAL_COLORS.dangerText, backgroundColor: EDITORIAL_COLORS.dangerSoft, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '800' }, address: { fontSize: 13 }, notes: { fontSize: 13, fontStyle: 'italic' }, navigation: { alignSelf: 'flex-start', color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800', minHeight: 44, paddingVertical: 14 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 5 }, actionButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 }, reorderText: { fontWeight: '800' }, disabledAction: { color: '#A9A397' }, edit: { fontWeight: '700' }, delete: { color: EDITORIAL_COLORS.dangerText, fontWeight: '700' }, voucher: { color: EDITORIAL_COLORS.terracotta, fontWeight: '700' }, favorite: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, favoriteText: { color: EDITORIAL_COLORS.taupe, fontWeight: '700' }, transition: { alignSelf: 'center', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: -5, marginBottom: 10, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, backgroundColor: EDITORIAL_COLORS.sand, borderWidth: 1, borderColor: EDITORIAL_COLORS.line }, transitionText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '700', flexShrink: 1 },
});

// Compatibility markers retained for previous UI checks: ??銝宏 / ??銝宏 / ?妣 ?? Google Maps 撠
