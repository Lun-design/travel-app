import React, { useMemo } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { mapMarkersForDay, type ItineraryItem } from '@/lib/itinerary';
import { getTripDetailLayout } from '@/lib/trip-detail-layout';

export function TripMap({ items, day }: { items: ItineraryItem[]; day: number }) {
  const { width } = useWindowDimensions();
  const layout = getTripDetailLayout(width);
  const markers = mapMarkersForDay(items, day);
  const document = useMemo(() => createLeafletDocument(markers), [markers]);

  if (!markers.length) {
    return <View style={[styles.empty, { minHeight: layout.mapMinHeight }]}>
      <Text style={styles.emptyIcon}>🗺️</Text>
      <Text style={styles.title}>尚無可顯示的景點</Text>
      <Text style={styles.hint}>新增或編輯景點座標後，就會顯示在地圖上。</Text>
    </View>;
  }

  return <iframe
    key={`${day}-${markers.map((marker) => marker.id).join('-')}`}
    title={`Day ${day} 景點路線地圖`}
    srcDoc={document}
    sandbox="allow-scripts allow-same-origin"
    style={{ ...iframeStyle, minHeight: layout.mapMinHeight }}
  />;
}

function createLeafletDocument(markers: ReturnType<typeof mapMarkersForDay>) {
  const data = JSON.stringify(markers).replace(/</g, '\\u003c');
  return `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no" />
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" crossorigin="" />
  <style>
    html, body, #map { width: 100%; height: 100%; margin: 0; }
    body { font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    .numbered-marker { background: transparent; border: 0; }
    .numbered-marker span { display: grid; place-items: center; width: 30px; height: 30px; border-radius: 50%; background: #2563eb; color: white; border: 3px solid white; box-shadow: 0 3px 10px rgba(15, 23, 42, .3); font-weight: 800; }
    .popup-title { font-size: 14px; font-weight: 800; margin-bottom: 3px; }
    .popup-description { color: #475569; line-height: 1.4; }
    .leaflet-top.leaflet-left { top: 12px; left: 12px; }
    .leaflet-top.leaflet-left .leaflet-control { margin: 0; }
  </style>
</head>
<body>
  <div id="map" aria-label="互動式景點路線地圖"></div>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js" crossorigin=""></script>
  <script>
    const points = ${data};
    const compactMap = window.matchMedia('(max-width: 480px)').matches;
    const map = L.map('map', { zoomControl: false });
    L.control.zoom({ position: 'topleft' }).addTo(map);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    const coordinates = points.map(function (point) { return [point.latitude, point.longitude]; });
    points.forEach(function (point) {
      const icon = L.divIcon({ className: 'numbered-marker', html: '<span>' + point.order + '</span>', iconSize: [36, 36], iconAnchor: [18, 18] });
      const popup = document.createElement('div');
      const title = document.createElement('div');
      title.className = 'popup-title';
      title.textContent = point.order + '. ' + point.title;
      popup.appendChild(title);
      if (point.description) {
        const description = document.createElement('div');
        description.className = 'popup-description';
        description.textContent = point.description;
        popup.appendChild(description);
      }
      L.marker([point.latitude, point.longitude], { icon: icon }).addTo(map).bindPopup(popup);
    });
    if (coordinates.length > 1) {
      L.polyline(coordinates, { color: '#2563eb', weight: 4, opacity: .9 }).addTo(map);
      map.fitBounds(coordinates, {
        paddingTopLeft: [48, 48],
        paddingBottomRight: compactMap ? [170, 78] : [48, 48]
      });
    } else {
      map.setView(coordinates[0], 14);
    }
  </script>
</body>
</html>`;
}

const iframeStyle: React.CSSProperties = {
  display: 'block',
  width: '100%',
  height: '100%',
  border: 0,
  backgroundColor: '#dbeafe',
};

const styles = StyleSheet.create({
  empty: { flex: 1, backgroundColor: '#dbeafe', alignItems: 'center', justifyContent: 'center', padding: 20, gap: 8 },
  emptyIcon: { fontSize: 30 },
  title: { color: '#0f172a', fontSize: 17, fontWeight: '800' },
  hint: { color: '#475569', textAlign: 'center' },
});
