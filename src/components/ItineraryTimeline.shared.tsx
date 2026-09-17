import React, { useEffect, useRef, useState } from 'react';
import { Alert, Image, Linking, Modal, Pressable, Share, StyleSheet, Text, TextInput, View, useColorScheme, useWindowDimensions } from 'react-native';
import { buildRouteSegments, resolveRouteSegmentLabels, type ItineraryItem, type RouteSegment } from '@/lib/itinerary';
import { tripDateForDay } from '@/lib/trip-dates';
import { createMockWeatherSummary, fetchWeatherForecastBatch, isWeatherAlert, type WeatherBatchLocation, type WeatherSummary } from '@/lib/weather-api';
import type { Voucher } from '@/lib/vouchers';
import { buildDaySchedule, type ScheduleContext, type ScheduledItem } from '@/lib/schedule';
import { getGoogleMapsNavigationUrl } from '@/lib/map-links';
import { formatPlaceAddress } from '@/lib/place-actions';
import { buildGoogleMapsRouteUrl, calculateFallbackTravelMinutes, createRouteEstimator, type RouteEstimate, type RoutePoint, type TravelMode } from '@/lib/routes';
import { shareOrCopyText } from '@/lib/share-actions';
import { EDITORIAL_COLORS, getThemeForMode, type ThemeMode } from '@/lib/theme';
import type { PuppyId } from '@/lib/puppy';
import { PuppyMascot } from './PuppyMascot';
// Theme badge fallback remains available via theme.colors.surfaceMuted.
import { reservationTagLabels } from '@/lib/reservation-tags';
import { getSpotImageFallbackUrl, getSpotImageLightboxUrl, getSpotImageUrl, resolveSpotImage, searchSpotImage } from '@/lib/spot-image';
import { getCategoryBadgePalette } from '@/lib/visual-styles';
import { getCategoryIcon } from '@/lib/category-icons';

export type ItineraryTimelineProps = {
  items: ItineraryItem[];
  /** Used to isolate day-level weather batches between trips. */
  tripId?: string;
  themeMode?: ThemeMode;
  onEdit: (item: ItineraryItem) => void;
  onDelete: (item: ItineraryItem) => void;
  onReorder?: (items: { id: string; position: number }[]) => Promise<void>;
  /** Persist a group of shifted times in one transaction. */
  onShiftSubsequent?: (items: { id: string; time: string | null }[]) => Promise<void>;
  focusedItemId?: string | null;
  scheduleContext?: ScheduleContext;
  vouchers?: Voucher[];
  onPreviewVoucher?: (voucher: Voucher) => void;
  onInsertAtPosition?: (position: number) => void;
  onUpdateImage?: (item: ItineraryItem, imageUrl: string) => void | Promise<void>;
};

export type TimelineRouteSegment = RouteSegment & {
  mode: TravelMode;
  durationMinutes: number;
  fromTitle: string;
  toTitle: string;
  navigationUrl: string | null;
  loading?: boolean;
};

/**
 * Keep the local optimistic timeline in step with parent/realtime updates.
 * Time and duration are part of the revision because they directly affect
 * conflict badges; route fields are included so adjacent segments refresh in
 * the same render as a persisted edit.
 */
export function timelineItemsRevision(items: readonly ItineraryItem[]): string {
  return items.map((item) => JSON.stringify({
    id: item.id,
    day_number: item.day_number,
    position: item.position,
    time: item.time,
    start_time: item.start_time,
    duration_minutes: item.duration_minutes,
    latitude: item.latitude,
    longitude: item.longitude,
    location_name: item.location_name,
    address: item.address,
    category: item.category,
    notes: item.notes,
    reservation_tags: item.reservation_tags,
    is_backup: item.is_backup,
    opening_hours: item.opening_hours,
    updated_at: item.updated_at,
  })).join('|');
}

const timelineCardContainerStyle = {
  position: 'relative',
  display: 'flex',
  flexDirection: 'column',
  alignSelf: 'stretch',
  width: '100%',
  minWidth: 0,
  maxWidth: '100%',
  overflow: 'hidden',
  boxSizing: 'border-box',
  backgroundColor: '#FFFFFF',
  borderWidth: 0,
  borderColor: 'transparent',
  borderRadius: 16,
  shadowColor: '#000000',
  shadowOpacity: 0.05,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
} as const;

const routeEstimator = createRouteEstimator();
const weatherBatchCache = new Map<string, { expiresAt: number; value: Promise<Record<string, WeatherSummary | null>> }>();
const routeBatchCache = new Map<string, Promise<Record<string, RouteEstimate>>>();
const WEATHER_BATCH_CACHE_TTL_MS = 30 * 60 * 1000;

export function weatherBatchCacheKey(
  items: readonly ItineraryItem[],
  context?: Pick<ScheduleContext, 'tripStartDate' | 'dayNumber' | 'timezone'>,
  tripId?: string,
): string {
  const coordinateHash = [...items]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((item) => `${item.id}:${item.latitude ?? ''},${item.longitude ?? ''}:${item.time ?? item.start_time ?? ''}`)
    .join('|');
  return `${tripId ?? 'unknown'}:${context?.dayNumber ?? 0}:${context?.tripStartDate ?? ''}:${context?.timezone ?? 'auto'}:${coordinateHash}`;
}

export function routeBatchCacheKey(
  items: readonly ItineraryItem[],
  modes: Record<string, TravelMode>,
  scope?: { tripId?: string; day?: number },
): string {
  const orderedItems = items.map((item) => `${item.id}:${item.position}:${item.latitude ?? ''},${item.longitude ?? ''}`).join('|');
  const modeKey = Object.entries(modes).sort(([left], [right]) => left.localeCompare(right)).map(([id, mode]) => `${id}:${mode}`).join('|');
  return `${scope?.tripId ?? 'unknown'}:${scope?.day ?? items[0]?.day_number ?? 0}:${orderedItems}:${modeKey}`;
}

export function useWeatherByItem(
  items: ItineraryItem[],
  context?: Pick<ScheduleContext, 'tripStartDate' | 'dayNumber' | 'timezone'>,
  tripId?: string,
  transitMinutesByFromId?: Readonly<Record<string, number | null | undefined>>,
) {
  const [weatherById, setWeatherById] = useState<Record<string, WeatherSummary>>({});
  const itemKey = weatherBatchCacheKey(items, context, tripId);
  const transitKey = Object.entries(transitMinutesByFromId ?? {})
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, minutes]) => `${id}:${minutes ?? ''}`)
    .join('|');
  useEffect(() => {
    let active = true;
    const date = context ? tripDateForDay(context.tripStartDate, context.dayNumber) : null;
    setWeatherById({});
    if (!date || !items.length) return () => { active = false; };
    const scheduledById = new Map(buildDaySchedule(items, {
      ...context,
      tripStartDate: context!.tripStartDate,
      dayNumber: context!.dayNumber,
      transitMinutesByFromId,
    }).map((entry) => [entry.item.id, entry]));
    const locations: WeatherBatchLocation[] = items.flatMap((item) => {
      const latitude = item.latitude == null ? null : Number(item.latitude);
      const longitude = item.longitude == null ? null : Number(item.longitude);
      return latitude !== null && longitude !== null && Number.isFinite(latitude) && Number.isFinite(longitude)
        ? [{ id: item.id, latitude, longitude }]
        : [];
    });
    const targetTimes = Object.fromEntries(items.map((item) => [item.id, scheduledById.get(item.id)?.arrivalTime ?? item.time ?? item.start_time ?? null]));
    const requestKey = `${itemKey}:${date}`;
    const cached = weatherBatchCache.get(requestKey);
    let request = cached && cached.expiresAt > Date.now() ? cached.value : undefined;
    if (!request) {
      request = fetchWeatherForecastBatch(locations, date, context?.timezone, targetTimes);
      weatherBatchCache.set(requestKey, { expiresAt: Date.now() + WEATHER_BATCH_CACHE_TTL_MS, value: request });
    }
    void request.then((batch) => {
      if (!active) return;
      const entries = items.map((item) => [item.id, batch[item.id] ?? createMockWeatherSummary(date)] as const);
      setWeatherById(Object.fromEntries(entries.filter(([, weather]) => Boolean(weather))) as Record<string, WeatherSummary>);
    });
    return () => { active = false; };
  }, [context?.dayNumber, context?.tripStartDate, context?.timezone, itemKey, transitKey, tripId]);
  return weatherById;
}

export function segmentsForItems(items: ItineraryItem[]) {
  return items.length ? buildRouteSegments(items, items[0].day_number, 35, 'position') : [];
}
export function orderPayload(items: ItineraryItem[]) { return items.map(({ id, position }) => ({ id, position })); }

export function useRouteSegments(items: ItineraryItem[], modes: Record<string, TravelMode>, scope?: { tripId?: string; day?: number }) {
  const [estimates, setEstimates] = useState<Record<string, RouteEstimate>>({});
  const routeOrderKeyRef = useRef<string | null>(null);
  const itemKey = items.map((item) => `${item.id}:${item.position}:${item.latitude ?? ''}:${item.longitude ?? ''}`).join('|');
  const orderKey = items.map((item) => `${item.id}:${item.position}`).join('|');
  const modeKey = Object.entries(modes).sort(([left], [right]) => left.localeCompare(right)).map(([id, mode]) => `${id}:${mode}`).join('|');

  useEffect(() => {
    let active = true;
    if (routeOrderKeyRef.current !== null && routeOrderKeyRef.current !== orderKey) {
      routeEstimator.cache.clear();
      routeEstimator.sequenceCache.clear();
      routeBatchCache.clear();
    }
    routeOrderKeyRef.current = orderKey;
    const byId = new Map(items.map((item) => [item.id, item]));
    const baseSegments = segmentsForItems(items);
    setEstimates({});

    const segmentModes = [...new Set(baseSegments.map((segment) => modes[segment.fromId] ?? 'DRIVING'))];
    if (baseSegments.length > 0 && segmentModes.length === 1) {
      const mode = segmentModes[0] as TravelMode;
      const batchKey = `${routeBatchCacheKey(items, modes, scope)}:${mode}`;
      let request = routeBatchCache.get(batchKey);
      if (!request) {
        request = routeEstimator.getRouteSequence(items.map(toRoutePoint), mode).then((sequence) => Object.fromEntries(
          sequence.legs.map((estimate, index) => [baseSegments[index]?.fromId, estimate]).filter(([id]) => Boolean(id)),
        ) as Record<string, RouteEstimate>);
        routeBatchCache.set(batchKey, request);
      }
      void request.then((batch) => { if (active) setEstimates(batch); });
      return () => { active = false; };
    }

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
  }, [itemKey, modeKey, orderKey, scope?.day, scope?.tripId]);

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
    const labels = resolveRouteSegmentLabels(items, segment);
    return {
      ...segment,
      ...labels,
      mode,
      durationMinutes: estimate?.durationMinutes ?? fallback,
      estimatedDriveMinutes: estimate?.durationMinutes ?? fallback,
      navigationUrl: estimate?.navigationUrl ?? (from && to ? buildGoogleMapsRouteUrl(toRoutePoint(from), toRoutePoint(to), mode) : null),
      loading: !estimate,
    };
  });
}

/** Adapt the route-pill estimates into the schedule engine's transit map. */
export function routeDurationsForSchedule(estimates: Readonly<Record<string, RouteEstimate>>): Record<string, number> {
  return Object.fromEntries(Object.entries(estimates).flatMap(([fromId, estimate]) => {
    const minutes = Number(estimate?.durationMinutes);
    return Number.isFinite(minutes) && minutes >= 0 ? [[fromId, Math.round(minutes)] as const] : [];
  }));
}

function toRoutePoint(item: ItineraryItem): RoutePoint {
  return { latitude: item.latitude ?? undefined, longitude: item.longitude ?? undefined, title: item.location_name, address: item.address };
}

type TimelineCardProps = {
  item: ItineraryItem;
  segment?: TimelineRouteSegment;
  scheduled?: ScheduledItem;
  weather?: WeatherSummary;
  vouchers?: Voucher[];
  onPreviewVoucher?: (voucher: Voucher) => void;
  active?: boolean;
  onEdit: (item: ItineraryItem) => void;
  onDelete: (item: ItineraryItem) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
  themeMode?: ThemeMode;
  onRouteModeChange?: (fromId: string, mode: TravelMode) => void;
  onUpdateImage?: (item: ItineraryItem, imageUrl: string) => void | Promise<void>;
  onShiftSubsequent?: (delayMinutes: number) => void | Promise<void>;
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

export const TimelineCard = React.memo(function TimelineCard({ item, segment, scheduled, weather, vouchers, onPreviewVoucher, active, onEdit, onDelete, onMoveUp, onMoveDown, canMoveUp, canMoveDown, themeMode = 'system', onRouteModeChange, onUpdateImage, onShiftSubsequent }: TimelineCardProps) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const { width: viewportWidth } = useWindowDimensions();
  const isMobile = viewportWidth < 600;
  const duration = scheduled?.durationMinutes ?? item.duration_minutes ?? 60;
  // Treat conflictMinutes as the single source of truth for the warning UI.
  // Older schedule payloads may still carry overlapWarning=true after the
  // underlying times have been corrected, so never render from that flag
  // alone. Normalising here also prevents null/negative values from leaking
  // into the badge or shift action.
  const conflictMinutes = Math.max(0, Number(scheduled?.conflictMinutes ?? 0));
  const hasTimeConflict = conflictMinutes > 0;
  // Compatibility marker for consumers that still inspect the legacy field:
  // scheduled.conflictMinutes remains the source value, while the normalised
  // conflictMinutes below is the only value used for rendering.
  if (hasTimeConflict && typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
    console.warn('[UI RENDER CONFLICT]', {
      itemName: item.location_name,
      conflictMinutes,
      itemStartTime: item.time ?? item.start_time ?? null,
    });
  }
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
  const [lightboxVisible, setLightboxVisible] = useState(false);
  const [lightboxImageFailed, setLightboxImageFailed] = useState(false);
  const [manualPhotoSearchOpen, setManualPhotoSearchOpen] = useState(false);
  const [manualPhotoQuery, setManualPhotoQuery] = useState('');
  const [manualPhotoLoading, setManualPhotoLoading] = useState(false);
  const [manualPhotoError, setManualPhotoError] = useState<string | null>(null);
  const imageFallbackAttemptedRef = useRef(false);
  const [menuVisible, setMenuVisible] = useState(false);
  const [routeModesVisible, setRouteModesVisible] = useState(false);
  const handleManualPhotoSearch = async () => {
    const query = manualPhotoQuery.trim();
    if (!query || manualPhotoLoading) return;
    setManualPhotoLoading(true);
    setManualPhotoError(null);
    try {
      const result = await searchSpotImage(query);
      if (!result) throw new Error('查無可用照片，請換個景點關鍵字。');
      if (typeof onUpdateImage === 'function') await onUpdateImage(item, result.url);
      setResolvedImageUrl(result.url);
      imageFallbackAttemptedRef.current = false;
      setImageLoadFailed(false);
      setLightboxImageFailed(false);
      setManualPhotoSearchOpen(false);
    } catch (error: any) {
      setManualPhotoError(error?.message ?? '照片搜尋失敗，請稍後再試。');
    } finally {
      setManualPhotoLoading(false);
    }
  };
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
  }, [item.id, item.image_url, item.preview_url, item.photo_reference, item.photoReference, item.address, item.location_name, item.placeId, item.googlePlaceId, item.google_place_id]);
  return (
    <View style={timelineCardContainerStyle}>
      <View style={styles.row}>
        <View style={styles.rail}><View style={[styles.line, { width: 3 }]} /><View style={styles.dot} /></View>
        <View style={[styles.card, { backgroundColor: '#FFFFFF', borderWidth: 0, borderColor: 'transparent', borderTopWidth: 2, borderTopColor: 'rgba(74,62,61,0.15)', padding: 18, borderRadius: 16, marginBottom: 16, shadowColor: '#4A3E3D', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, elevation: 1 }, active && styles.cardActive]}>
          {(scheduled?.openingWarning || hasTimeConflict) ? <View style={styles.warningStack}>
            {scheduled?.openingWarning ? <Text style={[styles.openingWarning, { backgroundColor: theme.colors.warningSurface, color: theme.colors.warningText }]}>⚠️ 注意：預計抵達時可能已過營業時間</Text> : null}
            {hasTimeConflict ? <>
              <Text style={styles.overlapWarning}>{`⚠️ 時間重疊 ${conflictMinutes} 分鐘`}</Text>
              {onShiftSubsequent
                ? <Pressable accessibilityRole="button" style={styles.shiftButton} onPress={() => { void onShiftSubsequent(conflictMinutes); }}><Text style={styles.shiftButtonText}>⚡ 一鍵順延後續行程</Text></Pressable>
                : null}
            </> : null}
          </View> : null}
          <Modal visible={lightboxVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setLightboxVisible(false)}>
            <Pressable style={styles.lightboxBackdrop} onPress={() => setLightboxVisible(false)}>
              <View style={styles.lightboxContent}>
                <Pressable style={styles.lightboxImagePressable} onPress={(event) => event.stopPropagation()}>
                  {lightboxImageFailed ? <View style={[styles.lightboxImage, styles.lightboxFallback]}><PuppyMascot puppy={categoryPuppyId(item.category)} size={72} accessibilityLabel={`${item.location_name} 無預覽圖`} /><Text style={styles.lightboxFallbackText}>目前無預覽圖</Text></View> : <Image source={{ uri: getSpotImageLightboxUrl(item, undefined, resolvedImageUrl) }} style={styles.lightboxImage} resizeMode="contain" accessibilityLabel={`${item.location_name} 大圖`} onError={() => setLightboxImageFailed(true)} />}
                </Pressable>
                <Pressable style={styles.lightboxActions} onPress={(event) => event.stopPropagation()}>
                  {!manualPhotoSearchOpen ? <Pressable accessibilityRole="button" accessibilityLabel="更換照片" style={styles.lightboxReplaceButton} onPress={() => { setManualPhotoError(null); setManualPhotoSearchOpen(true); }}><Text style={styles.lightboxReplaceText}>🔄 更換照片</Text></Pressable> : <View style={styles.lightboxSearchRow}>
                    <TextInput value={manualPhotoQuery} onChangeText={setManualPhotoQuery} autoFocus placeholder="輸入景點關鍵字" placeholderTextColor="#A8A29E" style={styles.lightboxSearchInput} returnKeyType="search" onSubmitEditing={() => { void handleManualPhotoSearch(); }} />
                    <Pressable accessibilityRole="button" accessibilityLabel="搜尋替換照片" disabled={manualPhotoLoading || !manualPhotoQuery.trim()} style={[styles.lightboxSearchButton, (manualPhotoLoading || !manualPhotoQuery.trim()) && styles.lightboxSearchButtonDisabled]} onPress={() => { void handleManualPhotoSearch(); }}><Text style={styles.lightboxSearchButtonText}>{manualPhotoLoading ? '搜尋中…' : '搜尋'}</Text></Pressable>
                  </View>}
                  {manualPhotoError ? <Text style={styles.lightboxSearchError}>{manualPhotoError}</Text> : null}
                </Pressable>
                <Pressable accessibilityRole="button" accessibilityLabel="關閉照片預覽" style={styles.lightboxClose} onPress={() => setLightboxVisible(false)}><Text style={styles.lightboxCloseText}>×</Text></Pressable>
              </View>
            </Pressable>
          </Modal>
          <View style={styles.cardBody}>
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
            <Pressable accessibilityRole="button" accessibilityLabel={`放大查看 ${item.location_name}`} style={styles.thumbnailOverlay} onPress={() => { setLightboxImageFailed(!resolvedImageUrl || imageLoadFailed); setLightboxVisible(true); }} />
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
        </View>
      </View>
      {segment ? <View style={styles.transition}>
        <View style={styles.transitionContext}>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.transitionEndpoint}>{segment.fromTitle}</Text>
          <Text style={styles.transitionArrow}>➔</Text>
          <Text numberOfLines={1} ellipsizeMode="tail" style={styles.transitionEndpoint}>{segment.toTitle}</Text>
        </View>
        <Pressable style={styles.transitionMain} onPress={() => setRouteModesVisible((current) => !current)}><Text style={styles.transitionText}>{routeModes.find((option) => option.mode === segment.mode)?.icon} {segment.loading ? '估算中' : `${segment.durationMinutes} 分鐘`} ({formatDistance(segment.distanceKm)})</Text></Pressable>
        {routeModesVisible ? <View style={styles.routeModes}>{routeModes.map((option) => <Pressable key={option.mode} style={[styles.routeModeButton, segment.mode === option.mode && styles.routeModeButtonActive]} accessibilityRole="button" accessibilityState={{ selected: segment.mode === option.mode }} onPress={() => { setRouteModesVisible(false); onRouteModeChange?.(segment.fromId, option.mode); }}><Text style={styles.routeModeText}>{option.icon} {option.label}</Text></Pressable>)}</View> : null}
        {segment.navigationUrl ? <Pressable accessibilityRole="link" style={styles.routeLink} onPress={() => { void Linking.openURL(segment.navigationUrl as string).catch(() => undefined); }}><Text numberOfLines={1} style={styles.routeLinkText}>🗺️ 導航路線</Text></Pressable> : null}
      </View> : null}
    </View>
  );
});

function formatTemperature(weather: WeatherSummary) { const min = weather.temperatureMinC == null ? null : Math.round(weather.temperatureMinC); const max = weather.temperatureMaxC == null ? null : Math.round(weather.temperatureMaxC); if (min !== null && max !== null) return `${min}–${max}°C`; if (max !== null) return `${max}°C`; if (min !== null) return `${min}°C`; return '溫度未知'; }
export function EmptyTimeline() { return <View style={styles.empty}><PuppyMascot puppy="-7" size={165} accessibilityLabel="目前沒有景點" /><Text style={styles.emptyText}>目前還沒有景點，新增第一站吧！</Text></View>; }
export function InsertSpotButton({ position, onPress }: { position: number; onPress: (position: number) => void }) { return <Pressable accessibilityRole="button" accessibilityLabel="在這裡插入景點" style={[styles.insertButton, { borderWidth: 0, borderTopWidth: 1, borderStyle: 'dashed', borderRadius: 0, paddingHorizontal: 0, minHeight: 28, width: '100%', marginTop: 0, marginBottom: 4, opacity: 0.15 }]} onPress={() => onPress(position)}><Text style={[styles.insertButtonText, { fontSize: 16 }]}>＋</Text></Pressable>; }
// Legacy accessibility copy: ＋ 在這裡插入景點
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
    <Text accessibilityLabel={`${category} 類別圖示`} style={[styles.categoryBadgeIcon, { color: palette.color }]}>{getCategoryIcon(category)}</Text>
    <Text numberOfLines={1} style={[styles.categoryBadgeText, { color: palette.color }]}>{category}</Text>
  </View>;
}
function formatDistance(distanceKm: number) { return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} 公尺` : `${distanceKm.toFixed(1)} 公里`; }

const styles = {
  ...StyleSheet.create({
    empty: { width: '100%', padding: 38, alignItems: 'center', gap: 8, boxSizing: 'border-box' },
    emptyText: { color: EDITORIAL_COLORS.taupe },
    insertButton: { alignSelf: 'center', minHeight: 40, justifyContent: 'center', borderWidth: 1, borderStyle: 'dashed', borderColor: EDITORIAL_COLORS.terracotta, borderRadius: 999, paddingHorizontal: 14, marginTop: -4, marginBottom: 8 },
    insertButtonText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800' },
    row: { width: '100%', flexDirection: 'row', minHeight: 130 },
    rail: { width: 24, alignItems: 'center' },
    line: { position: 'absolute', top: 18, bottom: 0, width: 2, backgroundColor: EDITORIAL_COLORS.line },
    dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: EDITORIAL_COLORS.terracotta, borderWidth: 3, borderColor: EDITORIAL_COLORS.terracottaSoft, zIndex: 1 },
    card: { flex: 1, minWidth: 0, maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', marginBottom: 12, padding: 12, borderRadius: 14, borderWidth: 0, position: 'relative' },
    cardActive: { shadowOpacity: 0.08 },
    cardBody: { width: '100%', flexDirection: 'row', alignItems: 'stretch', gap: 10, position: 'relative' },
    content: { flex: 1, minWidth: 0, gap: 5 },
    cardHeader: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 6 },
    time: { fontWeight: '800', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
    category: { fontSize: 12, flexShrink: 1 },
    categoryWrap: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 1 },
    inlineMascot: { flexShrink: 0 },
    weatherRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
    weatherText: { fontSize: 12, fontWeight: '700' },
    rainProbability: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800' },
    weatherAlerts: { gap: 4 },
    weatherWarning: { color: EDITORIAL_COLORS.amberText, backgroundColor: EDITORIAL_COLORS.amberSoft, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, fontSize: 12, fontWeight: '800' },
    extremeWarning: { color: EDITORIAL_COLORS.dangerText, backgroundColor: EDITORIAL_COLORS.dangerSoft, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 3, fontSize: 12, fontWeight: '800' },
    name: { fontSize: 18, fontWeight: '800' },
    duration: { fontSize: 13 },
    warningStack: { position: 'absolute', top: 10, right: 10, zIndex: 2, alignItems: 'flex-end', gap: 4, maxWidth: '72%' },
    openingWarning: { borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '800' },
    overlapWarning: { color: EDITORIAL_COLORS.dangerText, backgroundColor: EDITORIAL_COLORS.dangerSoft, borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '800' },
    shiftButton: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 10, borderRadius: 8, backgroundColor: EDITORIAL_COLORS.paper, borderWidth: 1, borderColor: EDITORIAL_COLORS.line },
    shiftButtonText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800' },
    address: { fontSize: 13 },
    notes: { fontSize: 13, fontStyle: 'italic' },
    navigation: { alignSelf: 'flex-start', color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800', minHeight: 44, paddingVertical: 14 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 5 },
    actionButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9 },
    reorderText: { fontWeight: '800' },
    disabledAction: { color: '#A9A397' },
    edit: { fontWeight: '700' },
    delete: { color: EDITORIAL_COLORS.dangerText, fontWeight: '700' },
    utilityAction: { fontWeight: '700' },
    voucher: { color: EDITORIAL_COLORS.terracotta, fontWeight: '700' },
    favorite: { minWidth: 48, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    favoriteText: { color: EDITORIAL_COLORS.taupe, fontWeight: '700' },
    transition: { alignSelf: 'center', width: '100%', gap: 7, marginTop: -5, marginBottom: 10, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: EDITORIAL_COLORS.sand, borderWidth: 1, borderColor: EDITORIAL_COLORS.line },
    transitionMain: { flexDirection: 'row', alignItems: 'center', gap: 7 },
    transitionText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '700', flexShrink: 1 },
    routeModes: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingLeft: 53 },
    routeModeButton: { minHeight: 36, justifyContent: 'center', borderRadius: 8, paddingHorizontal: 9, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, backgroundColor: EDITORIAL_COLORS.paper },
    routeModeButtonActive: { borderColor: EDITORIAL_COLORS.terracotta, backgroundColor: EDITORIAL_COLORS.terracottaSoft },
    routeModeText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '700', flexShrink: 1 },
    routeLink: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', marginLeft: 53 },
    routeLinkText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800' },
  }),
  // Mobile-friendly transport presentation: a compact, neutral pill.
  transition: { alignSelf: 'flex-start', width: 'auto', maxWidth: '100%', minWidth: 0, gap: 4, marginLeft: 24, marginTop: 4, marginBottom: 12, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#F1F5F9', borderWidth: 0, borderColor: 'transparent', borderLeftWidth: 2, borderLeftColor: EDITORIAL_COLORS.line } as const,
  transitionContext: { flexDirection: 'row', alignItems: 'center', gap: 4, maxWidth: '100%', minWidth: 0 } as const,
  transitionEndpoint: { maxWidth: 120, minWidth: 0, flexShrink: 1, color: '#8C6D58', fontSize: 11, fontWeight: '500' } as const,
  transitionArrow: { color: '#8C6D58', fontSize: 11, fontWeight: '500', flexShrink: 0 } as const,
  transitionMain: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 28 } as const,
  transitionText: { color: '#475569', fontSize: 11, fontWeight: '600', flexShrink: 1 } as const,
  // Extend the rail through the compact transport pill so the timeline never
  // appears broken between two cards.
  line: { bottom: -30 } as const,
  // The category is rendered once as an outer, position-safe badge. The
  // legacy inline wrapper remains hidden to avoid duplicate labels.
  categoryWrap: { display: 'none' } as const,
  categoryBadge: { position: 'absolute', top: 8, right: 48, zIndex: 4, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, minHeight: 24 } as const,
  categoryBadgeCompact: { right: 48, maxWidth: '100%' } as const,
  categoryBadgeInline: { position: 'relative', top: 0, right: 0, zIndex: 0, maxWidth: '70%' } as const,
  categoryBadgeIcon: { fontSize: 14, lineHeight: 17, flexShrink: 0 } as const,
  categoryBadgeText: { fontSize: 11, fontWeight: '700', letterSpacing: 0.3, flexShrink: 1 } as const,
  // Navigation is a compact pill; the linedog sits inside rather than in the
  // category badge so the card header stays clean on narrow screens.
  routeLink: { alignSelf: 'flex-start', width: 'auto', maxWidth: '100%', minWidth: 0, minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 999, backgroundColor: '#F1F5F9', borderWidth: 0, paddingHorizontal: 12, paddingVertical: 6, marginLeft: 0 } as const,
  routeLinkText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800', flexShrink: 1 } as const,
  navigationButton: { alignSelf: 'flex-start', width: 'auto', maxWidth: '100%', minWidth: 0, minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 999, backgroundColor: '#F1F5F9', borderWidth: 0, paddingHorizontal: 12, paddingVertical: 6 } as const,
  navigationPuppy: { width: 20, height: 20, flexShrink: 0, backgroundColor: 'transparent', opacity: 1 } as const,
  navigation: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800', flexShrink: 1 } as const,
  thumbnailOverlay: { position: 'absolute', left: 0, top: 0, width: 64, height: 64, borderRadius: 16, zIndex: 3 } as const,
  lightboxBackdrop: { flex: 1, backgroundColor: 'rgba(28,25,23,0.9)', alignItems: 'center', justifyContent: 'center' } as const,
  lightboxContent: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', position: 'relative' } as const,
  lightboxImagePressable: { width: '100%', height: '82%', alignItems: 'center', justifyContent: 'center' } as const,
  lightboxImage: { width: '100%', height: '100%', maxWidth: 960 } as const,
  lightboxFallback: { alignItems: 'center', justifyContent: 'center', gap: 10 } as const,
  lightboxFallbackText: { color: '#F5F5F4', fontSize: 14, fontWeight: '600' } as const,
  lightboxClose: { position: 'absolute', top: 24, right: 20, minWidth: 44, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' } as const,
  lightboxCloseText: { color: '#FFFFFF', fontSize: 30, lineHeight: 34, fontWeight: '300' } as const,
  lightboxActions: { position: 'absolute', bottom: 34, left: 20, right: 20, alignItems: 'center', gap: 8 } as const,
  lightboxReplaceButton: { minHeight: 44, borderRadius: 22, justifyContent: 'center', paddingHorizontal: 18, backgroundColor: 'rgba(255,255,255,0.14)' } as const,
  lightboxReplaceText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' } as const,
  lightboxSearchRow: { width: '100%', maxWidth: 520, flexDirection: 'row', alignItems: 'center', gap: 8 } as const,
  lightboxSearchInput: { flex: 1, minWidth: 0, minHeight: 44, borderRadius: 22, paddingHorizontal: 16, backgroundColor: '#FFFFFF', color: '#292524', fontSize: 14 } as const,
  lightboxSearchButton: { minHeight: 44, borderRadius: 22, justifyContent: 'center', paddingHorizontal: 18, backgroundColor: '#8C6D58' } as const,
  lightboxSearchButtonDisabled: { opacity: 0.5 } as const,
  lightboxSearchButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' } as const,
  lightboxSearchError: { color: '#FECACA', fontSize: 12, textAlign: 'center' } as const,
};

// Compatibility markers retained for previous UI checks: ??銝宏 / ??銝宏 / ?妣 ?? Google Maps 撠
