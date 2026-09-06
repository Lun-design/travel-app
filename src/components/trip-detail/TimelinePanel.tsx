import React, { useMemo, useState } from 'react';
import { Alert, LayoutAnimation, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
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
  onEdit: (item: ItineraryItem) => void;
  onDelete: (item: ItineraryItem) => Promise<void>;
  onReorder: (order: { id: string; position: number }[]) => Promise<void>;
  onAdd: () => void;
};

export function TimelinePanel({ trip, day, days, items, visibleItems, themeMode, layout, insets, isMapOpen, isMapLoading, isDayTransitioning, focusedItemId, vouchers, timelineScrollRef, onDayChange, onToggleMap, onMapMarkerPress, onFocusedVoucher, onEdit, onDelete, onReorder, onAdd }: Props) {
  const [completedIds, setCompletedIds] = useState<Set<string>>(new Set());
  const scheduleContext = useMemo<ScheduleContext>(() => ({ tripStartDate: trip.start_date, dayNumber: day, defaultDepartureTime: trip.default_departure_time, timezone: trip.timezone }), [day, trip.default_departure_time, trip.start_date, trip.timezone]);
  const scheduled = useMemo(() => buildDaySchedule(visibleItems, scheduleContext), [scheduleContext, visibleItems]);
  const scheduleDate = useMemo(() => tripDateForDay(trip.start_date, day), [day, trip.start_date]);
  function toggleMap() { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); onToggleMap(); }
  function completeSpot(itemId: string) { setCompletedIds((current) => new Set(current).add(itemId)); }
  async function exportCalendar() {
    try { await exportTripCalendar(trip, items); }
    catch (error: any) { Alert.alert('匯出失敗', error?.message ?? '無法建立行事曆檔案。'); }
  }
  const { width, height } = useWindowDimensions();
  return <>
    <View style={styles.dayHeader}><Text style={styles.dayTitle}>Day {day} 行程</Text><Pressable style={styles.calendarButton} onPress={() => void exportCalendar()}><Text style={styles.calendarText}>📅 匯出行事曆</Text></Pressable></View>
    <DayTabs days={days} selected={day} onChange={onDayChange} themeMode={themeMode} />
    <TodayFocusCard schedule={scheduled} items={visibleItems} vouchers={vouchers} scheduleDate={scheduleDate} timezone={trip.timezone} themeMode={themeMode} completedIds={completedIds} onComplete={completeSpot} onPreviewVoucher={onFocusedVoucher} compact={layout.compact} />
    <Pressable style={styles.mapToggle} onPress={toggleMap} accessibilityRole="button" accessibilityState={{ expanded: isMapOpen }}><Text numberOfLines={1} style={styles.mapToggleText}>{isMapOpen ? '🗺️ 隱藏地圖' : '🗺️ 查看地圖路線 (點擊展開)'}</Text></Pressable>
    {isMapOpen && <View style={[styles.mapPane, { height: layout.mapMinHeight }]}>{isMapLoading ? <SkeletonCard variant="map" /> : <TripMap items={items} day={day} onMarkerPress={onMapMarkerPress} />}</View>}
    <TimelineViewport width={width} height={height}>
      {isDayTransitioning ? <View style={styles.skeletonStack}><SkeletonCard /><SkeletonCard /></View> : <ItineraryTimeline items={visibleItems} themeMode={themeMode} focusedItemId={focusedItemId} vouchers={vouchers} onPreviewVoucher={onFocusedVoucher} scheduleContext={scheduleContext} onEdit={onEdit} onDelete={onDelete} onReorder={onReorder} />}
    </TimelineViewport>
  </>;
}

const styles = StyleSheet.create({
  mobileTimeline: { width: '100%', paddingVertical: 12 },
  mobileFab: { position: 'relative', alignSelf: 'flex-end', marginTop: 16 },
  dayHeader: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  dayTitle: { fontSize: 18, fontWeight: '800', flexShrink: 1 },
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
});
