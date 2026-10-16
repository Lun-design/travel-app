import React, { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import type { ItineraryItem } from '@/lib/itinerary';
import { buildShortcutText, parseShortcutPins, resolveShortcutItems, shortcutPreferences, shortcutStorageKey, type ShortcutKind, type ShortcutPin } from '@/lib/trip-shortcuts';
import { copyVoucherReference } from '@/lib/voucher-files';
import { getGoogleMapsNavigationUrl } from '@/lib/map-links';
import { shareOrCopyText } from '@/lib/share-actions';
import { getAppTheme, type AppTheme } from '@/lib/theme';
import { getTimeContextLabel } from '@/lib/time-context';
import { listTripInfoPins, setTripInfoPin } from '@/lib/trip-shortcuts-api';

export function TripInfoShortcuts({ tripId, userId, items, timezone, refreshToken = 0, canEdit = true, theme = getAppTheme('light') }: { tripId: string; userId: string; items: ItineraryItem[]; timezone?: string; refreshToken?: number; canEdit?: boolean; theme?: AppTheme }) {
  const key = shortcutStorageKey({ userId, tripId });
  const [stored, setStored] = useState<{ key: string; pins: ShortcutPin[]; synced: boolean } | null>(null);
  const [open, setOpen] = useState(false), [picker, setPicker] = useState(false);
  const [kind, setKind] = useState<ShortcutKind>('hotel');
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [legacy, setLegacy] = useState<ShortcutPin[]>([]);
  const generation = useRef(0), busyRef = useRef(false), cloudRequest = useRef(0);
  useEffect(() => {
    let active = true;
    generation.current++; busyRef.current = false; setBusy(false); setPicker(false); setOpen(false); setNotice(''); setStored(null);
    if (!userId || userId === 'anonymous') return;
    setLegacy([]);
    void shortcutPreferences.getItem(key).then((raw) => { if (active) setLegacy(parseShortcutPins(raw)); }).catch(() => { /* Device storage is optional; cloud pins remain available. */ });
    return () => { active = false; generation.current++; };
  }, [key]);
  useEffect(() => {
    let active = true;
    if (!userId || userId === 'anonymous' || busyRef.current) return;
    const request = generation.current;
    const read = ++cloudRequest.current;
    void listTripInfoPins(tripId).then((loaded) => {
      if (!active || request !== generation.current || read !== cloudRequest.current || busyRef.current) return;
      setStored({ key, pins: loaded, synced: true });
      void shortcutPreferences.setItem(`${key}:cloud`, JSON.stringify(loaded)).catch(() => undefined);
    }).catch(async (error) => {
      if (!active || request !== generation.current || read !== cloudRequest.current || busyRef.current) return;
      setNotice(error instanceof Error ? error.message : '無法讀取雲端快捷資訊，請重試。');
      try {
        const cloudCache = await shortcutPreferences.getItem(`${key}:cloud`);
        const raw = cloudCache ?? await shortcutPreferences.getItem(key);
        if (active && request === generation.current && read === cloudRequest.current && !busyRef.current) setStored({ key, pins: parseShortcutPins(raw, Infinity), synced: false });
      } catch { /* Keep the visible cloud error if device storage is unavailable too. */ }
    });
    return () => { active = false; };
  }, [key, retry, refreshToken]);
  const ready = stored?.key === key;
  const pins = ready ? stored.pins : [];
  const selected = resolveShortcutItems(pins, items, tripId);
  async function togglePin(item: ItineraryItem) {
    if (!ready || !stored.synced || !canEdit || busyRef.current || item.trip_id !== tripId) return;
    // Deleted records must not consume the cap or become impossible to unpin.
    const livePins = resolveShortcutItems(pins, items, tripId).map(({ pin }) => pin);
    const exists = livePins.some((p) => p.id === item.id && p.kind === kind);
    const next = exists ? livePins.filter((p) => p.id !== item.id || p.kind !== kind) : [...livePins, { id: item.id, kind }];
    if (!exists && next.length > 12) { setNotice('最多釘選 12 筆重要資訊，請先解除其他項目。'); return; }
    cloudRequest.current++; busyRef.current = true; setBusy(true); setNotice(''); const request = generation.current;
    try {
      await setTripInfoPin(tripId, { id: item.id, kind }, !exists);
      if (request !== generation.current) return;
      setStored({ key, pins: next, synced: true }); setPicker(false); setNotice('已同步快捷資訊，行程成員皆可查看');
    } catch (error) { if (request === generation.current) setNotice(`無法儲存快捷資訊：${error instanceof Error ? error.message : '請重試'}，原設定已保留。`); }
    finally { if (request === generation.current) { busyRef.current = false; setBusy(false); setRetry((v) => v + 1); } }
  }
  async function importLegacy() {
    if (!ready || !stored.synced || !canEdit || busyRef.current) return;
    const request = generation.current;
    const imported = resolveShortcutItems(legacy, items, tripId).map(({ pin }) => pin);
    cloudRequest.current++; busyRef.current = true; setBusy(true);
    try {
      for (const pin of imported) {
        if (request !== generation.current) return;
        await setTripInfoPin(tripId, pin, true);
      }
      if (request !== generation.current) return;
      await shortcutPreferences.setItem(key, '[]');
      if (request !== generation.current) return;
      setLegacy([]); setNotice('已將此裝置原有釘選同步至行程');
    } catch (error) { if (request === generation.current) setNotice(error instanceof Error ? error.message : '匯入失敗，原本機資料仍保留，請重試。'); }
    finally { if (request === generation.current) { busyRef.current = false; setBusy(false); setRetry((v) => v + 1); } }
  }
  async function act(item: ItineraryItem, action: 'copy' | 'navigate' | 'share', pinKind: ShortcutKind) {
    const request = generation.current;
    try {
      if (action === 'navigate') await Linking.openURL(getGoogleMapsNavigationUrl(item));
      else {
        const value = buildShortcutText(item, pinKind, timezone);
        if (action === 'copy') await copyVoucherReference(value);
        else await shareOrCopyText(value, {
          webShare: typeof navigator !== 'undefined' && navigator.share ? (data) => navigator.share(data) : undefined,
          clipboardWrite: Platform.OS === 'web' ? (text) => copyVoucherReference(text) : undefined,
          nativeShare: Platform.OS !== 'web' ? (text) => Share.share({ message: text }) : undefined,
        }, '旅程重要資訊');
      }
      if (request === generation.current) setNotice(action === 'copy' ? '已複製資訊' : action === 'navigate' ? '已開啟導航' : '已分享或複製資訊');
    } catch (error) { if (request === generation.current) setNotice(error instanceof Error ? error.message : '操作失敗，請稍後重試。'); }
  }
  return <View style={[styles.card, { backgroundColor: theme.colors.card }]}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel={open ? '收合重要資訊' : '展開重要資訊'} accessibilityState={{ expanded: open }} style={styles.heading} onPress={() => setOpen((v) => !v)}><Text style={[styles.title, { color: theme.colors.text }]}>住宿／集合資訊 {open ? '⌃' : '⌄'}</Text><Text style={[styles.hint, { color: theme.colors.muted }]}>{selected.length ? `${selected.length} 筆行程共用釘選` : '將重要地址與集合時間放在手邊'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="設定重要資訊" disabled={!ready || !stored.synced || busy || !canEdit} style={styles.button} onPress={() => { setPicker(true); setNotice(''); }}><Text style={{ color: theme.colors.primary }}>{!canEdit ? '僅供查看' : ready && stored.synced ? '設定' : notice ? '尚未連線' : '讀取中…'}</Text></Pressable>
    </View>
    {notice ? <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: theme.colors.primary }]}>{notice}</Text> : null}
    {ready && !stored.synced ? <Text style={[styles.feedback, { color: theme.colors.muted }]}>顯示此裝置快取，尚未同步；連線後請重試。</Text> : null}
    {(!ready || !stored.synced) && notice ? <Pressable accessibilityRole="button" style={styles.button} onPress={() => setRetry((v) => v + 1)}><Text style={{ color: theme.colors.primary }}>重試載入</Text></Pressable> : null}
    {legacy.length > 0 && canEdit ? <Pressable accessibilityRole="button" accessibilityLabel="匯入本機釘選至雲端" disabled={!ready || !stored.synced || busy} style={styles.button} onPress={() => void importLegacy()}><Text style={{ color: theme.colors.primary }}>將此裝置原有釘選同步至行程</Text></Pressable> : null}
    {open ? <View style={styles.body}>
      <Text style={[styles.hint, { color: theme.colors.muted }]}>釘選儲存於雲端，行程成員共用；分享不會附上私人備註。</Text>
      {!selected.length ? <Text style={[styles.hint, { color: theme.colors.muted }]}>點「設定」選擇既有景點作為住宿或集合資訊。</Text> : null}
      {selected.map(({ pin, item }) => <View key={`${pin.kind}:${pin.id}`} style={[styles.info, { backgroundColor: theme.colors.surfaceMuted }]}>
        <Text style={[styles.title, { color: theme.colors.text }]}>{pin.kind === 'hotel' ? '住宿' : '集合'} · {item.location_name}</Text>
        <Text style={[styles.hint, { color: theme.colors.muted }]}>Day {item.day_number}{item.time ? ` · ${item.time.slice(0, 5)}` : ' · 時間未定'}</Text>
        {item.time ? <Text style={[styles.hint, { color: theme.colors.muted }]}>{getTimeContextLabel(item, timezone)}</Text> : null}
        <Text selectable style={[styles.hint, { color: theme.colors.text }]}>{item.address || '尚未填寫地址，可編輯景點補上'}</Text>
        <View style={styles.actions}>{(['copy', 'navigate', 'share'] as const).map((action) => <Pressable key={action} accessibilityRole="button" accessibilityLabel={`${action === 'copy' ? '複製' : action === 'navigate' ? '導航' : '分享'} ${item.location_name}`} style={styles.button} onPress={() => void act(item, action, pin.kind)}><Text style={{ color: theme.colors.primary }}>{action === 'copy' ? '複製資訊' : action === 'navigate' ? '導航' : '分享旅伴'}</Text></Pressable>)}</View>
      </View>)}
    </View> : null}
    <Modal visible={picker} transparent animationType="fade" onRequestClose={() => { if (!busyRef.current) setPicker(false); }}>
      <View style={styles.backdrop}><View style={[styles.modal, { backgroundColor: theme.colors.card }]}>
        <View style={styles.header}><Text style={[styles.title, { color: theme.colors.text }]}>設定行程共用快捷資訊</Text><Pressable accessibilityRole="button" accessibilityLabel="關閉重要資訊設定" disabled={busy} style={styles.button} onPress={() => setPicker(false)}><Text style={{ color: theme.colors.primary }}>關閉 ×</Text></Pressable></View>
        <Text style={[styles.hint, { color: theme.colors.muted }]}>選擇景點即可釘選，再次點擊可解除。不會變更原行程。</Text>
        <View style={styles.actions}>{(['hotel', 'meeting'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`選擇${value === 'hotel' ? '住宿' : '集合'}`} accessibilityState={{ selected: kind === value }} disabled={busy} onPress={() => setKind(value)} style={[styles.button, { backgroundColor: kind === value ? theme.colors.primary : theme.colors.surfaceMuted }]}><Text style={{ color: kind === value ? '#FFF' : theme.colors.text }}>{value === 'hotel' ? '住宿' : '集合'}</Text></Pressable>)}</View>
        {notice ? <Text accessibilityRole="alert" style={{ color: theme.colors.primary }}>{notice}</Text> : null}
        <ScrollView style={{ maxHeight: 380 }}>{items.filter((item) => item.trip_id === tripId && !item.is_backup).map((item) => <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`釘選 ${item.location_name}`} disabled={busy} style={styles.option} onPress={() => void togglePin(item)}><Text style={{ color: theme.colors.text }}>{pins.some((p) => p.id === item.id && p.kind === kind) ? '✓ ' : '＋ '}Day {item.day_number} · {item.location_name}</Text></Pressable>)}{!items.some((i) => i.trip_id === tripId && !i.is_backup) ? <Text style={{ color: theme.colors.muted }}>先新增景點，再選擇重要資訊。</Text> : null}</ScrollView>
      </View></View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({
  card: { borderRadius: 16, marginVertical: 6 }, header: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 }, heading: { flex: 1, minHeight: 56, paddingVertical: 10, gap: 4 },
  title: { fontSize: 14, fontWeight: '700' }, hint: { fontSize: 12, lineHeight: 18 }, button: { minHeight: 44, paddingHorizontal: 12, borderRadius: 22, justifyContent: 'center' },
  feedback: { fontSize: 12, paddingHorizontal: 12, paddingBottom: 8 }, body: { padding: 12, paddingTop: 0, gap: 10 }, info: { padding: 12, borderRadius: 12, gap: 6 }, actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  backdrop: { flex: 1, backgroundColor: 'rgba(31,31,31,.45)', alignItems: 'center', justifyContent: 'center', padding: 16 }, modal: { width: '100%', maxWidth: 560, maxHeight: '88%', padding: 16, borderRadius: 20, gap: 12 }, option: { minHeight: 48, padding: 12, justifyContent: 'center' },
});
