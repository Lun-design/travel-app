import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { OfflineMutation } from '@/lib/offline-store';

type Props = {
  isOffline: boolean;
  pendingCount: number;
  conflicts: OfflineMutation[];
  onResolve: (id: string, resolution: 'keep-local' | 'use-remote') => void;
};

export function OfflineSyncBanner({ isOffline, pendingCount, conflicts, onResolve }: Props) {
  if (!isOffline && pendingCount === 0 && conflicts.length === 0) return null;
  return <View style={styles.container} accessibilityRole="alert">
    <Text style={styles.message}>{isOffline ? '📡 離線模式：已載入快取行程' : `⏳ ${pendingCount} 項變更等待同步`}</Text>
    {conflicts.map((conflict) => <View key={conflict.id} style={styles.conflict}>
      <Text numberOfLines={2} style={styles.conflictText}>⚠️ {conflict.error?.message ?? '同步發生衝突，請選擇處理方式'}</Text>
      <View style={styles.actions}>
        <Pressable style={styles.keep} onPress={() => onResolve(conflict.id, 'keep-local')}><Text style={styles.keepText}>保留本機</Text></Pressable>
        <Pressable style={styles.remote} onPress={() => onResolve(conflict.id, 'use-remote')}><Text style={styles.remoteText}>採用雲端</Text></Pressable>
      </View>
    </View>)}
  </View>;
}

const styles = StyleSheet.create({
  container: { width: '100%', gap: 6, borderRadius: 10, backgroundColor: '#fef3c7', paddingHorizontal: 12, paddingVertical: 8 },
  message: { color: '#92400e', fontSize: 12, fontWeight: '700' },
  conflict: { gap: 6, borderTopWidth: 1, borderTopColor: '#fcd34d', paddingTop: 6 },
  conflictText: { color: '#78350f', fontSize: 12, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  keep: { borderRadius: 8, backgroundColor: '#2563eb', paddingHorizontal: 10, paddingVertical: 6 },
  keepText: { color: 'white', fontSize: 12, fontWeight: '700' },
  remote: { borderRadius: 8, borderWidth: 1, borderColor: '#92400e', paddingHorizontal: 10, paddingVertical: 6 },
  remoteText: { color: '#92400e', fontSize: 12, fontWeight: '700' },
});
