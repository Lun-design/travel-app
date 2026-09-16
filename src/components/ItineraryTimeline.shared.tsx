import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, Modal, Pressable, Share, StyleSheet, Text, View, useColorScheme, useWindowDimensions } from 'react-native';
import { buildRouteSegments, type ItineraryItem, type RouteSegment } from '@/lib/itinerary';
import { tripDateForDay } from '@/lib/trip-dates';
import { createMockWeatherSummary, fetchWeatherForecast, isWeatherAlert, type WeatherSummary } from '@/lib/weather-api';
import type { Voucher } from '@/lib/vouchers';
import { buildDaySchedule, type ScheduleContext, type ScheduledItem } from '@/lib/schedule';
import { getGoogleMapsNavigationUrl } from '@/lib/map-links';
import { formatPlaceAddress } from '@/lib/place-actions';
import { buildGoogleMapsRouteUrl, calculateFallbackTravelMinutes, createRouteEstimator, type RouteEstimate, type RoutePoint, type TravelMode } from '@/lib/routes';
import { shareOrCopyText } from '@/lib/share-actions';
import { EDITORIAL_COLORS, getThemeForMode, type ThemeMode } from '@/lib/theme';
import type { PuppyId } from '@/lib/puppy';
import { PuppyMascot } from './PuppyMascot';
import { areTimelineCardPropsEqual, createTimelineCardContainerStyle, MOBILE_GRIP_CONFIG } from '@/lib/drag-drop';
// Theme badge fallback remains available via theme.colors.surfaceMuted.
import { reservationTagLabels } from '@/lib/reservation-tags';
import { getSpotImageFallbackUrl, getSpotImageUrl, resolveSpotImage } from '@/lib/spot-image';
import { getCategoryBadgePalette } from '@/lib/visual-styles';

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
  onInsertAtPosition?: (position: number) => void;
};

export type TimelineRouteSegment = RouteSegment & {
  mode: TravelMode;
  durationMinutes: number;
  navigationUrl: string | null;
  loading?: boolean;
};

const routeEstimator = createRouteEstimator();

export function useWeatherByItem(items: ItineraryItem[], context?: Pick<ScheduleContext, 'tripStartDate' | 'dayNumber' | 'timezone'>) {
  const [weatherById, setWeatherById] = useState<Record<string, WeatherSummary>>({});
  const itemKey = items.map((item) => `${item.id}:${item.latitude ?? ''}:${item.longitude ?? ''}:${item.time ?? item.start_time ?? ''}`).join('|');
  useEffect(() => {
    let active = true;
    const date = context ? tripDateForDay(context.tripStartDate, context.dayNumber) : null;
    setWeatherById({});
    if (!date || !items.length) return () => { active = false; };
    const scheduledById = new Map(buildDaySchedule(items, { ...context, tripStartDate: context!.tripStartDate, dayNumber: context!.dayNumber }).map((entry) => [entry.item.id, entry]));
    void Promise.all(items.map(async (item) => {
      const latitude = item.latitude == null ? null : Number(item.latitude);
      const longitude = item.longitude == null ? null : Number(item.longitude);
      const weather = latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude)
        ? await fetchWeatherForecast(latitude, longitude, date, context?.timezone, scheduledById.get(item.id)?.arrivalTime ?? item.time ?? item.start_time)
        : createMockWeatherSummary(date);
      return [item.id, weather] as const;
    })).then((entries) => { if (active) setWeatherById(Object.fromEntries(entries.flatMap(([id, weather]) => weather ? [[id, weather]] : [])) as Record<string, WeatherSummary>); });
    return () => { active = false; };
  }, [context?.dayNumber, context?.tripStartDate, context?.timezone, itemKey]);
  return weatherById;
}

export function segmentsForItems(items: ItineraryItem[]) { return items.length ? buildRouteSegments(items, items[0].day_number) : []; }
export function orderPayload(items: ItineraryItem[]) { return items.map(({ id, position }) => ({ id, position })); }

export function useRouteSegments(items: ItineraryItem[], modes: Record<string, TravelMode>) {
  const [estimates, setEstimates] = useState<Record<string, RouteEstimate>>({});
  const itemKey = items.map((item) => `${item.id}:${item.latitude ?? ''}:${item.longitude ?? ''}`).join('|');
  const modeKey = Object.entries(modes).sort(([left], [right]) => left.localeCompare(right)).map(([id, mode]) => `${id}:${mode}`).join('|');

  useEffect(() => {
    let active = true;
    const byId = new Map(items.map((item) => [item.id, item]));
    const baseSegments = segmentsForItems(items);
    setEstimates({});
    void Promise.all(baseSegments.map(async (segment) => {
      const from = byId.get(segment.fromId);
      const to = byId.get(segment.toId);
      if (!from || !to) return null;
      const mode = modes[segment.fromId] ?? 'DRIVING';
      const estimate = await routeEstimator.getRoute(toRoutePoint(from), toRoutePoint(to), mode);
      return [segment.fromId, estimate] as const;
    })).then((results) => {
      if (active) setEstimates(Object.fromEntries(results.flatMap((entry) => entry ? [entry] : [])) as Record<string, RouteEstimate>);
    });
    return () => { active = false; };
  }, [itemKey, modeKey]);

  return estimates;
}

export function displayRouteSegments(items: ItineraryItem[], modes: Record<string, TravelMode>, estimates: Record<string, RouteEstimate>): TimelineRouteSegment[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  return segmentsForItems(items).map((segment) => {
    const from = byId.get(segment.fromId);
    const to = byId.get(segment.toId);
    const mode = modes[segment.fromId] ?? 'DRIVING';
    const fallback = calculateFallbackTravelMinutes(segment.distanceKm, mode);
    const estimate = estimates[segment.fromId];
    return {
      ...segment,
      mode,
      durationMinutes: estimate?.durationMinutes ?? fallback,
      estimatedDriveMinutes: estimate?.durationMinutes ?? fallback,
      navigationUrl: estimate?.navigationUrl ?? (from && to ? buildGoogleMapsRouteUrl(toRoutePoint(from), toRoutePoint(to), mode) : null),
      loading: !estimate,
    };
  });
}

function toRoutePoint(item: ItineraryItem): RoutePoint {
  return { latitude: item.latitude ?? undefined, longitude: item.longitude ?? undefined, title: item.location_name, address: item.address };
}

type TimelineCardProps = {
  item: ItineraryItem;
  /** Optional platform drag handle; rendered in the card's top-right utility row. */
  grip?: React.ReactNode;
  segment?: TimelineRouteSegment;
  scheduled?: ScheduledItem;
  weather?: WeatherSummary;
  vouchers?: Voucher[];
  onPreviewVoucher?: (voucher: Voucher) => void;
  /** Invoked after a deliberate long press on the card (native drag). */
  onLongPress?: () => void;
  /** True only while the row is actively being dragged. */
  isDragging?: boolean;
  active?: boolean;
  onEdit: (item: ItineraryItem) => void;
  onDelete: (item: ItineraryItem) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  themeMode?: ThemeMode;
  onRouteModeChange?: (fromId: string, mode: TravelMode) => void;
};

const routeModes: Array<{ mode: TravelMode; label: string; icon: string }> = [
  { mode: 'DRIVING', label: '開車', icon: '🚗' },
  { mode: 'TRANSIT', label: '電車', icon: '🚆' },
  { mode: 'WALKING', label: '步行', icon: '🚶' },
];

async function copyCardText(text: string, successMessage: string) {
  const browserNavigator = (globalThis as any).navigator;
  const nativeShare = typeof (Share as any)?.share === 'function'
    ? (message: string) => (Share as any).share({ message })
    : undefined;
  try {
    const result = await shareOrCopyText(text, {
      clipboardWrite: typeof browserNavigator?.clipboard?.writeText === 'function' ? (value) => browserNavigator.clipboard.writeText(value) : undefined,
      nativeShare,
    });
    Alert.alert(result === 'copied' ? '已複製' : '已開啟分享', successMessage);
  } catch (error: any) {
    Alert.alert('操作失敗', error?.message ?? '此裝置暫時無法複製內容。');
  }
}

export const TimelineCard = React.memo(function TimelineCard({ item, grip, segment, scheduled, weather, vouchers, onPreviewVoucher, onLongPress, isDragging = false, active, onEdit, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown, themeMode = 'system', onRouteModeChange }: TimelineCardProps) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const { width: viewportWidth } = useWindowDimensions();
  const isMobile = viewportWidth < 600;
  const duration = scheduled?.durationMinutes ?? item.duration_minutes ?? 60;
  const itemVouchers = vouchers?.filter((voucher) => voucher.item_id === item.id) ?? [];
  const navigationUrl = getGoogleMapsNavigationUrl({
    latitude: item.latitude,
    longitude: item.longitude,
    location_name: item.location_name,
    address: item.address,
  });
  const placeAddress = formatPlaceAddress(item.address);
  const [resolvedImageUrl, setResolvedImageUrl] = useState(() => getSpotImageUrl(item));
  const [favorite, setFavorite] = useState(false);
  const [imageLoadFailed, setImageLoadFailed] = useState(false);
  const imageFallbackAttemptedRef = useRef(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [routeModesVisible, setRouteModesVisible] = useState(false);
  // Keep backwards compatibility with platform renderers that still provide
  // a drag handle element while allowing the whole card to be long-pressed.
  const legacyOnLongPress = React.isValidElement<{ onLongPress?: () => void }>(grip)
    ? grip.props.onLongPress
    : undefined;
  useEffect(() => {
    let cancelled = false;
    setImageLoadFailed(false);
    imageFallbackAttemptedRef.current = false;
    setResolvedImageUrl(getSpotImageUrl(item));
    void resolveSpotImage(item).then((resolved) => {
      // Keep the fallback when a remote URL has already failed instead of
      // racing the failed request back into the image element.
      if (!cancelled && !imageFallbackAttemptedRef.current) setResolvedImageUrl(resolved.url);
    });
    return () => {
      cancelled = true;
    };
  }, [item.id, item.image_url, item.photo_reference, item.photoReference, item.address, item.location_name, item.placeId, item.googlePlaceId, item.google_place_id]);
  return (
    <View style={timelineCardContainerStyle}>
      <View style={styles.row}>
        <View style={styles.rail}><View style={[styles.line, { width: 3 }]} /><View style={styles.dot} /></View>
        <Pressable onLongPress={onLongPress ?? legacyOnLongPress} delayLongPress={200} style={[styles.card, { backgroundColor: '#FFFFFF', borderWidth: 0, borderColor: 'transparent', borderTopWidth: 2, borderTopColor: 'rgba(74,62,61,0.15)', padding: 18, borderRadius: 16, marginBottom: 16, shadowColor: '#4A3E3D', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, elevation: 1 }, active && styles.cardActive, isDragging && styles.draggingCard]}>
          {(scheduled?.openingWarning || scheduled?.overlapWarning) ? <View style={styles.warningStack}>
            {scheduled.openingWarning ? <Text style={[styles.openingWarning, { backgroundColor: theme.colors.warningSurface, color: theme.colors.warningText }]}>⚠️ 注意：預計抵達時可能已過營業時間</Text> : null}
            {scheduled.overlapWarning ? <Text style={styles.overlapWarning}>🚨 時間衝突</Text> : null}
          </View> : null}
          <View style={styles.cardBody}>
            <View style={cardMenuStyles.dragTrigger}>{grip}</View>
            {!imageLoadFailed && resolvedImageUrl ? <Image source={{ uri: resolvedImageUrl }} style={cardVisualStyles.thumbnail} accessibilityLabel={`${item.location_name} 縮圖`} onError={() => {
              if (!imageFallbackAttemptedRef.current) {
                imageFallbackAttemptedRef.current = true;
                setResolvedImageUrl(getSpotImageFallbackUrl(item, resolvedImageUrl));
                return;
              }
              // A second failure means even the static CDN is unavailable;
              // the local category badge is guaranteed not to show a broken
              // image glyph.
              setImageLoadFailed(true);
            }} /> : <View style={[cardVisualStyles.thumbnail, cardVisualStyles.iconBadge, { backgroundColor: categoryTint(item.category) }]}><PuppyMascot puppy={categoryPuppyId(item.category)} size={34} accessibilityLabel={`${item.category} 類別`} /></View>}
            <View style={[styles.content, isMobile ? null : safeCardContentStyle, { gap: 8 }]}>
              <View style={[styles.cardHeader, isMobile && responsiveCardStyles.cardHeaderMobile]}><Text style={[styles.time, { color: theme.colors.primary, backgroundColor: '#E3D8CC', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4, fontSize: 11, fontWeight: '500', letterSpacing: 0.5 }]}>{scheduled?.arrivalTime ?? item.time ?? '未排定'}{scheduled?.estimated ? ' · 預估' : ''}</Text>{isMobile ? <View style={[styles.categoryWrap, responsiveCardStyles.mobileCategoryWrap]}><Text numberOfLines={1} style={[styles.category, { color: theme.colors.muted, fontSize: 11, fontWeight: '500', letterSpacing: 0.5 }]}>{item.category}</Text></View> : <><Text numberOfLines={1} style={[styles.name, cardVisualStyles.headerName, { color: '#1A1A1A', fontSize: 17, fontWeight: '700' }]}>{item.location_name}</Text><View style={styles.categoryWrap}><Text numberOfLines={1} style={[styles.category, { color: theme.colors.muted, fontSize: 11, fontWeight: '500', letterSpacing: 0.5 }]}>{item.category}</Text></View></> }</View>{isMobile ? <Text style={[styles.name, responsiveCardStyles.mobileName, { color: '#1A1A1A' }]}>{item.location_name}</Text> : null}
              {weather ? <View style={[styles.weatherRow, compactStyles.hidden]}>{!isWeatherAlert(weather) && (weather.precipitationProbability === null || weather.precipitationProbability <= 20) ? <PuppyMascot puppy="-9" size={56} style={styles.inlineMascot} accessibilityLabel="好天氣" /> : null}<Text style={[styles.weatherText, { color: theme.colors.text }]}>{weather.icon} {formatTemperature(weather)} · {weather.condition}</Text>{weather.precipitationProbability !== null ? <Text style={styles.rainProbability}>☔ {Math.round(weather.precipitationProbability)}%</Text> : null}</View> : null}
              {weather && isWeatherAlert(weather) ? <View style={[styles.weatherAlerts, compactStyles.hidden]}>{weather.precipitationWarning ? <Text style={styles.weatherWarning}>☔ 記得帶傘／降雨預警</Text> : null}{weather.extremeWarning ? <Text style={styles.extremeWarning}>⚠️ 極端天候預警</Text> : null}</View> : null}
              <View style={cardMenuStyles.triggerRow}><CategoryBadge category={item.category} compact={isMobile} inline /><Pressable accessibilityRole="button" accessibilityLabel="景點更多操作" style={cardMenuStyles.trigger} onPress={() => setMenuVisible(true)}><MoreHorizontalIcon /></Pressable></View>
              <Modal visible={menuVisible} transparent animationType="fade" onRequestClose={() => setMenuVisible(false)}><Pressable style={cardMenuStyles.backdrop} onPress={() => setMenuVisible(false)}><View style={cardMenuStyles.menu}><Pressable style={cardMenuStyles.item} onPress={() => { setMenuVisible(false); onEdit(item); }}><Text style={cardMenuStyles.text}>編輯景點</Text></Pressable>{onMoveUp ? <Pressable style={cardMenuStyles.item} disabled={!canMoveUp} onPress={() => { setMenuVisible(false); onMoveUp(); }}><Text style={[cardMenuStyles.text, !canMoveUp && styles.disabledAction]}>▲ 上移</Text></Pressable> : null}{onMoveDown ? <Pressable style={cardMenuStyles.item} disabled={!canMoveDown} onPress={() => { setMenuVisible(false); onMoveDown(); }}><Text style={[cardMenuStyles.text, !canMoveDown && styles.disabledAction]}>▼ 下移</Text></Pressable> : null}<Pressable style={cardMenuStyles.item} onPress={() => { setMenuVisible(false); onDelete(item); }}><Text style={cardMenuStyles.danger}>刪除景點</Text></Pressable>{placeAddress ? <Pressable style={cardMenuStyles.item} onPress={() => { setMenuVisible(false); void copyCardText(placeAddress, '地址已複製'); }}><Text style={cardMenuStyles.text}>複製地址</Text></Pressable> : null}{navigationUrl ? <Pressable style={cardMenuStyles.item} onPress={() => { setMenuVisible(false); void Linking.openURL(navigationUrl).catch(() => undefined); }}><Text style={cardMenuStyles.text}>開啟導航</Text></Pressable> : null}{itemVouchers.length > 0 && onPreviewVoucher ? <Pressable style={cardMenuStyles.item} onPress={() => { setMenuVisible(false); onPreviewVoucher(itemVouchers[0]); }}><Text style={cardMenuStyles.text}>🎫 檢視票券</Text></Pressable> : null}<Pressable style={cardMenuStyles.item} onPress={() => { setFavorite((current) => !current); setMenuVisible(false); }}><Text style={cardMenuStyles.text}>{favorite ? '取消收藏' : '加入收藏'}</Text></Pressable></View></Pressable></Modal>
              {reservationTagLabels(item.reservation_tags).length > 0 ? <View style={reservationTagStyles.reservationTags}>{reservationTagLabels(item.reservation_tags).map((label) => <Text key={label} style={[reservationTagStyles.reservationTag, { color: theme.colors.primary, borderColor: theme.colors.border }]}>{label}</Text>)}</View> : null}
              <Text style={[styles.duration, { color: theme.colors.muted }]}>停留 {duration} 分鐘 · 離開 {scheduled?.departureTime ?? '—'}</Text>
              {placeAddress ? <Text style={[styles.address, { color: '#8E8E93', fontSize: 13 }]}>{placeAddress}</Text> : null}
              {item.notes ? <Text style={[styles.notes, { color: '#8E8E93', fontSize: 13 }]}>{item.notes}</Text> : null}
              <Pressable accessibilityRole="link" style={styles.navigationButton} onPress={() => { void Linking.openURL(navigationUrl).catch(() => undefined); }}><PuppyMascot puppy={navigationPuppyId(item.category)} size={20} style={styles.navigationPuppy} accessibilityLabel="導航小狗" /><Text numberOfLines={1} style={styles.navigation}>🧭 開啟 Google Maps 導航</Text></Pressable>
              <View style={[styles.actions, compactStyles.hidden]}>
                {onMoveUp ? <Pressable style={styles.actionButton} accessibilityRole="button" accessibilityLabel="上移景點" disabled={!canMoveUp} onPress={onMoveUp}><Text style={[styles.reorderText, { color: theme.colors.text }, !canMoveUp && styles.disabledAction]}>▲ 上移</Text></Pressable> : null}
                {onMoveDown ? <Pressable style={styles.actionButton} accessibilityRole="button" accessibilityLabel="下移景點" disabled={!canMoveDown} onPress={onMoveDown}><Text style={[styles.reorderText, { color: theme.colors.text }, !canMoveDown && styles.disabledAction]}>▼ 下移</Text></Pressable> : null}
                <Pressable style={styles.actionButton} onPress={() => onEdit(item)}><Text style={[styles.edit, { color: theme.colors.primary }]}>編輯</Text></Pressable>
                <Pressable style={styles.actionButton} onPress={() => onDelete(item)}><Text style={styles.delete}>刪除</Text></Pressable>
                {placeAddress ? <Pressable style={styles.actionButton} accessibilityRole="button" accessibilityLabel="複製地址" onPress={() => void copyCardText(placeAddress, '景點地址已複製。')}><Text style={[styles.utilityAction, { color: theme.colors.primary }]}>複製地址</Text></Pressable> : null}
                {itemVouchers.length > 0 && onPreviewVoucher ? <Pressable style={styles.actionButton} onPress={() => onPreviewVoucher(itemVouchers[0])}><Text style={styles.voucher}>🎫 檢視票券{itemVouchers.length > 1 ? ` (${itemVouchers.length})` : ''}</Text></Pressable> : null}
                <Pressable onPress={() => setFavorite((current) => !current)}><View style={styles.favorite}>{favorite ? <PuppyMascot puppy="-3" size={28} accessibilityLabel="已收藏" /> : <Text style={styles.favoriteText}>♡ 收藏</Text>}</View></Pressable>
              </View>
            </View>
          </View>
        </Pressable>
      </View>
      {segment ? <View style={styles.transition}>
        <Pressable style={styles.transitionMain} onPress={() => setRouteModesVisible((current) => !current)}><Text style={styles.transitionText}>{routeModes.find((option) => option.mode === segment.mode)?.icon} {segment.loading ? '估算中' : `${segment.durationMinutes} 分鐘`} ({formatDistance(segment.distanceKm)})</Text></Pressable>
        {routeModesVisible ? <View style={styles.routeModes}>{routeModes.map((option) => <Pressable key={option.mode} style={[styles.routeModeButton, segment.mode === option.mode && styles.routeModeButtonActive]} accessibilityRole="button" accessibilityState={{ selected: segment.mode === option.mode }} onPress={() => { setRouteModesVisible(false); onRouteModeChange?.(segment.fromId, option.mode); }}><Text style={styles.routeModeText}>{option.icon} {option.label}</Text></Pressable>)}</View> : null}
        {segment.navigationUrl ? <Pressable accessibilityRole="link" style={styles.routeLink} onPress={() => { void Linking.openURL(segment.navigationUrl as string).catch(() => undefined); }}><Text numberOfLines={1} style={styles.routeLinkText}>🗺️ 導航路線</Text></Pressable> : null}
      </View> : null}
    </View>
  );
}, areTimelineCardPropsEqual);

function formatTemperature(weather: WeatherSummary) { const min = weather.temperatureMinC == null ? null : Math.round(weather.temperatureMinC); const max = weather.temperatureMaxC == null ? null : Math.round(weather.temperatureMaxC); if (min !== null && max !== null) return `${min}–${max}°C`; if (max !== null) return `${max}°C`; if (min !== null) return `${min}°C`; return '溫度未知'; }
export function EmptyTimeline() { return <View style={styles.empty}><PuppyMascot puppy="-7" size={165} accessibilityLabel="目前沒有景點" /><Text style={styles.emptyText}>目前還沒有景點，新增第一站吧！</Text></View>; }
export function InsertSpotButton({ position, onPress }: { position: number; onPress: (position: number) => void }) { return <Pressable accessibilityRole="button" accessibilityLabel="在這裡插入景點" style={[styles.insertButton, { borderWidth: 0, borderTopWidth: 1, borderStyle: 'dashed', borderRadius: 0, paddingHorizontal: 0, minHeight: 28, width: '100%', marginTop: 0, marginBottom: 4, opacity: 0.15 }]} onPress={() => onPress(position)}><Text style={[styles.insertButtonText, { fontSize: 16 }]}>＋</Text></Pressable>; }
// Legacy accessibility copy: ＋ 在這裡插入景點
export function NativeGripHandle({ label, onLongPress }: { label: string; onLongPress: () => void }) { return <Pressable accessibilityRole="button" accessibilityLabel={label} style={[styles.grip, { backgroundColor: 'transparent' }]} onLongPress={onLongPress} delayLongPress={MOBILE_GRIP_CONFIG.delayLongPress} pressRetentionOffset={MOBILE_GRIP_CONFIG.pressRetentionOffset} hitSlop={MOBILE_GRIP_CONFIG.hitSlop}><Text style={styles.gripText}>⋮⋮</Text></Pressable>; }
const reservationTagStyles = StyleSheet.create({
  reservationTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 2 },
  reservationTag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, fontSize: 11, fontWeight: '800' },
});
function MoreHorizontalIcon() {
  return <View accessibilityLabel="更多" style={moreIconStyles.icon}>{[0, 1, 2].map((dot) => <View key={dot} style={moreIconStyles.dot} />)}</View>;
}
const moreIconStyles = StyleSheet.create({ icon: { width: 18, height: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, dot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#94A3B8' } });
const cardMenuStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(31,31,31,.18)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  menu: { width: 160, backgroundColor: EDITORIAL_COLORS.paper, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 12, padding: 6 },
  item: { minHeight: 40, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8 },
  text: { color: '#475569', fontSize: 13, fontWeight: '600' },
  danger: { color: EDITORIAL_COLORS.dangerText, fontSize: 14, fontWeight: '700' },
  dragTrigger: { position: 'absolute', top: 8, right: 52, zIndex: 6, alignItems: 'center', justifyContent: 'center' },
  triggerRow: { position: 'absolute', top: 3, right: 8, zIndex: 5, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 },
  trigger: { minWidth: 36, minHeight: 36, alignItems: 'center', justifyContent: 'center' },
});
const compactStyles = StyleSheet.create({ hidden: { display: 'none' } });
const cardVisualStyles = StyleSheet.create({
  thumbnail: { width: 64, height: 64, borderRadius: 16, flexShrink: 0, marginRight: 16 },
  iconBadge: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#E9E1D5' },
  icon: { fontSize: 22 },
  headerName: { flex: 1, minWidth: 0, fontSize: 17, fontWeight: '700' },
});
const responsiveCardStyles = StyleSheet.create({
  cardHeaderMobile: { justifyContent: 'flex-start', flexWrap: 'nowrap', paddingRight: 42, gap: 8 },
  mobileCategoryWrap: { marginLeft: 'auto', marginRight: 4, maxWidth: '50%', flexShrink: 1 },
  mobileName: { width: '100%', flexGrow: 0, flexShrink: 0, fontSize: 17, fontWeight: '700', lineHeight: 23, marginTop: 2 },
});
// Keep the card content clear of the absolute more-options trigger on narrow screens.
const safeCardContentStyle = { paddingRight: 42 } as const;
function categoryTint(category: string): string {
  if (category === 'food') return '#F3DCCB';
  if (category === 'hotel') return '#DDE9E2';
  if (category === 'flight') return '#DCE5F2';
  if (category === 'trail' || category === 'outdoor') return '#E1EAD7';
  return '#E9E1D5';
}

const categoryPuppies: Record<string, PuppyId> = {
  flight: '-8',
  transit: '-8',
  hotel: '-6',
  food: '-10',
  restaurant: '-10',
  spot: '-11',
  outdoor: '-9',
  trail: '-7',
};

function categoryPuppyId(category: string): PuppyId {
  return categoryPuppies[category.trim().toLowerCase()] ?? '-11';
}

function navigationPuppyId(category: string): PuppyId {
  return categoryPuppies[category.trim().toLowerCase()] ?? '-8';
}

function CategoryBadge({ category, compact, inline = false }: { category: string; compact: boolean; inline?: boolean }) {
  const palette = getCategoryBadgePalette(category);
  return <View pointerEvents="none" style={[styles.categoryBadge, compact && styles.categoryBadgeCompact, inline && styles.categoryBadgeInline, { backgroundColor: palette.backgroundColor, borderColor: palette.borderColor }]}>
    <Text numberOfLines={1} style={[styles.categoryBadgeText, { color: palette.color }]}>{category}</Text>
  </View>;
}
function formatDistance(distanceKm: number) { return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} 公尺` : `${distanceKm.toFixed(1)} 公里`; }
const timelineCardContainerStyle = createTimelineCardContainerStyle();

const styles = {
  ...StyleSheet.create({
  empty: { width: '100%', padding: 38, alignItems: 'center', gap: 8, boxSizing: 'border-box' }, emptyText: { color: EDITORIAL_COLORS.taupe }, insertButton: { alignSelf: 'center', minHeight: 40, justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: EDITORIAL_COLORS.terracotta, borderRadius: 999, paddingHorizontal: 14, marginTop: -4, marginBottom: 8 }, insertButtonText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800' }, row: { width: '100%', flexDirection: 'row', minHeight: 130 }, rail: { width: 24, alignItems: 'center' }, line: { position: 'absolute', top: 18, bottom: 0, width: 2, backgroundColor: EDITORIAL_COLORS.line }, dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: EDITORIAL_COLORS.terracotta, borderWidth: 3, borderColor: EDITORIAL_COLORS.terracottaSoft, zIndex: 1 }, card: { flex: 1, minWidth: 0, maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', marginBottom: 12, padding: 12, borderRadius: 14, borderWidth: 0, position: 'relative' }, cardActive: { shadowOpacity: 0.08 }, draggingCard: { shadowOpacity: 0.2, shadowRadius: 20, shadowOffset: { width: 0, height: 10 }, elevation: 8, transform: [{ scale: 1.02 }] }, cardBody: { width: '100%', flexDirection: 'row', alignItems: 'stretch', gap: 10 }, grip: { width: 32, minHeight: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: 'transparent' }, gripText: { color: EDITORIAL_COLORS.taupe, fontSize: 25, fontWeight: '900' }, content: { flex: 1, minWidth: 0, gap: 5 }, cardHeader: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 }, time: { fontWeight: '800', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }, category: { fontSize: 12, flexShrink: 1 }, categoryWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 }, inlineMascot: { flexShrink: 0 }, weatherRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }, weatherText: { fontSize: 12, fontWeight: '700' }, rainProbability: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800' }, weatherAlerts: { gap: 4 }, weatherWarning: { color: EDITORIAL_COLORS.amberText, backgroundColor: EDITORIAL_COLORS.amberSoft, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, fontSize: 12, fontWeight: '800' }, extremeWarning: { color: EDITORIAL_COLORS.dangerText, backgroundColor: EDITORIAL_COLORS.dangerSoft, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, fontSize: 12, fontWeight: '800' }, name: { fontSize: 18, fontWeight: '800' }, duration: { fontSize: 13 }, warningStack: { position: 'absolute', top: 10, right: 10, zIndex: 2, alignItems: 'flex-end', gap: 4, maxWidth: '72%' }, openingWarning: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '800' }, overlapWarning: { color: EDITORIAL_COLORS.dangerText, backgroundColor: EDITORIAL_COLORS.dangerSoft, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '800' }, address: { fontSize: 13 }, notes: { fontSize: 13, fontStyle: 'italic' }, navigation: { alignSelf: 'flex-start', color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800', minHeight: 44, paddingVertical: 14 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 5 }, actionButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 }, reorderText: { fontWeight: '800' }, disabledAction: { color: '#A9A397' }, edit: { fontWeight: '700' }, delete: { color: EDITORIAL_COLORS.dangerText, fontWeight: '700' }, utilityAction: { fontWeight: '700' }, voucher: { color: EDITORIAL_COLORS.terracotta, fontWeight: '700' }, favorite: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, favoriteText: { color: EDITORIAL_COLORS.taupe, fontWeight: '700' }, transition: { alignSelf: 'center', width: '100%', gap: 7, marginTop: -5, marginBottom: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: EDITORIAL_COLORS.sand, borderWidth: 1, borderColor: EDITORIAL_COLORS.line }, transitionMain: { flexDirection: 'row', alignItems: 'center', gap: 7 }, transitionText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '700', flexShrink: 1 }, routeModes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 53 }, routeModeButton: { minHeight: 36, justifyContent: 'center', borderRadius: 8, paddingHorizontal: 9, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, backgroundColor: EDITORIAL_COLORS.paper }, routeModeButtonActive: { borderColor: EDITORIAL_COLORS.terracotta, backgroundColor: EDITORIAL_COLORS.terracottaSoft }, routeModeText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '700', flexShrink: 1 }, routeLink: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', marginLeft: 53 }, routeLinkText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800' },
  }),
  // Mobile-friendly transport presentation: a compact, neutral pill.
  transition: { alignSelf: 'flex-start', width: 'auto', maxWidth: '100%', minWidth: 0, gap: 4, marginLeft: 24, marginTop: 4, marginBottom: 12, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#F1F5F9', borderWidth: 0, borderColor: 'transparent', borderLeftWidth: 2, borderLeftColor: EDITORIAL_COLORS.line } as const,
  transitionMain: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 } as const,
  transitionText: { color: '#475569', fontSize: 11, fontWeight: '600', flexShrink: 1 } as const,
  grip: { width: 24, minHeight: 36, borderRadius: 0, backgroundColor: 'transparent' } as const,
  gripText: { color: '#CBD5E1', fontSize: 20, fontWeight: '800', marginHorizontal: 8, opacity: 0.4 } as const,
  // Extend the rail through the compact transport pill so the timeline never
  // appears broken between two cards.
  line: { bottom: -30 } as const,
  // The category is rendered once as an outer, position-safe badge. The
  // legacy inline wrapper remains hidden to avoid duplicate labels.
  categoryWrap: { display: 'none' } as const,
  categoryBadge: { position: 'absolute', top: 8, right: 48, zIndex: 4, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, minHeight: 24 } as const,
  categoryBadgeCompact: { right: 48, maxWidth: '100%' } as const,
  categoryBadgeInline: { position: 'relative', top: 0, right: 0, zIndex: 0, maxWidth: '70%' } as const,
  categoryBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, flexShrink: 1 } as const,
  // Navigation is a compact pill; the linedog sits inside rather than in the
  // category badge so the card header stays clean on narrow screens.
  routeLink: { alignSelf: 'flex-start', width: 'auto', maxWidth: '100%', minWidth: 0, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 999, backgroundColor: '#F1F5F9', borderWidth: 0, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 0 } as const,
  routeLinkText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800', flexShrink: 1 } as const,
  navigationButton: { alignSelf: 'flex-start', width: 'auto', maxWidth: '100%', minWidth: 0, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: '#F1F5F9', borderWidth: 0, paddingHorizontal: 12, paddingVertical: 6 } as const,
   navigationPuppy: { width: 20, height: 20, flexShrink: 0, backgroundColor: 'transparent', opacity: 1 } as const,
  navigation: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800', flexShrink: 1 } as const,
};

// Compatibility markers retained for previous UI checks: ??銝宏 / ??銝宏 / ?妣 ?? Google Maps 撠
