import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { mapFallbackMessage } from '@/lib/map-platform';
import type { ItineraryItem } from '@/lib/itinerary';

export function TripMap({ items, day }: { items: ItineraryItem[]; day: number }) {
  const count = items.filter((item) => item.day_number === day && item.latitude != null && item.longitude != null).length;
  return <View style={styles.map}><Text style={styles.title}>Web 地圖預覽</Text><Text>{mapFallbackMessage()}</Text><Text style={styles.count}>當天已定位景點：{count} 個</Text></View>;
}
const styles = StyleSheet.create({ map: { flex: 1, minHeight: 220, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 }, title: { fontSize: 18, fontWeight: '700' }, count: { color: '#334155' } });
