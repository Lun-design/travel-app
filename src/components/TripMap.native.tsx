import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, Polyline, type LatLng } from 'react-native-maps';
import type { ItineraryItem } from '@/lib/itinerary';
import { mapMarkersForDay } from '@/lib/itinerary';
import { EDITORIAL_COLORS } from '@/lib/theme';

export function TripMap({ items, day, onMarkerPress }: { items: ItineraryItem[]; day: number; onMarkerPress?: (itemId: string) => void }) {
  const markers = mapMarkersForDay(items, day);
  const points = markers.map(({ latitude, longitude }) => ({ latitude, longitude }));
  const first = points[0] ?? { latitude: 25.033, longitude: 121.565 };
  const mapKey = `${day}-${markers.map((marker) => marker.id).join('-')}`;
  return <MapView key={mapKey} style={styles.map} initialRegion={{ ...first, latitudeDelta: 0.1, longitudeDelta: 0.1 }}>
    {markers.map((marker) => <Marker key={marker.id} coordinate={marker} title={marker.title} description={marker.description ?? undefined} onPress={() => onMarkerPress?.(marker.id)}>
      <View style={styles.marker}><Text style={styles.markerText}>{marker.order}</Text></View>
    </Marker>)}
    {points.length >= 2 && <Polyline coordinates={points as LatLng[]} strokeColor={EDITORIAL_COLORS.terracotta} strokeWidth={3} />}
  </MapView>;
}
const styles = StyleSheet.create({ map: { flex: 1, minHeight: 220 }, marker: { width: 30, height: 30, borderRadius: 8, backgroundColor: EDITORIAL_COLORS.terracotta, borderWidth: 2, borderColor: EDITORIAL_COLORS.paper, alignItems: 'center', justifyContent: 'center' }, markerText: { color: EDITORIAL_COLORS.paper, fontWeight: '900', fontSize: 13 } });
