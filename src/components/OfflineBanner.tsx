import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { getInitialOfflineState, subscribeToNetworkStatus } from '@/lib/offline-network';

type Props = { isOffline?: boolean };

/** Compact, non-blocking status banner for the offline-first experience. */
export function OfflineBanner({ isOffline: controlledOffline }: Props = {}) {
  const [offline, setOffline] = useState(() => getInitialOfflineState());
  useEffect(() => subscribeToNetworkStatus(setOffline), []);
  const isOffline = controlledOffline ?? offline;
  if (!isOffline) return null;
  return <View accessibilityRole="alert" style={styles.container}>
    <Text style={styles.text}>📡 離線模式：目前使用快取資料，連線後將自動同步</Text>
  </View>;
}

const styles = StyleSheet.create({
  container: { width: '100%', minHeight: 32, justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: '#E5E2D9', backgroundColor: '#F4E9D5', paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8 },
  text: { color: '#7B542F', fontSize: 12, fontWeight: '700' },
});
