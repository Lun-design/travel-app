import React, { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import type { ItineraryItem } from '@/lib/itinerary';
import type { ScheduledItem } from '@/lib/schedule';
import { createMockWeatherSummary, fetchWeatherForecast, isWeatherAlert, type WeatherSummary } from '@/lib/weather-api';
import { tripDateForDay } from '@/lib/trip-dates';
import { getGoogleMapsDirectionsUrl } from '@/lib/map-links';
import { distanceToFocusSpot, findActiveOrNextSpot } from '@/lib/today-mode';
import type { Voucher } from '@/lib/vouchers';
import { EDITORIAL_COLORS, getThemeForMode, type ThemeMode } from '@/lib/theme';
import { OfflineRescueCardModal } from './OfflineRescueCardModal';

const categoryLabels: Record<string, string> = { spot: '景點', food: '美食', hotel: '住宿', flight: '航班', trail: '步道', outdoor: '戶外' };
const categoryIcons: Record<string, string> = { spot: '📍', food: '🍴', hotel: '🏨', flight: '✈️', trail: '🥾', outdoor: '🌲' };

type Props = {
  schedule: ScheduledItem[];
  items: ItineraryItem[];
  vouchers: Voucher[];
  scheduleDate: string | null;
  timezone?: string | null;
  themeMode?: ThemeMode;
  completedIds?: ReadonlySet<string>;
  onComplete?: (itemId: string) => void;
  onPreviewVoucher?: (voucher: Voucher) => void;
};

export function TodayFocusCard({ schedule, items, vouchers, scheduleDate, timezone, themeMode = 'system', completedIds, onComplete, onPreviewVoucher }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [now, setNow] = useState(() => new Date());
  const [weather, setWeather] = useState<WeatherSummary | null>(null);
  const [rescueVisible, setRescueVisible] = useState(false);
  const focus = useMemo(() => findActiveOrNextSpot(schedule, { scheduleDate, timezone, now, completedIds }), [completedIds, now, schedule, scheduleDate, timezone]);
  const focusItem = focus.scheduled ? items.find((item) => item.id === focus.scheduled?.item.id) ?? null : null;
  const focusDate = scheduleDate;
  const distanceKm = distanceToFocusSpot(focus.scheduled, schedule);
  const navigationUrl = getGoogleMapsDirectionsUrl(focusItem?.latitude, focusItem?.longitude);
  const itemVouchers = focusItem ? vouchers.filter((voucher) => voucher.item_id === focusItem.id) : [];

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let active = true;
    setWeather(null);
    if (!focusItem || !focusDate) return () => { active = false; };
    const latitude = focusItem.latitude == null ? null : Number(focusItem.latitude);
    const longitude = focusItem.longitude == null ? null : Number(focusItem.longitude);
    const request = latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude)
      ? fetchWeatherForecast(latitude, longitude, focusDate, timezone)
      : Promise.resolve(createMockWeatherSummary(focusDate));
    void request.then((result) => { if (active) setWeather(result); });
    return () => { active = false; };
  }, [focusDate, focusItem?.id, focusItem?.latitude, focusItem?.longitude, timezone]);

  function openNavigation() {
    if (!navigationUrl) return;
    void Linking.openURL(navigationUrl).catch(() => undefined);
  }

  const modeLabel = focus.mode === 'active' ? '目前進行中' : focus.mode === 'next' ? '下一站' : focus.mode === 'countdown' ? `距離旅程還有 ${focus.daysUntil ?? 0} 天` : focus.mode === 'complete' ? '今日行程已完成' : focus.mode === 'past' ? '此行程日期已結束' : '今日尚無排程';
  const canComplete = Boolean(focusItem && focus.scheduled && (focus.mode === 'active' || focus.mode === 'next'));
  const isCompleted = Boolean(focusItem && completedIds?.has(focusItem.id));

  return <>
    <View accessibilityLabel="今日模式焦點卡片" style={[styles.card, { backgroundColor: theme.colors.card, borderColor: theme.colors.border }]}>
      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { color: theme.colors.primary }]}>TODAY MODE</Text>
          <Text style={[styles.mode, { color: theme.colors.text }]}>{modeLabel}</Text>
        </View>
        {focusItem ? <Text style={[styles.category, { color: theme.colors.primary }]}>{categoryIcons[focusItem.category] ?? '📌'} {categoryLabels[focusItem.category] ?? focusItem.category}</Text> : null}
      </View>

      {focusItem && focus.scheduled ? <>
        <Text numberOfLines={2} style={[styles.name, { color: theme.colors.text }]}>{focusItem.location_name}</Text>
        <View style={styles.timeRow}>
          <View style={styles.timeBlock}><Text style={[styles.timeLabel, { color: theme.colors.muted }]}>預計抵達</Text><Text style={[styles.timeValue, { color: theme.colors.text }]}>{focus.scheduled.arrivalTime}</Text></View>
          <View style={styles.timeBlock}><Text style={[styles.timeLabel, { color: theme.colors.muted }]}>建議離開</Text><Text style={[styles.timeValue, { color: theme.colors.text }]}>{focus.scheduled.departureTime}</Text></View>
          <View style={styles.timeBlock}><Text style={[styles.timeLabel, { color: theme.colors.muted }]}>{focus.mode === 'active' ? '停留倒數' : '距離出發'}</Text><Text style={[styles.timeValue, { color: theme.colors.primary }]}>{formatMinutes(focus.mode === 'active' ? focus.minutesRemaining : focus.minutesUntil)}</Text></View>
        </View>
        {weather ? <View style={styles.weatherRow}><Text style={[styles.weather, { color: theme.colors.text }]}>{weather.icon} {formatTemperature(weather)} · {weather.condition}</Text>{weather.precipitationProbability !== null ? <Text style={[styles.rain, { color: weather.precipitationWarning ? theme.colors.warningText : theme.colors.primary }]}>☔ {Math.round(weather.precipitationProbability)}%{isWeatherAlert(weather) ? ' 預警' : ''}</Text> : null}</View> : <Text style={[styles.muted, { color: theme.colors.muted }]}>正在載入天氣…</Text>}
        <View style={styles.metaRow}><Text style={[styles.meta, { color: theme.colors.muted }]}>🧭 {distanceKm === null ? '距離上一站資料不足' : `距離上一站約 ${formatDistance(distanceKm)}`}</Text>{focusItem.address ? <Text numberOfLines={1} style={[styles.meta, styles.address, { color: theme.colors.muted }]}>{focusItem.address}</Text> : null}</View>
        <View style={styles.actions}>
          {navigationUrl ? <Pressable accessibilityRole="link" style={[styles.primaryButton, { backgroundColor: theme.colors.primary }]} onPress={openNavigation}><Text style={styles.primaryButtonText}>🧭 開啟地圖導航</Text></Pressable> : null}
          <Pressable accessibilityRole="button" style={[styles.secondaryButton, { borderColor: theme.colors.border }]} onPress={() => setRescueVisible(true)}><Text style={[styles.secondaryButtonText, { color: theme.colors.text }]}>🆘 離線備忘／救命卡</Text></Pressable>
          {canComplete ? <Pressable accessibilityRole="button" style={[styles.completeButton, { borderColor: theme.colors.border }]} onPress={() => focusItem && onComplete?.(focusItem.id)}><Text style={[styles.completeText, { color: theme.colors.primary }]}>{isCompleted ? '✓ 已完成' : '完成此站'}</Text></Pressable> : null}
        </View>
      </> : <Text style={[styles.emptyText, { color: theme.colors.muted }]}>先新增今天的第一個景點，Today Mode 會在這裡提醒你下一站。</Text>}
    </View>
    <OfflineRescueCardModal visible={rescueVisible} item={focusItem} vouchers={itemVouchers} onClose={() => setRescueVisible(false)} onPreviewVoucher={onPreviewVoucher} />
  </>;
}

function formatMinutes(value: number | null) {
  if (value === null) return '—';
  if (value < 60) return `${value} 分鐘`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours} 小時 ${minutes} 分` : `${hours} 小時`;
}

function formatDistance(value: number) { return value < 1 ? `${Math.round(value * 1000)} 公尺` : `${value.toFixed(1)} 公里`; }
function formatTemperature(weather: WeatherSummary) { const min = weather.temperatureMinC == null ? null : Math.round(weather.temperatureMinC); const max = weather.temperatureMaxC == null ? null : Math.round(weather.temperatureMaxC); if (min !== null && max !== null) return `${min}–${max}°C`; if (max !== null) return `${max}°C`; if (min !== null) return `${min}°C`; return '溫度未知'; }

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', borderWidth: 1, borderRadius: 16, padding: 16, marginBottom: 12, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  headerCopy: { flex: 1, minWidth: 0 },
  eyebrow: { fontSize: 12, fontWeight: '900', letterSpacing: 1.8 },
  mode: { fontSize: 16, fontWeight: '800', marginTop: 3 },
  category: { fontSize: 14, fontWeight: '800', flexShrink: 0 },
  name: { fontSize: 28, lineHeight: 34, fontWeight: '900' },
  timeRow: { flexDirection: 'row', gap: 10, flexWrap: 'wrap' },
  timeBlock: { minWidth: 90, flex: 1, padding: 10, borderRadius: 10, backgroundColor: EDITORIAL_COLORS.sand },
  timeLabel: { fontSize: 12, fontWeight: '700' },
  timeValue: { fontSize: 23, lineHeight: 29, fontWeight: '900', marginTop: 3 },
  weatherRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  weather: { fontSize: 15, fontWeight: '800', flexShrink: 1 },
  rain: { fontSize: 14, fontWeight: '900' },
  muted: { fontSize: 14, fontWeight: '700' },
  metaRow: { gap: 5 },
  meta: { fontSize: 14, fontWeight: '700' },
  address: { flexShrink: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primaryButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
  primaryButtonText: { color: EDITORIAL_COLORS.paper, fontSize: 14, fontWeight: '900' },
  secondaryButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
  secondaryButtonText: { fontSize: 14, fontWeight: '900' },
  completeButton: { minHeight: 48, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11 },
  completeText: { fontSize: 14, fontWeight: '900' },
  emptyText: { fontSize: 17, lineHeight: 25, fontWeight: '700' },
});
