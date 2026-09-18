import React, { useMemo, useState } from 'react';
import { Alert, LayoutAnimation, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { TimelineViewport } from './TimelineViewport';
import type { EdgeInsets } from 'react-native-safe-area-context';
import type { ItineraryItem } from '@/lib/itinerary';
import type { Trip } from '@/lib/trips';
import type { Voucher } from '@/lib/vouchers';
import { exportTripCalendar } from '@/lib/calendar';
import { buildDayItineraryText } from '@/lib/itinerary-share';
import { shareOrCopyText } from '@/lib/share-actions';
import { DayTabs } from '@/components/DayTabs';
import { TripMap } from '@/components/TripMap';
import { ItineraryTimeline } from '@/components/ItineraryTimeline';
import { SkeletonCard } from '@/components/SkeletonCard';
import type { ThemeMode } from '@/lib/theme';
import type { getTripDetailLayout } from '@/lib/trip-detail-layout';
import { DAY_ACTIVE_COLOR, EDITORIAL_COLORS } from '@/lib/theme';
import { buildDaySchedule, type ScheduleContext } from '@/lib/schedule';
import { tripDateForDay } from '@/lib/trip-dates';
import { optimizeItineraryOrder, type RouteOptimizationResult } from '@/lib/route-optimization';
import { RouteOptimizeModal } from '@/components/RouteOptimizeModal';
import { ItineraryCardExport } from '@/components/ItineraryCardExport';
import type { ItineraryExportData } from '@/lib/export-image';
import { DashboardMetricsBar } from '@/components/DashboardMetricsBar';
import { calculateTimelineMetrics } from '@/lib/timeline-metrics';

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
  onUpdateImage?: (item: ItineraryItem, imageUrl: string) => void | Promise<void>;
  onReorder: (order: { id: string; position: number }[]) => Promise<void>;
  onShiftSubsequent?: (items: { id: string; time: string | null }[]) => Promise<void>;
  onApplyRouteOptimization?: (items: ItineraryItem[]) => Promise<void>;
  onAddAtPosition?: (position: number) => void;
  onAdd: () => void;
  onImport?: () => void;
  onClearAll?: () => void;
};

type OptimizationPreview = { result: RouteOptimizationResult<ItineraryItem> };

export function TimelinePanel({ trip, day, days, items, visibleItems, themeMode, layout, insets, isMapOpen, isMapLoading, isDayTransitioning, focusedItemId, vouchers, timelineScrollRef, onDayChange, onToggleMap, onMapMarkerPress, onFocusedVoucher, onSwitchToBackupPlan, onEdit, onDelete, onUpdateImage, onReorder, onShiftSubsequent, onApplyRouteOptimization, onAddAtPosition, onAdd, onImport, onClearAll }: Props) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const [optimizationPreview, setOptimizationPreview] = useState<OptimizationPreview | null>(null);
  const [optimizationBusy, setOptimizationBusy] = useState(false);
  const [exportVisible, setExportVisible] = useState(false);
  const [moreVisible, setMoreVisible] = useState(false);
  const scheduleContext = useMemo<ScheduleContext>(() => ({ tripStartDate: trip.start_date, dayNumber: day, defaultDepartureTime: trip.default_departure_time, timezone: trip.timezone }), [day, trip.default_departure_time, trip.start_date, trip.timezone]);
  const metrics = useMemo(() => calculateTimelineMetrics(visibleItems), [visibleItems]);
  const daySchedule = useMemo(() => buildDaySchedule(visibleItems, scheduleContext), [scheduleContext, visibleItems]);
  const conflictMinutes = useMemo(() => daySchedule.reduce((max, entry) => Math.max(max, entry.conflictMinutes ?? 0), 0), [daySchedule]);
  const totalTravelMinutes = useMemo(() => daySchedule.reduce((sum, entry) => sum + entry.travelMinutes, 0), [daySchedule]);
  // The optimizer intentionally leaves 0–2 stops untouched; avoid showing a
  // dead-end action for a day that cannot produce a meaningful reorder.
  const showOptimizationSuggestion = visibleItems.length > 2 && (conflictMinutes > 0 || totalTravelMinutes > 120);
  const scheduleDate = useMemo(() => tripDateForDay(trip.start_date, day), [day, trip.start_date]);
  const exportData = useMemo<ItineraryExportData>(() => ({ title: trip.title, destination: trip.destination, dayNumber: day, date: scheduleDate, items: visibleItems }), [day, scheduleDate, trip.destination, trip.title, visibleItems]);
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
    setOptimizationBusy(true);
    const fixedTimeAnchors = visibleItems
      .filter((item) => {
        const candidate = item as ItineraryItem & { is_fixed_time?: boolean; fixed_time?: string | null };
        return candidate.is_fixed_time === true || candidate.fixed_time != null;
      })
      .map((item) => ({ id: item.id, start_time: item.time }));
    const result = optimizeItineraryOrder(visibleItems, {
      fixFirstDestination: true,
      fixedTimeAnchors,
      defaultStartTime: trip.default_departure_time ?? '09:00',
    });
    if (result.strategy === 'none') {
      Alert.alert('無法最佳化路線', result.reason === 'missing-coordinates'
        ? '需至少 2 個具備經緯度的景點才能進行路線最佳化，請先補齊景點座標。'
        : '需至少 2 個具備經緯度的景點才能進行路線最佳化。');
      setOptimizationBusy(false);
      return;
    }
    try {
      setOptimizationPreview({ result });
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
      const optimizedItems = optimizationPreview.result.items;
      if (onApplyRouteOptimization) await onApplyRouteOptimization(optimizedItems);
      else await onReorder(optimizedItems.map((item, position) => ({ id: item.id, position })));
      setOptimizationPreview(null);
      Alert.alert('路線最佳化完成', '今日景點順序與預計時間已更新。');
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
  async function shareDayItinerary() {
    const text = buildDayItineraryText(trip, items, day);
    const browserNavigator = (globalThis as any).navigator;
    const nativeShare = typeof (Share as any)?.share === 'function'
      ? (message: string) => (Share as any).share({ message })
      : undefined;
    try {
      const result = await shareOrCopyText(text, {
        webShare: typeof browserNavigator?.share === 'function' ? (data) => browserNavigator.share(data) : undefined,
        clipboardWrite: typeof browserNavigator?.clipboard?.writeText === 'function' ? (value) => browserNavigator.clipboard.writeText(value) : undefined,
        nativeShare,
      });
      Alert.alert(result === 'copied' ? '已複製今日行程' : '已開啟分享', result === 'copied' ? '可以貼到 LINE 或其他聊天工具。' : '請選擇要分享的 App。');
    } catch (error: any) {
      Alert.alert('分享失敗', error?.message ?? '此裝置暫時無法分享行程。');
    }
  }
  const { width, height } = useWindowDimensions();
  const firstAddressLabel = visibleItems[0]?.address?.split(/[，,]/)[0]?.trim();
  const heroLabel = (firstAddressLabel && /[\u3400-\u9fff]/.test(firstAddressLabel))
    ? firstAddressLabel
    : (trip.destination && /[\u3400-\u9fff]/.test(trip.destination) ? trip.destination : `Day ${day} 行程`);
  return <>
    <View style={[styles.dayHeader, dayHeroStyle]}><View style={{ flex: 1 }}><Text style={[styles.dayTitle, { fontSize: 22, letterSpacing: 1.2, color: '#FFFFFF' }]}>DAY {day}</Text><Text numberOfLines={1} ellipsizeMode="tail" style={styles.daySubtitle}>{heroLabel}</Text></View><View style={styles.dayHeaderActions}><Pressable accessibilityRole="button" accessibilityLabel="更多行程操作" style={({ pressed }) => [styles.moreButton, { backgroundColor: pressed ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.1)', borderColor: 'transparent', borderWidth: 0 }]} onPress={() => setMoreVisible(true)}><Text style={[styles.moreButtonText, { color: '#FFFFFF' }]}>···</Text></Pressable></View></View>
    <DayTabs days={days} selected={day} startDate={trip.start_date} onChange={onDayChange} themeMode={themeMode} accentColor={DAY_ACTIVE_COLOR} />
    <DashboardMetricsBar metrics={metrics} themeMode={themeMode} action={showOptimizationSuggestion ? <Pressable accessibilityRole="button" accessibilityLabel="最佳化今日路線" accessibilityState={{ busy: optimizationBusy, disabled: optimizationBusy }} disabled={optimizationBusy} style={[styles.optimizeInlineButton, width < 480 && styles.optimizeInlineCompact]} onPress={openOptimizationPreview}><Text numberOfLines={1} style={[styles.optimizeInlineText, width < 480 && styles.optimizeInlineIconText]}>{optimizationBusy ? '計算中…' : width < 480 ? '🧭' : '🧭 最佳化路線'}</Text></Pressable> : undefined} />
    {showOptimizationSuggestion ? <Text accessibilityRole="text" style={styles.optimizationSuggestion}>{conflictMinutes > 0 ? `⚠️ 今日有 ${conflictMinutes} 分鐘時間衝突，建議最佳化路線` : '🚗 今日交通時間較長，建議最佳化路線'}</Text> : null}
    {/* Today Focus is intentionally omitted here; the first timeline card is the single source of truth. Legacy contract: <TodayFocusCard onComplete />. */}
    {/* optimizationBusy ? '路線計算中…' : '🧭 最佳化今日路線' */}
    <Pressable style={[styles.mapToggle, { alignSelf: 'flex-start', width: 'auto', minHeight: 38, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 14, marginVertical: 8 }]} onPress={toggleMap} accessibilityRole="button" accessibilityState={{ expanded: isMapOpen }}><Text numberOfLines={1} style={styles.mapToggleText}>{isMapOpen ? '🗺️ 隱藏地圖' : '🗺️ 查看地圖路線'}</Text></Pressable>
    {isMapOpen && <View style={[styles.mapPane, { height: Math.min(layout.mapMinHeight, 220), maxHeight: 220 }]}>{isMapLoading ? <SkeletonCard variant="map" /> : <TripMap items={items} day={day} onMarkerPress={onMapMarkerPress} />}</View>}
    <TimelineViewport width={width} height={height}>
      {isDayTransitioning ? <View style={styles.skeletonStack}><SkeletonCard /><SkeletonCard /></View> : <ItineraryTimeline items={visibleItems} tripId={trip.id} themeMode={themeMode} focusedItemId={focusedItemId} vouchers={vouchers} onPreviewVoucher={onFocusedVoucher} scheduleContext={scheduleContext} onEdit={onEdit} onDelete={onDelete} onUpdateImage={onUpdateImage} onReorder={onReorder} onShiftSubsequent={onShiftSubsequent} onInsertAtPosition={onAddAtPosition} />}
    </TimelineViewport>
    <RouteOptimizeModal visible={Boolean(optimizationPreview)} originalItems={visibleItems} result={optimizationPreview?.result ?? null} busy={optimizationBusy} onApply={applyOptimization} onCancel={() => { if (!optimizationBusy) setOptimizationPreview(null); }} />
    <ItineraryCardExport visible={exportVisible} data={exportData} themeMode={themeMode} onClose={() => setExportVisible(false)} />
    <Modal visible={moreVisible} transparent animationType="fade" onRequestClose={() => setMoreVisible(false)}>
      <Pressable style={styles.menuBackdrop} onPress={() => setMoreVisible(false)}><View style={styles.moreMenu}>
        {onImport ? <Pressable style={styles.menuItem} onPress={() => { setMoreVisible(false); onImport(); }}><Text style={styles.menuItemText}>📥 匯入行程</Text></Pressable> : null}
        <Pressable style={styles.menuItem} onPress={() => { setMoreVisible(false); void exportCalendar(); }}><Text style={styles.menuItemText}>📅 匯出行事曆</Text></Pressable>
        <Pressable style={styles.menuItem} onPress={() => { setMoreVisible(false); setExportVisible(true); }}><Text style={styles.menuItemText}>🖼️ 匯出行程圖卡</Text></Pressable>
        <Pressable style={styles.menuItem} onPress={() => { setMoreVisible(false); void shareDayItinerary(); }}><Text style={styles.menuItemText}>↗ 分享今日行程</Text></Pressable>
        {onClearAll ? <Pressable style={styles.menuItem} onPress={() => { setMoreVisible(false); onClearAll(); }}><Text style={styles.menuDangerText}>清空全行程景點</Text></Pressable> : null}
      </View></Pressable>
    </Modal>
  </>;
}

const dayHeroStyle = {
  width: '100%',
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  justifyContent: 'space-between' as const,
  gap: 8,
  marginBottom: 10,
  flexWrap: 'wrap' as const,
  borderRadius: 16,
  paddingHorizontal: 20,
  paddingVertical: 16,
  backgroundColor: '#8C6D58',
  shadowColor: '#000000',
  shadowOpacity: 0.05,
  shadowRadius: 12,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
} as const;

const styles = StyleSheet.create({
  mobileTimeline: { width: '100%', paddingVertical: 12 },
  mobileFab: { position: 'relative', alignSelf: 'flex-end', marginTop: 16 },
  dayHeader: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  dayHeaderActions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8, flexShrink: 1 },
  dayTitle: { fontSize: 18, fontWeight: '800', flexShrink: 1 },
  daySubtitle: { maxWidth: '100%', paddingHorizontal: 16, paddingVertical: 4, color: '#F5F5F4', fontSize: 14, fontWeight: '700', marginTop: 3, flexShrink: 1 },
  optimizeButton: { width: '100%', minHeight: 44, justifyContent: 'center', borderRadius: 10, backgroundColor: EDITORIAL_COLORS.terracotta, borderWidth: 1, borderColor: EDITORIAL_COLORS.terracotta, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 8 },
  optimizeText: { color: EDITORIAL_COLORS.paper, fontSize: 13, fontWeight: '800', textAlign: 'center' },
  optimizeInlineButton: { minHeight: 34, justifyContent: 'center', borderRadius: 999, borderWidth: 0, borderColor: 'transparent', backgroundColor: '#F1F5F9', paddingHorizontal: 10 },
  optimizeInlineCompact: { minWidth: 36, paddingHorizontal: 8 },
  optimizeInlineText: { color: '#475569', fontSize: 11, fontWeight: '800' },
  optimizeInlineIconText: { fontSize: 16 },
  optimizationSuggestion: { marginTop: -2, marginBottom: 6, color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800' },
  calendarButton: { flexShrink: 0, minHeight: 44, justifyContent: 'center', borderRadius: 10, backgroundColor: EDITORIAL_COLORS.terracottaSoft, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, paddingHorizontal: 10, paddingVertical: 8 },
  calendarText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800' },
  exportButton: { flexShrink: 0, minHeight: 44, justifyContent: 'center', borderRadius: 10, backgroundColor: EDITORIAL_COLORS.sand, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, paddingHorizontal: 10, paddingVertical: 8 },
  exportButtonText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '800' },
  shareButton: { flexShrink: 0, minHeight: 44, justifyContent: 'center', borderRadius: 10, backgroundColor: EDITORIAL_COLORS.terracotta, borderWidth: 1, borderColor: EDITORIAL_COLORS.terracotta, paddingHorizontal: 10, paddingVertical: 8 },
  shareText: { color: EDITORIAL_COLORS.paper, fontSize: 12, fontWeight: '800' },
  moreButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, backgroundColor: EDITORIAL_COLORS.sand },
  moreButtonText: { color: EDITORIAL_COLORS.charcoal, fontSize: 22, fontWeight: '900', lineHeight: 24 },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(31,31,31,.28)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 86, paddingHorizontal: 18 },
  moreMenu: { width: 230, backgroundColor: EDITORIAL_COLORS.paper, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 14, padding: 6 },
  menuItem: { minHeight: 46, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 9 },
  menuItemText: { color: EDITORIAL_COLORS.charcoal, fontSize: 14, fontWeight: '700' },
  menuDangerText: { color: EDITORIAL_COLORS.dangerText, fontSize: 14, fontWeight: '700' },
  mapToggle: { width: '100%', minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: '#F1F5F9', borderWidth: 0, borderColor: 'transparent', paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, overflow: 'hidden' },
  mapToggleText: { color: '#475569', fontSize: 14, fontWeight: '800', textAlign: 'center' },
  mapPane: { width: '100%', maxWidth: '100%', minWidth: 0, borderRadius: 18, overflow: 'hidden', marginBottom: 12, backgroundColor: '#FFFFFF', shadowColor: '#000000', shadowOpacity: 0.05, shadowRadius: 12, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  timelinePane: { flex: 1, minHeight: 0, width: '100%', minWidth: 0, borderRadius: 18, overflow: 'hidden' },
  // Keep the final timeline row clear of the floating add-spot action.
  paneContent: { width: '100%', paddingBottom: 144, boxSizing: 'border-box' },
  skeletonStack: { gap: 12 },
  fab: { position: 'absolute', zIndex: 1000, minHeight: 44, justifyContent: 'center', borderRadius: 12, backgroundColor: EDITORIAL_COLORS.terracotta, borderWidth: 1, borderColor: EDITORIAL_COLORS.terracotta },
  buttonText: { color: 'white', fontWeight: '800' },
});
