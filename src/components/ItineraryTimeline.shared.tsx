import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { buildRouteSegments, type ItineraryItem, type RouteSegment } from '@/lib/itinerary';
import type { ScheduleContext, ScheduledItem } from '@/lib/schedule';

const icons: Record<string, string> = { spot: '📍', food: '🍜', hotel: '🛏️', flight: '✈️', trail: '🥾', outdoor: '🌲' };

export type ItineraryTimelineProps = {
  items: ItineraryItem[];
  onEdit: (item: ItineraryItem) => void;
  onDelete: (item: ItineraryItem) => void;
  onReorder?: (items: { id: string; position: number }[]) => Promise<void>;
  scheduleContext?: ScheduleContext;
};

export function segmentsForItems(items: ItineraryItem[]) {
  return items.length ? buildRouteSegments(items, items[0].day_number) : [];
}

export function orderPayload(items: ItineraryItem[]) {
  return items.map(({ id, position }) => ({ id, position }));
}

export function TimelineCard({ item, segment, scheduled, grip, active, onEdit, onDelete }: {
  item: ItineraryItem;
  segment?: RouteSegment;
  scheduled?: ScheduledItem;
  grip: React.ReactNode;
  active?: boolean;
  onEdit: (item: ItineraryItem) => void;
  onDelete: (item: ItineraryItem) => void;
}) {
  const duration = scheduled?.durationMinutes ?? item.duration_minutes ?? 60;
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
              <Text style={styles.category}>{icons[item.category] ?? '📌'} {item.category}</Text>
            </View>
            <Text style={styles.name}>{item.location_name}</Text>
            <Text style={styles.duration}>⏱ 停留 {duration} 分鐘 · 離開 {scheduled?.departureTime ?? '—'}</Text>
            {item.address ? <Text style={styles.address}>{item.address}</Text> : null}
            {item.notes ? <Text style={styles.notes}>{item.notes}</Text> : null}
            <View style={styles.actions}><Pressable onPress={() => onEdit(item)}><Text style={styles.edit}>編輯</Text></Pressable><Pressable onPress={() => onDelete(item)}><Text style={styles.delete}>刪除</Text></Pressable></View>
          </View>
        </View>
      </View>
    </View>
    {segment ? <View style={styles.transition}><Text style={styles.transitionIcon}>🚗</Text><Text style={styles.transitionText}>下一站 {formatDistance(segment.distanceKm)} · 車程約 {segment.estimatedDriveMinutes} 分鐘</Text></View> : null}
  </View>;
}

export function EmptyTimeline() {
  return <View style={styles.empty}><Text style={styles.emptyIcon}>🗺️</Text><Text style={styles.emptyText}>這一天還沒有安排景點。</Text></View>;
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
  empty: { padding: 38, alignItems: 'center', gap: 8 },
  emptyIcon: { fontSize: 28 },
  emptyText: { color: '#64748b' },
  row: { flexDirection: 'row', minHeight: 130 },
  rail: { width: 24, alignItems: 'center' },
  line: { position: 'absolute', top: 18, bottom: 0, width: 2, backgroundColor: '#dbeafe' },
  dot: { width: 12, height: 12, borderRadius: 6, backgroundColor: '#2563eb', borderWidth: 3, borderColor: '#dbeafe', zIndex: 1 },
  card: { flex: 1, marginBottom: 12, padding: 12, borderRadius: 15, backgroundColor: '#f8fafc', borderWidth: 1, borderColor: '#e2e8f0', position: 'relative' },
  cardActive: { backgroundColor: '#eff6ff', borderColor: '#60a5fa', shadowColor: '#0f172a', shadowOpacity: 0.16, shadowRadius: 12, elevation: 5 },
  cardBody: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  grip: { width: 32, minHeight: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#e2e8f0' },
  gripText: { color: '#64748b', fontSize: 25, fontWeight: '900' },
  content: { flex: 1, gap: 5 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  time: { color: '#2563eb', fontWeight: '800' },
  category: { color: '#64748b', fontSize: 12 },
  name: { color: '#0f172a', fontSize: 18, fontWeight: '800' },
  duration: { color: '#475569', fontSize: 13 },
  warningStack: { position: 'absolute', top: 10, right: 10, zIndex: 2, alignItems: 'flex-end', gap: 4, maxWidth: '72%' },
  openingWarning: { alignSelf: 'flex-start', color: '#92400e', backgroundColor: '#fef3c7', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '800' },
  overlapWarning: { alignSelf: 'flex-start', color: '#991b1b', backgroundColor: '#fee2e2', borderRadius: 7, paddingHorizontal: 8, paddingVertical: 4, fontSize: 12, fontWeight: '800' },
  address: { color: '#64748b', fontSize: 13 },
  notes: { color: '#475569', fontSize: 13, fontStyle: 'italic' },
  actions: { flexDirection: 'row', gap: 16, marginTop: 5 },
  edit: { color: '#2563eb', fontWeight: '700' },
  delete: { color: '#dc2626', fontWeight: '700' },
  transition: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: -5, marginBottom: 10, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: '#eff6ff', borderWidth: 1, borderColor: '#bfdbfe' },
  transitionIcon: { fontSize: 13 },
  transitionText: { color: '#1d4ed8', fontSize: 12, fontWeight: '700' },
});
