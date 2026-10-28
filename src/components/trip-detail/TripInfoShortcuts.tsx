import React, { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Platform, Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import type { ItineraryItem } from '@/lib/itinerary';
import { buildShortcutText, parseShortcutPins, resolveShortcutItems, shortcutPreferences, shortcutStorageKey, type ShortcutKind, type ShortcutPin } from '@/lib/trip-shortcuts';
import { copyVoucherReference } from '@/lib/voucher-files';
import { getGoogleMapsNavigationUrl } from '@/lib/map-links';
import { shareOrCopyText } from '@/lib/share-actions';
import { getAppTheme, type AppTheme } from '@/lib/theme';
import { getTripJournalPalette } from '@/lib/trip-journal';
import { PuppyMascot } from '@/components/PuppyMascot';
import { listTripInfoPins, setTripInfoPin } from '@/lib/trip-shortcuts-api';

const KIND_LABEL: Record<ShortcutKind, string> = { hotel: '住宿', meeting: '集合', place: '常用地' };

export function TripInfoShortcuts({ tripId, userId, items, timezone, refreshToken = 0, expandRequest = 0, canEdit = true, theme = getAppTheme('light') }: { tripId: string; userId: string; items: ItineraryItem[]; timezone?: string; refreshToken?: number; expandRequest?: number; canEdit?: boolean; theme?: AppTheme }) {
  const key = shortcutStorageKey({ userId, tripId });
  const [stored, setStored] = useState<{ key: string; pins: ShortcutPin[]; synced: boolean } | null>(null);
  const [open, setOpen] = useState(false), [picker, setPicker] = useState(false);
  const [kind, setKind] = useState<ShortcutKind>('hotel');
  const [notice, setNotice] = useState(''), [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  const [legacy, setLegacy] = useState<ShortcutPin[]>([]);
  const generation = useRef(0), busyRef = useRef(false), cloudRequest = useRef(0);
  const palette = getTripJournalPalette(theme);

  useEffect(() => {
    let active = true;
    generation.current++; busyRef.current = false; setBusy(false); setPicker(false); setOpen(false); setNotice(''); setStored(null);
    if (!userId || userId === 'anonymous') return;
    setLegacy([]);
    void shortcutPreferences.getItem(key).then((raw) => { if (active) setLegacy(parseShortcutPins(raw)); }).catch(() => { /* Device storage is optional; cloud pins remain available. */ });
    return () => { active = false; generation.current++; };
  }, [key, userId]);

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
      setNotice(error instanceof Error ? error.message : '無法讀取常用資訊，請重試。');
      try {
        const cloudCache = await shortcutPreferences.getItem(`${key}:cloud`);
        const raw = cloudCache ?? await shortcutPreferences.getItem(key);
        if (active && request === generation.current && read === cloudRequest.current && !busyRef.current) setStored({ key, pins: parseShortcutPins(raw, Infinity), synced: false });
      } catch { /* Keep the visible cloud error if device storage is unavailable too. */ }
    });
    return () => { active = false; };
  }, [key, retry, refreshToken, tripId, userId]);

  useEffect(() => { if (expandRequest > 0) setOpen(true); }, [expandRequest]);

  const ready = stored?.key === key;
  const pins = ready ? stored.pins : [];
  const selected = resolveShortcutItems(pins, items, tripId);
  const summary = selected.length
    ? `住宿、集合與常用地點 · ${selected.length} 筆`
    : ready ? '點此收納常用地址' : '常用地址載入中…';

  async function togglePin(item: ItineraryItem) {
    if (!ready || !stored.synced || !canEdit || busyRef.current || item.trip_id !== tripId) return;
    // Deleted records must not consume the cap or become impossible to unpin.
    const livePins = resolveShortcutItems(pins, items, tripId).map(({ pin }) => pin);
    const exists = livePins.some((p) => p.id === item.id && p.kind === kind);
    const next = exists ? livePins.filter((p) => p.id !== item.id || p.kind !== kind) : [...livePins, { id: item.id, kind }];
    if (!exists && next.length > 12) { setNotice('最多收納 12 筆常用資訊，請先移除其他項目。'); return; }
    cloudRequest.current++; busyRef.current = true; setBusy(true); setNotice(''); const request = generation.current;
    try {
      await setTripInfoPin(tripId, { id: item.id, kind }, !exists);
      if (request !== generation.current) return;
      setStored({ key, pins: next, synced: true }); setPicker(false); setOpen(true); setNotice('已更新常用資訊，行程成員皆可查看');
    } catch (error) { if (request === generation.current) setNotice(`無法儲存：${error instanceof Error ? error.message : '請重試'}，原設定已保留。`); }
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
      setRetry((v) => v + 1);
    } catch (error) { if (request === generation.current) setNotice(error instanceof Error ? error.message : '匯入失敗，原本機資料仍保留，請重試。'); }
    finally { if (request === generation.current) { busyRef.current = false; setBusy(false); } }
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
        }, '旅程常用資訊');
      }
      if (request === generation.current) setNotice(action === 'copy' ? '已複製資訊' : action === 'navigate' ? '已開啟導航' : '已分享或複製資訊');
    } catch (error) { if (request === generation.current) setNotice(error instanceof Error ? error.message : '操作失敗，請稍後重試。'); }
  }

  function openManager() {
    if (!canEdit || !ready || !stored.synced || busy) return;
    setNotice(''); setOpen(false); setPicker(true);
  }
  function closePicker() {
    if (busyRef.current) return;
    setPicker(false); setOpen(true);
  }

  return <>
    <View style={[styles.card, { backgroundColor: palette.soft }]}>
      <Pressable accessibilityRole="button" accessibilityLabel="開啟常用資訊，查看住宿、集合與常用地點" accessibilityState={{ expanded: open }} style={styles.entry} onPress={() => { setOpen(true); setNotice(''); }}>
        <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"><PuppyMascot puppy="journal-reading" size={44} /></View>
        <View style={styles.entryCopy}>
          <Text numberOfLines={1} style={[styles.entryTitle, { color: palette.ink }]}>常用資訊</Text>
          <Text numberOfLines={1} style={[styles.entryHint, { color: palette.mutedOnSoft }]}>{summary}</Text>
        </View>
        <Text style={[styles.chevron, { color: palette.accentText }]}>›</Text>
      </Pressable>
    </View>

    <Modal visible={open || picker} transparent animationType="slide" onRequestClose={() => picker ? closePicker() : setOpen(false)}>
      <View style={styles.backdrop}>
        <Pressable accessibilityRole="button" accessibilityLabel={picker ? '關閉常用資訊管理' : '關閉常用資訊'} style={StyleSheet.absoluteFill} onPress={() => picker ? closePicker() : setOpen(false)} />
        <View style={[styles.sheet, { backgroundColor: theme.colors.card }]}>
          <View style={styles.handle} />
          {picker ? <>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>管理常用資訊</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="返回常用資訊" disabled={busy} style={styles.closeButton} onPress={closePicker}><Text style={{ color: theme.colors.primary }}>返回</Text></Pressable>
            </View>
            <Text style={[styles.hint, { color: theme.colors.muted }]}>選擇類型，再點行程地點加入或移除。</Text>
            <View style={styles.kindPicker}>{(['hotel', 'meeting', 'place'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`選擇${KIND_LABEL[value]}`} accessibilityState={{ selected: kind === value }} disabled={busy} onPress={() => setKind(value)} style={[styles.kindButton, { backgroundColor: kind === value ? theme.colors.primary : theme.colors.surfaceMuted }]}><Text style={{ color: kind === value ? '#FFF' : theme.colors.text }}>{KIND_LABEL[value]}</Text></Pressable>)}</View>
            {notice ? <Text accessibilityRole="alert" style={[styles.feedback, { color: theme.colors.primary }]}>{notice}</Text> : null}
            {legacy.length > 0 && canEdit ? <Pressable accessibilityRole="button" disabled={busy || !ready || !stored?.synced} style={styles.importButton} onPress={() => void importLegacy()}><Text style={{ color: theme.colors.primary }}>匯入此裝置原有釘選</Text></Pressable> : null}
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
              {items.filter((item) => item.trip_id === tripId && !item.is_backup).map((item) => {
                const selectedPin = pins.some((pin) => pin.id === item.id && pin.kind === kind);
                return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={`${selectedPin ? '解除釘選' : '釘選'}${KIND_LABEL[kind]} ${item.location_name}`} accessibilityState={{ selected: selectedPin }} disabled={busy || !ready || !stored?.synced || !canEdit} style={styles.option} onPress={() => void togglePin(item)}><Text style={{ color: theme.colors.text }}>{selectedPin ? '✓ ' : '＋ '}Day {item.day_number} · {item.location_name}</Text></Pressable>;
              })}
              {!items.some((item) => item.trip_id === tripId && !item.is_backup) ? <Text style={[styles.hint, { color: theme.colors.muted }]}>先新增行程地點，再加入常用資訊。</Text> : null}
            </ScrollView>
          </> : <>
            <View style={styles.sheetHeader}>
              <Text style={[styles.sheetTitle, { color: theme.colors.text }]}>常用資訊</Text>
              <View style={styles.headerActions}>
                {canEdit ? <Pressable accessibilityRole="button" accessibilityLabel="管理常用資訊" disabled={!ready || !stored?.synced || busy} style={styles.headerButton} onPress={openManager}><Text style={{ color: theme.colors.primary }}>{!ready ? '載入中' : !stored.synced ? '離線唯讀' : '管理'}</Text></Pressable> : null}
                <Pressable accessibilityRole="button" accessibilityLabel="關閉常用資訊" style={styles.closeButton} onPress={() => setOpen(false)}><Text style={{ color: theme.colors.primary }}>完成</Text></Pressable>
              </View>
            </View>
            {notice ? <Text accessibilityLiveRegion="polite" style={[styles.feedback, { color: theme.colors.primary }]}>{notice}</Text> : null}
            {ready && !stored.synced ? <Text style={[styles.feedback, { color: theme.colors.muted }]}>目前顯示此裝置快取；連線後可同步變更。</Text> : null}
            {!selected.length && ready ? <View style={styles.empty}>
              <Text style={[styles.title, { color: theme.colors.text }]}>還沒有常用資訊</Text>
              <Text style={[styles.hint, { color: theme.colors.muted }]}>把住宿、集合點或常用地點加進來，之後一點就能導航。</Text>
            </View> : null}
            <ScrollView style={styles.list} contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
              {selected.map(({ pin, item }) => <View key={`${pin.kind}:${pin.id}`} style={[styles.info, { backgroundColor: theme.colors.surfaceMuted }]}>
                <View style={styles.infoHeading}>
                  <Text numberOfLines={2} style={[styles.title, styles.placeName, { color: theme.colors.text }]}>{item.location_name}</Text>
                  <Text style={[styles.kindBadge, { color: theme.colors.primary, backgroundColor: palette.soft }]}>{KIND_LABEL[pin.kind]}</Text>
                </View>
                <Text selectable style={[styles.hint, styles.address, { color: theme.colors.text }]}>{item.address?.trim() || '尚未填寫地址，可編輯行程補上'}</Text>
                <View style={styles.actions}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`導航至 ${item.location_name}`} style={[styles.navigateButton, { backgroundColor: palette.soft }]} onPress={() => void act(item, 'navigate', pin.kind)}><Text style={{ color: palette.accentText, fontWeight: '700' }}>🧭 導航</Text></Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`複製 ${item.location_name} 資訊`} style={styles.secondaryAction} onPress={() => void act(item, 'copy', pin.kind)}><Text style={{ color: theme.colors.primary }}>複製</Text></Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`分享 ${item.location_name} 給旅伴`} style={styles.secondaryAction} onPress={() => void act(item, 'share', pin.kind)}><Text style={{ color: theme.colors.primary }}>分享</Text></Pressable>
                </View>
              </View>)}
            </ScrollView>
          </>}
        </View>
      </View>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  card: { width: '100%', borderRadius: 14, marginVertical: 4, overflow: 'hidden' },
  entry: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 },
  entryCopy: { flex: 1, minWidth: 0, gap: 2 },
  entryTitle: { fontSize: 13, fontWeight: '700' }, entryHint: { fontSize: 10 }, chevron: { fontSize: 24, paddingHorizontal: 4 },
  backdrop: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(31,31,31,.42)' },
  sheet: { width: '100%', maxHeight: '82%', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 28, borderTopLeftRadius: 22, borderTopRightRadius: 22, gap: 10 },
  handle: { width: 38, height: 4, borderRadius: 4, alignSelf: 'center', backgroundColor: '#BDB7AF', marginBottom: 2 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
  sheetTitle: { fontSize: 18, fontWeight: '800' }, headerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerButton: { minHeight: 44, paddingHorizontal: 12, justifyContent: 'center' }, closeButton: { minHeight: 44, minWidth: 52, alignItems: 'center', justifyContent: 'center' },
  feedback: { fontSize: 12, lineHeight: 18 }, empty: { gap: 4, paddingVertical: 14, alignItems: 'center' },
  list: { flexGrow: 0, maxHeight: 520 }, listContent: { gap: 8, paddingBottom: 4 },
  info: { padding: 12, borderRadius: 14, gap: 8 }, infoHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 14, fontWeight: '700' }, placeName: { flex: 1, minWidth: 0 },
  kindBadge: { overflow: 'hidden', fontSize: 10, fontWeight: '700', borderRadius: 12, paddingHorizontal: 8, paddingVertical: 4 },
  hint: { fontSize: 12, lineHeight: 18 }, address: { fontSize: 13 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  navigateButton: { minHeight: 40, borderRadius: 12, paddingHorizontal: 14, justifyContent: 'center' }, secondaryAction: { minHeight: 40, paddingHorizontal: 10, justifyContent: 'center' },
  kindPicker: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' }, kindButton: { minHeight: 42, paddingHorizontal: 14, borderRadius: 22, justifyContent: 'center' },
  importButton: { minHeight: 42, justifyContent: 'center', alignSelf: 'flex-start' }, option: { minHeight: 48, padding: 12, justifyContent: 'center' },
});
