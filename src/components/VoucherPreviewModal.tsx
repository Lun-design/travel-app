import React, { useEffect, useRef, useState } from 'react';
import { Image, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { getVoucherPreviewUrl } from '@/lib/vouchers-api';
import type { Voucher } from '@/lib/vouchers';
import { canStoreVoucherOffline, copyVoucherReference, createBrowserVoucherFileStore, loadVoucherFile, saveVoucherOffline, type VoucherFileStore } from '@/lib/voucher-files';
import { EDITORIAL_COLORS } from '@/lib/theme';

const browserFiles = createBrowserVoucherFileStore();
export function VoucherPreviewModal({ voucher, userId, onClose, fileStore = browserFiles }: { voucher: Voucher | null; userId?: string; onClose: () => void; fileStore?: VoucherFileStore }) {
  const [url, setUrl] = useState<string | null>(null);
  const [offlineReady, setOfflineReady] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const requestRef = useRef(0);
  const savingRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const releaseRef = useRef<(() => void) | null>(null);
  const { height } = useWindowDimensions();
  useEffect(() => {
    const request = ++requestRef.current;
    setUrl(null); setError(''); setNotice(''); setOfflineReady(false); setExpanded(false); setSaving(false);
    savingRef.current = false;
    if (!voucher) return;
    const options = { store: fileStore, isOffline: typeof navigator !== 'undefined' && navigator.onLine === false, getRemoteUrl: () => getVoucherPreviewUrl(voucher) };
    const preview = userId ? loadVoucherFile(voucher, { userId, tripId: voucher.trip_id }, options)
      : options.isOffline ? Promise.reject(new Error('請先登入並儲存票券，才能離線出示。')) : getVoucherPreviewUrl(voucher).then((url) => ({ url, offlineReady: false, release: () => {} }));
    void preview.then((file) => {
      if (request !== requestRef.current) { file.release(); return; }
      releaseRef.current?.();
      releaseRef.current = file.release;
      setUrl(file.url); setOfflineReady(file.offlineReady);
    }).catch((cause: unknown) => {
      if (request === requestRef.current) setError(cause instanceof Error ? cause.message : '無法載入票券，請稍後重試。');
    });
    return () => { requestRef.current++; abortRef.current?.abort(); releaseRef.current?.(); releaseRef.current = null; };
  }, [voucher?.id, voucher?.file_path, userId, fileStore]);

  async function saveOffline() {
    if (!voucher || !userId || savingRef.current) return;
    savingRef.current = true; setSaving(true); setError(''); setNotice('');
    const request = requestRef.current;
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await saveVoucherOffline(voucher, { userId, tripId: voucher.trip_id }, { store: fileStore, signal: controller.signal, isOffline: typeof navigator !== 'undefined' && navigator.onLine === false, getRemoteUrl: () => getVoucherPreviewUrl(voucher) });
      const file = await loadVoucherFile(voucher, { userId, tripId: voucher.trip_id }, { store: fileStore, isOffline: true, getRemoteUrl: () => getVoucherPreviewUrl(voucher) });
      if (request !== requestRef.current) { file.release(); return; }
      releaseRef.current?.(); releaseRef.current = file.release;
      setUrl(file.url); setOfflineReady(true); setNotice('已儲存離線備用，此裝置可離線出示。');
    } catch (cause) {
      if (request === requestRef.current && !controller.signal.aborted) setError(cause instanceof Error ? cause.message : '儲存失敗，請檢查裝置的儲存空間。');
    } finally {
      if (request === requestRef.current) { savingRef.current = false; setSaving(false); }
    }
  }
  async function copyReference() {
    if (!voucher?.reservation_number) return;
    const request = requestRef.current;
    try { await copyVoucherReference(voucher.reservation_number); if (request === requestRef.current) setNotice('預約編號已複製！'); }
    catch (cause) { if (request === requestRef.current) setError(cause instanceof Error ? cause.message : '無法複製，請長按編號。'); }
  }
  const imageHeight = Math.max(180, Math.min(expanded ? height * 0.7 : height * 0.5, expanded ? 1000 : 480));
  return <Modal visible={Boolean(voucher)} transparent animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable style={styles.dismiss} accessibilityRole="button" accessibilityLabel="關閉票券背景" onPress={onClose} />
      <ScrollView style={[styles.card, expanded && styles.expanded]} contentContainerStyle={styles.content}>
        <View style={styles.header}><Text style={styles.title}>{voucher?.title}</Text><Pressable accessibilityRole="button" accessibilityLabel="關閉票券" style={styles.closeButton} onPress={onClose}><Text style={styles.close}>×</Text></Pressable></View>
        {voucher?.usage_at ? <Text style={styles.meta}>使用日期：{voucher.usage_at.replace('T', ' ').slice(0, 16)}</Text> : null}
        {voucher?.reservation_number ? <View style={styles.reference}><Text selectable style={styles.referenceText}>預約編號：{voucher.reservation_number}</Text><Pressable accessibilityRole="button" accessibilityLabel="複製預約編號" onPress={() => void copyReference()} style={styles.smallButton}><Text style={styles.actionText}>複製</Text></Pressable></View> : null}
        <Text style={styles.meta}>{offlineReady ? '✓ 已離線備用 · 僅儲存於此裝置，登出時會清除' : '連線預覽 · 可提前儲存供離線出示'}</Text>
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        {notice ? <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text> : null}
        {url && voucher?.file_type === 'image' ? <Image accessibilityLabel={voucher.title + ' 原始票券'} source={{ uri: url }} resizeMode="contain" onError={() => setError('票券圖片載入失敗，請重新開啟或查看原始檔案。')} style={[styles.image, { height: imageHeight }]} />
          : url && voucher?.file_type === 'pdf' && Platform.OS === 'web' ? <iframe title={voucher.title + ' PDF'} src={url} style={{ border: 0, width: '100%', height: imageHeight, backgroundColor: '#FFF' }} />
            : <View style={[styles.pdf, { height: Math.min(200, imageHeight) }]}><Text style={styles.pdfIcon}>{voucher?.file_type === 'pdf' ? '📄' : '🎫'}</Text><Text style={styles.meta}>{error ? '票券暫時無法載入' : url ? '點擊開啟原始票券' : '正在載入票券…'}</Text></View>}
        {voucher?.notes ? <Text selectable style={styles.meta}>{voucher.notes}</Text> : null}
        <View style={styles.actions}>
          {url ? <><Pressable accessibilityRole="button" onPress={() => setExpanded((value) => !value)} style={styles.smallButton}><Text style={styles.actionText}>{expanded ? '收回預覽' : '放大出示'}</Text></Pressable><Pressable accessibilityRole="link" style={styles.open} onPress={() => { void Linking.openURL(url).catch(() => setError('無法開啟檔案，請在此視窗出示票券。')); }}><Text style={styles.white}>開啟原始票券</Text></Pressable></> : null}
          {userId && url && canStoreVoucherOffline() && !offlineReady ? <Pressable accessibilityRole="button" disabled={saving} onPress={() => void saveOffline()} style={styles.smallButton}><Text style={styles.actionText}>{saving ? '儲存中…' : '儲存離線備用'}</Text></Pressable> : null}
          <Pressable style={styles.smallButton} onPress={onClose}><Text style={styles.actionText}>關閉</Text></Pressable>
        </View>
      </ScrollView>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16, backgroundColor: 'rgba(31,31,31,.9)' },
  dismiss: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 },
  card: { width: '100%', maxWidth: 760, flexGrow: 0, backgroundColor: EDITORIAL_COLORS.paper, borderRadius: 20, maxHeight: '92%' },
  expanded: { maxWidth: 1200, maxHeight: '98%' },
  content: { padding: 16, gap: 12 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { flex: 1, fontSize: 20, fontWeight: '800', color: EDITORIAL_COLORS.charcoal },
  meta: { fontSize: 12, color: EDITORIAL_COLORS.taupe },
  reference: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  referenceText: { flexShrink: 1, fontSize: 15, fontWeight: '600', color: EDITORIAL_COLORS.charcoal },
  notice: { color: '#437156', fontSize: 12 },
  error: { color: EDITORIAL_COLORS.dangerText, fontSize: 13 },
  image: { width: '100%', backgroundColor: '#FFF', borderRadius: 10 },
  pdf: { alignItems: 'center', justifyContent: 'center', gap: 10, backgroundColor: EDITORIAL_COLORS.sand, borderRadius: 10 },
  pdfIcon: { fontSize: 48 },
  actions: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  smallButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 22, backgroundColor: EDITORIAL_COLORS.sand },
  actionText: { color: EDITORIAL_COLORS.terracotta, fontSize: 13, fontWeight: '700' },
  open: { minHeight: 44, justifyContent: 'center', backgroundColor: EDITORIAL_COLORS.terracotta, borderRadius: 22, paddingHorizontal: 16 },
  white: { color: EDITORIAL_COLORS.paper, fontWeight: '700' },
  closeButton: { minHeight: 44, minWidth: 44, justifyContent: 'center', alignItems: 'center' },
  close: { color: EDITORIAL_COLORS.taupe, fontSize: 28 },
});
