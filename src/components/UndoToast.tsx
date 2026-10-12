import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { EDITORIAL_COLORS } from '@/lib/theme';

export function UndoToast({ label, canUndo, busy, bottom, onUndo }: { label: string; canUndo: boolean; busy: boolean; bottom: number; onUndo: () => void }) {
  if (!label) return null;
  return <View accessibilityLiveRegion="polite" style={[styles.toast, { bottom }]}>
    <Text numberOfLines={2} style={styles.label}>{label}</Text>
    {canUndo ? <Pressable accessibilityRole="button" accessibilityLabel="復原上次操作" disabled={busy} style={styles.button} onPress={onUndo}><Text style={styles.undo}>{busy ? '儲存中…' : '復原'}</Text></Pressable> : null}
  </View>;
}
const styles = StyleSheet.create({
  toast: { position: 'absolute', left: 16, right: 16, zIndex: 2000, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: EDITORIAL_COLORS.charcoal, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.15)' },
  label: { flex: 1, fontSize: 13, color: EDITORIAL_COLORS.paper },
  button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  undo: { color: '#F3CFAC', fontWeight: '700' },
});
