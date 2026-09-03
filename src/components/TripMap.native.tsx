import React from 'react';
import { StyleSheet } from 'react-native';
import MapView, { Marker, Polyline, type LatLng } from 'react-native-maps';
import type { ItineraryItem } from '@/lib/itinerary';
import { coordinatesForPolyline } from '@/lib/itinerary';

export function TripMap({ items, day }: { items: ItineraryItem[]; day: number }) {
  const points = coordinatesForPolyline(items, day);
  const first = points[0] ?? { latitude: 25.033, longitude: 121.565 };
  return <MapView style={styles.map} initialRegion={{ ...first, latitudeDelta: 0.1, longitudeDelta: 0.1 }}>
    {items.filter((x) => x.day_number === day && x.latitude != null && x.longitude != null).map((x) => <Marker key={x.id} coordinate={{ latitude: x.latitude!, longitude: x.longitude! }} title={x.location_name} />)}
    {points.length >= 2 && <Polyline coordinates={points as LatLng[]} strokeColor="#2563eb" strokeWidth={4} />}
  </MapView>;
}
const styles = StyleSheet.create({ map: { flex: 1, minHeight: 220 } });
