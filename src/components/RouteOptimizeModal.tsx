import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { ItineraryItem } from '@/lib/itinerary';
import type { RouteOptimizationResult } from '@/lib/route-optimization';
import { EDITORIAL_COLORS } from '@/lib/theme';

export type RouteOptimizeModalProps = {
  visible: boolean;
  originalItems: readonly ItineraryItem[];
  result: RouteOptimizationResult<ItineraryItem> | null;
  busy?: boolean;
  onApply: () => void | Promise<void>;
  onCancel: () => void;
};

export function formatOptimizationDuration(minutes: number): string {
  const safe = Math.max(0, Math.round(Number.isFinite(minutes) ? minutes : 0));
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  if (!hours) return `${remainder} 分鐘`;
  return remainder ? `${hours} 小時 ${remainder} 分鐘` : `${hours} 小時`;
}

export function isFixedTimeItem(item: ItineraryItem): boolean {
  const candidate = item as ItineraryItem & {
    is_fixed_time?: boolean;
    fixed_time?: string | null;
    fixedTime?: string | boolean | null;
  };
  return candidate.is_fixed_time === true
    || candidate.fixed_time != null
    || candidate.fixedTime != null;
}

function formatDistance(distanceKm: number): string {
  const safe = Math.max(0, Number.isFinite(distanceKm) ? distanceKm : 0);
  return safe < 1 ? `${Math.round(safe * 1000)} 公尺` : `${safe.toFixed(1)} 公里`;
}

function OrderList({ title, items }: { title: string; items: readonly ItineraryItem[] }) {
  return <View style={styles.orderColumn}>
    <Text style={styles.orderTitle}>{title}</Text>
    {items.length ? items.map((item, index) => <View key={item.id} style={styles.orderRow}>
      <Text style={styles.orderIndex}>{index + 1}</Text>
      <View style={styles.orderCopy}>
        <Text numberOfLines={1} style={styles.orderName}>{item.location_name}</Text>
        {item.time ? <Text style={styles.orderTime}>{item.time}</Text> : null}
      </View>
      {isFixedTimeItem(item) ? <Text style={styles.fixedBadge}>固定時間</Text> : null}
    </View>) : <Text style={styles.emptyText}>尚無景點</Text>}
  </View>;
}

export function RouteOptimizeModal({ visible, originalItems, result, busy = false, onApply, onCancel }: RouteOptimizeModalProps) {
  const optimizedItems = result?.items ?? [];
  const timeSaved = result ? Math.max(0, Math.round(result.originalDurationMinutes - result.totalDurationMinutes)) : 0;
  const distanceSaved = result ? Math.max(0, result.originalDistanceKm - result.totalDistanceKm) : 0;

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onCancel(); }}>
    <Pressable style={styles.backdrop} onPress={() => { if (!busy) onCancel(); }}>
      <Pressable style={styles.card} onPress={(event) => event.stopPropagation()}>
        <View style={styles.header}>
          <View style={styles.headerCopy}>
            <Text style={styles.title}>🧭 路線最佳化預覽</Text>
            <Text style={styles.subtitle}>確認後會更新今日景點順序與預計時間</Text>
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="取消路線最佳化" disabled={busy} onPress={onCancel} style={styles.closeButton}>
            <Text style={styles.closeText}>×</Text>
          </Pressable>
        </View>

        {result ? <>
          <View style={styles.metrics}>
            <View style={styles.metric}><Text style={styles.metricLabel}>總交通時間</Text><Text style={styles.metricValue}>{formatOptimizationDuration(result.originalDurationMinutes)} → {formatOptimizationDuration(result.totalDurationMinutes)}</Text></View>
            <View style={styles.metric}><Text style={styles.metricLabel}>總移動距離</Text><Text style={styles.metricValue}>{formatDistance(result.originalDistanceKm)} → {formatDistance(result.totalDistanceKm)}</Text></View>
          </View>
          <Text style={styles.savingText}>{timeSaved > 0 ? `預估節省 ${formatOptimizationDuration(timeSaved)}` : distanceSaved > 0 ? `預估節省 ${formatDistance(distanceSaved)}` : '目前已是最佳順序'}</Text>
          <ScrollView style={styles.orders} contentContainerStyle={styles.ordersContent}>
            <View style={styles.orderGrid}>
              <OrderList title="最佳化前" items={originalItems} />
              <OrderList title="最佳化後" items={optimizedItems} />
            </View>
          </ScrollView>
        </> : <Text style={styles.emptyText}>正在計算路線…</Text>}

        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="取消路線最佳化" disabled={busy} onPress={onCancel} style={styles.cancelButton}><Text style={styles.cancelText}>取消</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="套用新順序" disabled={busy || !result} onPress={() => { void onApply(); }} style={[styles.applyButton, (busy || !result) && styles.disabledButton]}><Text style={styles.applyText}>{busy ? '套用中…' : '套用新順序'}</Text></Pressable>
        </View>
      </Pressable>
    </Pressable>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(31,31,31,.52)' },
  card: { width: '100%', maxWidth: 700, maxHeight: '90%', alignSelf: 'center', gap: 14, padding: 20, borderRadius: 20, backgroundColor: EDITORIAL_COLORS.paper, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 8 }, elevation: 8 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  headerCopy: { flex: 1, minWidth: 0, gap: 4 },
  title: { color: EDITORIAL_COLORS.charcoal, fontSize: 20, fontWeight: '900' },
  subtitle: { color: EDITORIAL_COLORS.taupe, fontSize: 13 },
  closeButton: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: '#F1F5F9' },
  closeText: { color: EDITORIAL_COLORS.charcoal, fontSize: 26, lineHeight: 28 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { flex: 1, minWidth: 220, gap: 4, padding: 12, borderRadius: 14, backgroundColor: '#F8F6F0' },
  metricLabel: { color: EDITORIAL_COLORS.taupe, fontSize: 12, fontWeight: '700' },
  metricValue: { color: EDITORIAL_COLORS.charcoal, fontSize: 16, fontWeight: '900' },
  savingText: { color: EDITORIAL_COLORS.terracotta, fontSize: 13, fontWeight: '800' },
  orders: { maxHeight: 380 },
  ordersContent: { paddingVertical: 2 },
  orderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  orderColumn: { flex: 1, minWidth: 260, gap: 8 },
  orderTitle: { color: EDITORIAL_COLORS.charcoal, fontSize: 14, fontWeight: '900' },
  orderRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 12, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: EDITORIAL_COLORS.line },
  orderIndex: { width: 24, height: 24, borderRadius: 12, paddingTop: 3, textAlign: 'center', color: '#FFFFFF', backgroundColor: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '900' },
  orderCopy: { flex: 1, minWidth: 0, gap: 2 },
  orderName: { color: EDITORIAL_COLORS.charcoal, fontSize: 14, fontWeight: '800' },
  orderTime: { color: EDITORIAL_COLORS.taupe, fontSize: 12 },
  fixedBadge: { borderRadius: 999, paddingHorizontal: 7, paddingVertical: 3, color: EDITORIAL_COLORS.terracotta, backgroundColor: EDITORIAL_COLORS.terracottaSoft, fontSize: 10, fontWeight: '800' },
  emptyText: { color: EDITORIAL_COLORS.taupe, fontSize: 13 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingTop: 2 },
  cancelButton: { minHeight: 44, justifyContent: 'center', borderRadius: 999, paddingHorizontal: 18, backgroundColor: '#F1F5F9' },
  cancelText: { color: EDITORIAL_COLORS.charcoal, fontWeight: '800' },
  applyButton: { minHeight: 44, justifyContent: 'center', borderRadius: 999, paddingHorizontal: 20, backgroundColor: EDITORIAL_COLORS.terracotta },
  disabledButton: { opacity: 0.55 },
  applyText: { color: '#FFFFFF', fontWeight: '900' },
});
