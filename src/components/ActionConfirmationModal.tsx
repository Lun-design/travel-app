import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { AppTheme } from '@/lib/theme';

type Props = {
  visible: boolean; title: string; confirmLabel: string; theme: AppTheme;
  busy?: boolean; loading?: boolean; confirmDisabled?: boolean; error?: string;
  onCancel: () => void; onConfirm: () => void | Promise<void>; onRetry?: () => void | Promise<void>;
  children: React.ReactNode;
};
/** Stateless: callers own mutation locks, scope validation and error recovery. */
export function ActionConfirmationModal({ visible, title, confirmLabel, theme, busy, loading, confirmDisabled, error, onCancel, onConfirm, onRetry, children }: Props) {
  const blocked = Boolean(busy || loading || confirmDisabled);
  return <Modal visible={visible} transparent animationType="fade" onRequestClose={() => { if (!busy) onCancel(); }}>
    <View style={styles.overlay}>
      <Pressable accessibilityRole="button" accessibilityLabel="關閉確認視窗" disabled={busy} style={styles.backdrop} onPress={onCancel} />
      <View accessibilityViewIsModal style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <Text accessibilityRole="header" style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        <ScrollView style={styles.content} contentContainerStyle={styles.copy} keyboardShouldPersistTaps="handled">
          {children}
          {loading ? <Text accessibilityLiveRegion="polite" style={{ color: theme.colors.muted }}>正在確認最新結清資料…</Text> : null}
          {error ? <Text accessibilityRole="alert" style={{ color: theme.colors.primary }}>{error}</Text> : null}
          {onRetry && !busy && !loading ? <Pressable accessibilityRole="button" accessibilityLabel="重新載入預覽" style={styles.button} onPress={() => onRetry()}><Text style={{ color: theme.colors.primary }}>重新載入預覽</Text></Pressable> : null}
        </ScrollView>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel="取消" disabled={busy} style={styles.button} onPress={onCancel}><Text style={{ color: theme.colors.muted }}>取消</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={confirmLabel} disabled={blocked} style={[styles.button, { backgroundColor: theme.colors.primary, opacity: blocked ? 0.5 : 1 }]} onPress={() => onConfirm()}><Text style={styles.white}>{busy ? '處理中…' : confirmLabel}</Text></Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  overlay: { flex: 1, padding: 20, alignItems: 'center', justifyContent: 'center' },
  backdrop: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(31,31,31,.5)' },
  card: { width: '100%', maxWidth: 480, maxHeight: '85%', borderRadius: 18, padding: 18, gap: 12 },
  title: { fontSize: 19, fontWeight: '800' }, content: { flexGrow: 0, flexShrink: 1 }, copy: { gap: 12 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  button: { minHeight: 44, paddingHorizontal: 16, borderRadius: 12, justifyContent: 'center' }, white: { color: '#FFFFFF', fontWeight: '700' },
});
