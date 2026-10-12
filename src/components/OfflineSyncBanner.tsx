import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { OfflineMutation } from '@/lib/offline-store';
import { EDITORIAL_COLORS } from '@/lib/theme';
import { getSyncPresentation } from '@/lib/undo-sync';

type Props = {
  isOffline: boolean;
  pendingCount: number;
  conflicts: OfflineMutation[];
  onResolve: (id: string, resolution: 'keep-local' | 'use-remote') => void;
  syncing?: boolean;
  undoPending?: boolean;
  error?: string;
  onRetry?: () => void;
};

export function OfflineSyncBanner({ isOffline, pendingCount, conflicts, onResolve, syncing, undoPending, error, onRetry }: Props) {
  const status = getSyncPresentation({ isOffline, pendingCount, syncing, undoPending, error, conflictCount: conflicts.length });
  return <View style={[styles.container, (conflicts.length > 0 || error) ? styles.problem : null]} accessibilityLiveRegion="polite">
    <View style={styles.statusRow}><Text style={styles.message}>{status.label}</Text>{onRetry && status.canRetry ? <Pressable accessibilityRole="button" accessibilityLabel="重試同步" style={styles.retry} onPress={onRetry}><Text style={styles.retryText}>重試同步</Text></Pressable> : null}</View>
    {error ? <Text style={styles.conflictText}>{error}</Text> : null}
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
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  retry: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  retryText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '700' },
  container: { width: '100%', gap: 6, paddingVertical: 4 },
  problem: { borderRadius: 10, backgroundColor: EDITORIAL_COLORS.amberSoft, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, paddingHorizontal: 12, paddingVertical: 8 },
  message: { color: EDITORIAL_COLORS.taupe, fontSize: 12, fontWeight: '500' },
  conflict: { gap: 6, borderTopWidth: 1, borderTopColor: EDITORIAL_COLORS.line, paddingTop: 6 },
  conflictText: { color: EDITORIAL_COLORS.amberText, fontSize: 12, flexShrink: 1 },
  actions: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  keep: { borderRadius: 8, minHeight: 44, justifyContent: 'center', backgroundColor: EDITORIAL_COLORS.terracotta, paddingHorizontal: 14, paddingVertical: 8 },
  keepText: { color: EDITORIAL_COLORS.paper, fontSize: 12, fontWeight: '700' },
  remote: { borderRadius: 8, minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: EDITORIAL_COLORS.terracotta, paddingHorizontal: 14, paddingVertical: 8 },
  remoteText: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '700' },
});
