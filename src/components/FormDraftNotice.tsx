import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import type { FormDraftProtection } from '../hooks/useFormDraft';
import { EDITORIAL_COLORS as colors } from '@/lib/theme';
import { DraftNavigationGuard } from './DraftNavigationGuard';
export function FormDraftNotice({ protection, attachment = false }: { protection: FormDraftProtection; attachment?: boolean }) {
  const p = protection;
  return <>
    <DraftNavigationGuard protection={protection} />
    {p.recovery ? <View style={styles.notice}><Text style={styles.text}>{p.recovery.conflict ? '線上資料已更新，舊草稿無法直接恢復，避免蓋掉最新內容。' : '找到此帳號的本機草稿，要繼續編輯嗎？'}{attachment ? ' 附件不會保存在草稿，恢復後需重新選取。' : ''}</Text><View style={styles.row}><Pressable accessibilityRole="button" accessibilityLabel="恢復草稿" disabled={p.recovery.conflict} style={styles.button} onPress={p.restore}><Text style={styles.action}>{p.recovery.conflict ? '無法直接恢復' : '恢復草稿'}</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="捨棄舊草稿" style={styles.button} onPress={p.discardRecovery}><Text style={styles.text}>捨棄舊草稿</Text></Pressable></View></View> : null}
    {p.status ? <Text accessibilityLiveRegion="polite" style={styles.status}>{p.status}</Text> : null}
    <Modal visible={p.confirmClose} transparent animationType="fade" onRequestClose={p.cancelClose}><View style={styles.backdrop}><View style={styles.dialog}><Text style={styles.title}>尚有未儲存的變更</Text><Text style={styles.text}>本機草稿不代表已同步到行程。{attachment ? '附件需重新選取。' : ''}</Text><Pressable accessibilityRole="button" accessibilityLabel="繼續編輯" style={styles.button} onPress={p.cancelClose}><Text style={styles.action}>繼續編輯</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="保留草稿並關閉" style={styles.button} onPress={p.keepAndClose}><Text style={styles.action}>保留草稿並關閉</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="放棄變更" style={styles.button} onPress={p.discardAndClose}><Text style={{ color: colors.dangerText }}>放棄變更</Text></Pressable>{p.status.includes('尚未保留') ? <Text style={styles.status}>{p.status}</Text> : null}</View></View></Modal>
  </>;
}
const styles = StyleSheet.create({ notice: { backgroundColor: colors.sand, padding: 12, borderRadius: 12, gap: 6 }, text: { color: colors.taupe, fontSize: 13, lineHeight: 20 }, status: { color: colors.terracotta, fontSize: 12, lineHeight: 18 }, row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, button: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 }, action: { color: colors.terracotta, fontWeight: '700' }, backdrop: { flex: 1, backgroundColor: 'rgba(31,31,31,.5)', padding: 24, justifyContent: 'center', alignItems: 'center' }, dialog: { width: '100%', maxWidth: 440, backgroundColor: colors.paper, borderRadius: 18, padding: 20, gap: 8 }, title: { fontSize: 18, color: colors.charcoal, fontWeight: '700' } });
