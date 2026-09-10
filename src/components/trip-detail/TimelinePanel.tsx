import React, { useMemo, useState } from 'react';
import { Alert, LayoutAnimation, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { TimelineViewport } from './TimelineViewport';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { ItineraryItem } from '@/lib/itinerary';
import type { Trip } from '@/lib/trips';
import type { Voucher } from '@/lib/vouchers';
import { exportTripCalendar } from '@/lib/calendar';
import { DayTabs } from '@/components/DayTabs';
import { TripMap } from '@/components/TripMap';
import { ItineraryTimeline } from '@/components/ItineraryTimeline';
import { SkeletonCard } from '@/components/SkeletonCard';
import { TodayFocusCard } from '@/components/TodayFocusCard';
import type { ThemeMode } from '@/lib/theme';
import type { getTripDetailLayout } from '@/lib/trip-detail-layout';
import { EDITORIAL_COLORS } from '@/lib/theme';
import { buildDaySchedule, type ScheduleContext } from '@/lib/schedule';
import { tripDateForDay } from '@/lib/trip-dates';
import { applyOptimizedSchedule, optimizeRoute, type RouteOptimizationResult } from '@/lib/route-optimizer';
import { createRouteEstimator, estimateRouteSequence, type RoutePoint } from '@/lib/routes';
import { formatRouteDuration, formatRouteLegContext, getRouteOptimizationStatus } from '@/lib/route-connector';

type Layout = ReturnType<typeof getTripDetailLayout>;
type Props = {
  trip: Trip;
  day: number;
  days: number[];
  items: ItineraryItem[];
  visibleItems: ItineraryItem[];
  themeMode: ThemeMode;
  layout: Layout;
  insets: EdgeInsets;
  isMapOpen: boolean;
  isMapLoading: boolean;
  isDayTransitioning: boolean;
  focusedItemId: string | null;
  vouchers: Voucher[];
  timelineScrollRef: React.RefObject<ScrollView | null>;
  onDayChange: (day: number) => void;
  onToggleMap: () => void;
  onMapMarkerPress: (itemId: string) => void;
  onFocusedVoucher: (voucher: Voucher) => void;
  onSwitchToBackupPlan?: (primaryItemId: string, backupItemId: string) => void | Promise<void>;
  onEdit: (item: ItineraryItem) => void;
  onDelete: (item: ItineraryItem) => Promise<void>;
  onReorder: (order: { id: string; position: number }[]) => Promise<void>;
  onApplyRouteOptimization?: (items: ItineraryItem[]) => Promise<void>;
  onAdd: () => void;
};

type OptimizationPreview = { result: RouteOptimizationResult<ItineraryItem>; scheduledItems: ItineraryItem[] };
const routeSequenceEstimator = createRouteEstimator();

function toRoutePoint(item: ItineraryItem): RoutePoint {
  const latitude = Number(item.latitude);
  const longitude = Number(item.longitude);
  return {
    latitude: Number.isFinite(latitude) ? latitude : undefined,
    longitude: Number.isFinite(longitude) ? longitude : undefined,
    title: item.location_name,
    address: item.address,
  };
}

export function TimelinePanel({ trip, day, days, items, visibleItems, themeMode, layout, insets, isMapOpen, isMapLoading, isDayTransitioning, focusedItemId, vouchers, timelineScrollRef, onDayChange, onToggleMap, onMapMarkerPress, onFocusedVoucher, onSwitchToBackupPlan, onEdit, onDelete, onReorder, onApplyRouteOptimization, onAdd }: Props) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [optimizationPreview, setOptimizationPreview] = useState<OptimizationPreview | null>(null);
  const [optimizationBusy, setOptimizationBusy] = useState(false);
  const scheduleContext = useMemo<ScheduleContext>(() => ({ tripStartDate: trip.start_date, dayNumber: day, defaultDepartureTime: trip.default_departure_time, timezone: trip.timezone }), [day, trip.default_departure_time, trip.start_date, trip.timezone]);
  const scheduled = useMemo(() => buildDaySchedule(visibleItems, scheduleContext), [scheduleContext, visibleItems]);
  const scheduleDate = useMemo(() => tripDateForDay(trip.start_date, day), [day, trip.start_date]);
  const persistedWeather = useMemo(() => {
    for (const candidate of [trip, ...visibleItems]) {
      if (!candidate || typeof candidate !== 'object') continue;
      const record = candidate as Record<string, unknown>;
      if ('weather' in record || 'weather_forecast' in record || 'forecast' in record || 'weatherCode' in record || 'weather_code' in record) return candidate;
    }
    return null;
  }, [trip, visibleItems]);
  function toggleMap() { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); onToggleMap(); }
  function completeSpot(itemId: string) { setCompletedIds((current) => new Set(current).add(itemId)); }
  async function openOptimizationPreview() {
    if (optimizationBusy) return;
    const result = optimizeRoute(visibleItems);
    if (result.strategy === 'none') {
      Alert.alert('無法最佳化路線', result.reason === 'missing-coordinates' ? '請先補齊所有景點的經緯度座標。' : '至少需要 3 個景點才能進行路線最佳化。');
      return;
    }
    setOptimizationBusy(true);
    try {
      const originalRoute = await estimateRouteSequence(visibleItems.map(toRoutePoint), 'DRIVING', routeSequenceEstimator);
      const optimizedRoute = await estimateRouteSequence(result.items.map(toRoutePoint), 'DRIVING', routeSequenceEstimator);
      const refinedResult: RouteOptimizationResult<ItineraryItem> = {
        ...result,
        originalDistanceKm: originalRoute.totalDistanceKm,
        originalDurationMinutes: originalRoute.totalDurationMinutes,
        totalDistanceKm: optimizedRoute.totalDistanceKm,
        totalDurationMinutes: optimizedRoute.totalDurationMinutes,
        legs: optimizedRoute.legs.map((leg, index) => ({
          fromId: result.items[index].id,
          toId: result.items[index + 1].id,
          distanceKm: leg.distanceKm,
          durationMinutes: leg.durationMinutes,
          mode: 'DRIVING',
        })),
      };
      setOptimizationPreview({ result: refinedResult, scheduledItems: applyOptimizedSchedule(refinedResult, { defaultStartTime: trip.default_departure_time ?? '09:00' }) });
    } catch (error) {
      Alert.alert('Route optimization failed', error instanceof Error ? error.message : 'Unable to estimate routes');
    } finally {
      setOptimizationBusy(false);
    }
  }
  async function applyOptimization() {
    if (!optimizationPreview || optimizationBusy) return;
    setOptimizationBusy(true);
    try {
      if (onApplyRouteOptimization) await onApplyRouteOptimization(optimizationPreview.scheduledItems);
      else await onReorder(optimizationPreview.scheduledItems.map((item, position) => ({ id: item.id, position })));
      setOptimizationPreview(null);
    } catch (error) {
      Alert.alert('套用最佳化失敗', error instanceof Error ? error.message : '請稍後再試。');
    } finally {
      setOptimizationBusy(false);
    }
  }
  async function exportCalendar() {
    try { await exportTripCalendar(trip, items); }
    catch (error: any) { Alert.alert('匯出失敗', error?.message ?? '無法建立行事曆檔案。'); }
  }
  const { width, height } = useWindowDimensions();
  const optimizationStatus = optimizationPreview
    ? getRouteOptimizationStatus(optimizationPreview.result.originalDistanceKm, optimizationPreview.result.totalDistanceKm)
    : null;
  return <>
    <View style={styles.dayHeader}><Text style={styles.dayTitle}>Day {day} 行程</Text><Pressable style={styles.calendarButton} onPress={() => void exportCalendar()}><Text style={styles.calendarText}>📅 匯出行事曆</Text></Pressable></View>
    <Pressable accessibilityRole="button" accessibilityLabel="最佳化今日路線" style={styles.optimizeButton} onPress={openOptimizationPreview}><Text style={styles.optimizeText}>🧭 最佳化今日路線</Text></Pressable>
    <DayTabs days={days} selected={day} onChange={onDayChange} themeMode={themeMode} />
    <TodayFocusCard schedule={scheduled} items={items} vouchers={vouchers} scheduleDate={scheduleDate} timezone={trip.timezone} themeMode={themeMode} completedIds={completedIds} onComplete={completeSpot} onPreviewVoucher={onFocusedVoucher} onSwitchToBackupPlan={onSwitchToBackupPlan} persistedWeather={persistedWeather} compact={layout.compact} />
    <Pressable style={styles.mapToggle} onPress={toggleMap} accessibilityRole="button" accessibilityState={{ expanded: isMapOpen }}><Text numberOfLines={1} style={styles.mapToggleText}>{isMapOpen ? '🗺️ 隱藏地圖' : '🗺️ 查看地圖路線 (點擊展開)'}</Text></Pressable>
    {isMapOpen && <View style={[styles.mapPane, { height: layout.mapMinHeight }]}>{isMapLoading ? <SkeletonCard variant="map" /> : <TripMap items={items} day={day} onMarkerPress={onMapMarkerPress} />}</View>}
    <TimelineViewport width={width} height={height}>
      {isDayTransitioning ? <View style={styles.skeletonStack}><SkeletonCard /><SkeletonCard /></View> : <ItineraryTimeline items={visibleItems} themeMode={themeMode} focusedItemId={focusedItemId} vouchers={vouchers} onPreviewVoucher={onFocusedVoucher} scheduleContext={scheduleContext} onEdit={onEdit} onDelete={onDelete} onReorder={onReorder} />}
    </TimelineViewport>
    <Modal visible={Boolean(optimizationPreview)} transparent animationType="fade" onRequestClose={() => { if (!optimizationBusy) setOptimizationPreview(null); }}>
      <View style={styles.modalBackdrop}><View style={styles.modalCard}>
        <View style={styles.modalHeader}><Text style={styles.modalTitle}>🧭 今日路線最佳化</Text><Pressable accessibilityRole="button" accessibilityLabel="關閉路線最佳化預覽" onPress={() => { if (!optimizationBusy) setOptimizationPreview(null); }}><Text style={styles.modalClose}>×</Text></Pressable></View>
        {optimizationPreview ? <>
          <Text style={styles.modalSummary}>距離 {formatDistance(optimizationPreview.result.originalDistanceKm)} → {formatDistance(optimizationPreview.result.totalDistanceKm)}</Text>
          {optimizationStatus ? <View style={styles.optimizationStatusRow}><Text style={[styles.optimizationStatusBadge, optimizationStatus.isOptimal ? styles.optimizationStatusOptimal : styles.optimizationStatusSaving]}>{optimizationStatus.label}</Text></View> : null}
          {optimizationStatus && !optimizationStatus.isOptimal ? <Text style={styles.modalHint}>{optimizationPreview.result.optimized ? '建議順序會固定第一站，重新安排後續景點。' : '目前順序已接近最短路線，仍可套用建議時間。'}</Text> : null}
           <Text style={styles.modalHint}>{`總車程 ${formatRouteDuration(optimizationPreview.result.originalDurationMinutes)} → ${formatRouteDuration(optimizationPreview.result.totalDurationMinutes)}`}</Text>
          <ScrollView style={styles.previewList} contentContainerStyle={styles.previewContent}>
            {optimizationPreview.scheduledItems.map((item, index) => {
              const previousItem = optimizationPreview.scheduledItems[index - 1];
              const leg = optimizationPreview.result.legs[index - 1];
              return <React.Fragment key={item.id}>
                {previousItem && leg ? <View style={styles.routeConnector}>
                  <View style={styles.routeRail}><View style={styles.routeDot} /></View>
                  <View style={styles.routeConnectorBody}>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={styles.routeConnectorLabel}>{formatRouteLegContext({ fromName: previousItem.location_name, toName: item.location_name, durationMinutes: leg.durationMinutes, mode: leg.mode })}</Text>
                  </View>
                </View> : null}
                <View style={styles.previewRow}>
              <View style={styles.previewStop}><Text style={styles.previewIndex}>{index + 1}</Text><View style={styles.previewCopy}><Text style={styles.previewTime}>{item.time ?? '未設定'}</Text><Text style={styles.previewName}>{item.location_name}</Text></View></View>
                </View>
              </React.Fragment>;
            })}
          </ScrollView>
          <View style={styles.modalActions}><Pressable style={styles.cancelButton} disabled={optimizationBusy} onPress={() => setOptimizationPreview(null)}><Text style={styles.cancelText}>取消</Text></Pressable><Pressable style={styles.applyButton} disabled={optimizationBusy} onPress={() => void applyOptimization()}><Text style={styles.applyText}>{optimizationBusy ? '套用中…' : '確認套用'}</Text></Pressable></View>
        </> : null}
      </View></View>
    </Modal>
  </>;
}

function formatDistance(distanceKm: number): string {
  return distanceKm < 1 ? `${Math.round(distanceKm * 1000)} 公尺` : `${distanceKm.toFixed(1)} 公里`;
}

const styles = StyleSheet.create({
  mobileTimeline: { width: '100%', paddingVertical: 12 },
  mobileFab: { position: 'relative', alignSelf: 'flex-end', marginTop: 16 },
  dayHeader: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  dayTitle: { fontSize: 18, fontWeight: '800', flexShrink: 1 },
  optimizeButton: { width: '100%', minHeight: 44, justifyContent: 'center', borderRadius: 10, backgroundColor: EDITORIAL_COLORS.terracotta, borderWidth: 1, borderColor: EDITORIAL_COLORS.terracotta, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  optimizeText: { color: EDITORIAL_COLORS.paper, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  calendarButton: { flexShrink: 0, minHeight: 44, justifyContent: 'center', borderRadius: 10, backgroundColor: EDITORIAL_COLORS.terracottaSoft, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, paddingHorizontal: 10, paddingVertical: 8 },
  calendarText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800' },
  mapToggle: { width: '100%', minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: EDITORIAL_COLORS.sand, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, overflow: 'hidden' },
  mapToggleText: { color: EDITORIAL_COLORS.terracotta, fontSize: 14, fontWeight: '800', textAlign: 'center' },
  mapPane: { width: '100%', maxWidth: '100%', minWidth: 0, borderRadius: 18, overflow: 'hidden', marginBottom: 12 },
  timelinePane: { flex: 1, minHeight: 0, width: '100%', minWidth: 0, borderRadius: 18, overflow: 'hidden' },
  paneContent: { width: '100%', paddingBottom: 100, boxSizing: 'border-box' },
  skeletonStack: { gap: 12 },
  fab: { position: 'absolute', zIndex: 1000, minHeight: 44, justifyContent: 'center', borderRadius: 12, backgroundColor: EDITORIAL_COLORS.terracotta, borderWidth: 1, borderColor: EDITORIAL_COLORS.terracotta },
  buttonText: { color: 'white', fontWeight: '800' },
  modalBackdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(31,31,31,.48)' },
  modalCard: { width: '100%', maxWidth: 560, maxHeight: '88%', alignSelf: 'center', backgroundColor: EDITORIAL_COLORS.paper, borderRadius: 16, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, padding: 18, gap: 12 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  modalTitle: { color: EDITORIAL_COLORS.charcoal, fontSize: 20, fontWeight: '900' },
  modalClose: { color: EDITORIAL_COLORS.taupe, fontSize: 28, lineHeight: 30, paddingHorizontal: 8 },
  modalSummary: { color: EDITORIAL_COLORS.charcoal, fontSize: 15, fontWeight: '800' },
  optimizationStatusRow: { flexDirection: 'row', alignItems: 'center' },
  optimizationStatusBadge: { alignSelf: 'flex-start', borderRadius: 999, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, fontSize: 12, fontWeight: '800' },
  optimizationStatusOptimal: { color: EDITORIAL_COLORS.taupe, backgroundColor: EDITORIAL_COLORS.sand, borderColor: EDITORIAL_COLORS.line },
  optimizationStatusSaving: { color: EDITORIAL_COLORS.terracotta, backgroundColor: EDITORIAL_COLORS.terracottaSoft, borderColor: EDITORIAL_COLORS.terracottaSoft },
  modalHint: { color: EDITORIAL_COLORS.taupe, fontSize: 13, lineHeight: 19 },
  previewList: { maxHeight: 360 },
  previewContent: { gap: 8, paddingVertical: 4 },
  previewRow: { borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 10, padding: 10, gap: 7 },
  previewStop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  routeConnector: { flexDirection: 'row', alignItems: 'stretch', minHeight: 58, paddingHorizontal: 8, gap: 10 },
  routeRail: { width: 20, alignItems: 'center', justifyContent: 'center' },
  routeDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: EDITORIAL_COLORS.terracotta, borderWidth: 2, borderColor: EDITORIAL_COLORS.paper },
  routeConnectorBody: { flex: 1, minWidth: 0, justifyContent: 'center', borderLeftWidth: 2, borderLeftColor: EDITORIAL_COLORS.terracottaSoft, paddingLeft: 10 },
  routeConnectorLabel: { flex: 1, minWidth: 0, color: EDITORIAL_COLORS.taupe, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  previewIndex: { width: 26, height: 26, borderRadius: 13, textAlign: 'center', paddingTop: 4, color: EDITORIAL_COLORS.paper, backgroundColor: EDITORIAL_COLORS.terracotta, fontWeight: '900' },
  previewCopy: { flex: 1, gap: 2 },
  previewTime: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '900' },
  previewName: { color: EDITORIAL_COLORS.charcoal, fontSize: 16, fontWeight: '800' },
  previewLeg: { color: EDITORIAL_COLORS.taupe, fontSize: 12, paddingLeft: 36 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingTop: 4 },
  cancelButton: { minHeight: 44, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, paddingHorizontal: 16 },
  cancelText: { color: EDITORIAL_COLORS.charcoal, fontWeight: '800' },
  applyButton: { minHeight: 44, justifyContent: 'center', borderRadius: 10, backgroundColor: EDITORIAL_COLORS.terracotta, paddingHorizontal: 16 },
  applyText: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
});
