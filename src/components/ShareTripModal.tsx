import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, Modal, Pressable, Share, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { buildTripShareUrl, createTripShare, listTripShares, revokeTripShare, updateTripShare, type TripShare } from '@/lib/trip-share-api';
import { EDITORIAL_COLORS, getThemeForMode, type ThemeMode } from '@/lib/theme';

type Props = {
  visible: boolean;
  tripId: string;
  userId: string;
  themeMode?: ThemeMode;
  onClose: () => void;
};

function shareOrigin() {
  if (typeof window !== 'undefined') return window.location.origin;
  return process.env.EXPO_PUBLIC_APP_URL ?? '';
}

export function ShareTripModal({ visible, tripId, userId, themeMode = 'system', onClose }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [share, setShare] = useState<TripShare | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const url = useMemo(() => share ? buildTripShareUrl(share.share_token, shareOrigin()) : '', [share]);

  useEffect(() => {
    if (!visible) return;
    let active = true;
    setLoading(true);
    void listTripShares(tripId).then((shares) => {
      if (active) setShare(shares.find((entry) => entry.is_active) ?? null);
    }).catch((error) => Alert.alert('載入分享設定失敗', error instanceof Error ? error.message : '請稍後再試。')).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [tripId, visible]);

  async function ensureShare() {
    if (share) return share;
    if (!userId) throw new Error('請先登入後再建立分享連結。');
    const created = await createTripShare({ trip_id: tripId, created_by: userId, include_expenses: false });
    setShare(created);
    return created;
  }

  async function handleCreateOrCopy() {
    setSaving(true);
    try {
      const next = await ensureShare();
      const nextUrl = buildTripShareUrl(next.share_token, shareOrigin());
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) await navigator.clipboard.writeText(nextUrl);
      else await Share.share({ message: nextUrl });
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      Alert.alert('分享連結失敗', error instanceof Error ? error.message : '請稍後再試。');
    } finally { setSaving(false); }
  }

  async function handleToggleExpenses(value: boolean) {
    if (!share) return;
    setSaving(true);
    try { setShare(await updateTripShare(share.id, tripId, { include_expenses: value })); }
    catch (error) { Alert.alert('更新分享設定失敗', error instanceof Error ? error.message : '請稍後再試。'); }
    finally { setSaving(false); }
  }

  async function handleRevoke() {
    if (!share) return;
    setSaving(true);
    try { await revokeTripShare(share.id, tripId); setShare(null); }
    catch (error) { Alert.alert('撤銷分享失敗', error instanceof Error ? error.message : '請稍後再試。'); }
    finally { setSaving(false); }
  }

  return <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}><View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
      <View style={styles.header}><View style={styles.heading}><Text style={[styles.title, { color: theme.colors.text }]}>分享行程</Text><Text style={[styles.subtitle, { color: theme.colors.muted }]}>建立一個無需登入的唯讀連結</Text></View><Pressable accessibilityRole="button" onPress={onClose} style={styles.close}><Text style={{ color: theme.colors.muted, fontSize: 22 }}>×</Text></Pressable></View>
      {loading ? <ActivityIndicator color={theme.colors.primary} /> : share ? <>
        <View style={[styles.urlBox, { backgroundColor: theme.colors.surfaceMuted, borderColor: theme.colors.border }]}><Text numberOfLines={2} selectable style={[styles.url, { color: theme.colors.text }]}>{url}</Text></View>
        <Pressable accessibilityRole="switch" accessibilityState={{ checked: share.include_expenses }} onPress={() => void handleToggleExpenses(!share.include_expenses)} style={styles.optionRow}><View style={[styles.checkbox, { borderColor: share.include_expenses ? theme.colors.primary : theme.colors.border, backgroundColor: share.include_expenses ? theme.colors.primary : 'transparent' }]}>{share.include_expenses ? <Text style={styles.check}>✓</Text> : null}</View><View style={styles.optionCopy}><Text style={[styles.optionTitle, { color: theme.colors.text }]}>在公開頁顯示旅費</Text><Text style={[styles.subtitle, { color: theme.colors.muted }]}>關閉可隨時隱藏分帳金額</Text></View></Pressable>
        <View style={styles.actions}><Pressable disabled={saving} onPress={() => void handleCreateOrCopy()} style={[styles.primary, { backgroundColor: theme.colors.primary, opacity: saving ? 0.6 : 1 }]}><Text style={styles.primaryText}>{copied ? '已複製連結' : '複製公開連結'}</Text></Pressable><Pressable disabled={saving} onPress={() => void handleRevoke()} style={styles.revoke}><Text style={styles.revokeText}>撤銷連結</Text></Pressable></View>
      </> : <>
        <Text style={[styles.empty, { color: theme.colors.muted }]}>尚未建立公開分享連結。建立後，朋友即可查看唯讀行程。</Text>
        <Pressable disabled={saving} onPress={() => void handleCreateOrCopy()} style={[styles.primary, { backgroundColor: theme.colors.primary, opacity: saving ? 0.6 : 1 }]}><Text style={styles.primaryText}>{saving ? '建立中…' : '建立並複製連結'}</Text></Pressable>
      </>}
    </View></View>
  </Modal>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20, backgroundColor: 'rgba(31,31,31,.48)' },
  card: { width: '100%', maxWidth: 460, borderWidth: 1, borderRadius: 18, padding: 20, gap: 16 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  heading: { flex: 1, minWidth: 0, gap: 4 },
  title: { fontSize: 23, fontWeight: '800' },
  subtitle: { fontSize: 12, lineHeight: 18 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  urlBox: { borderWidth: 1, borderRadius: 10, padding: 12 },
  url: { fontSize: 13, lineHeight: 19 },
  optionRow: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: { width: 24, height: 24, borderRadius: 6, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  check: { color: EDITORIAL_COLORS.paper, fontWeight: '900' },
  optionCopy: { flex: 1, minWidth: 0, gap: 2 },
  optionTitle: { fontSize: 14, fontWeight: '800' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  primary: { minHeight: 44, flex: 1, minWidth: 160, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  primaryText: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
  revoke: { minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  revokeText: { color: EDITORIAL_COLORS.dangerText, fontWeight: '800' },
  empty: { fontSize: 14, lineHeight: 22 },
});
