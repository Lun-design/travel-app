import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, Share, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import type { Settlement } from '@/lib/expenses-api';
import { getThemeForMode, type ThemeMode, EDITORIAL_COLORS } from '@/lib/theme';
import { PuppyMascot } from './PuppyMascot';
import type { TripMemberWithProfile } from '@/lib/trips';
import { getProfileDisplayName } from '@/lib/profiles';
import { ProfileAvatar } from './ProfileAvatar';
import { createSettlementRecord, type SettlementRecord } from '@/lib/settlement-api';

type Props = {
  settlements: Settlement[];
  labelFor: (id: string) => string;
  members?: TripMemberWithProfile[];
  themeMode?: ThemeMode;
  onSettled?: () => void;
  tripId?: string;
  userId?: string;
  settlementRecords?: SettlementRecord[];
  onSettlementCreated?: (record: SettlementRecord) => void;
};

export function SettlementCard({ settlements, labelFor, members = [], themeMode = 'system', onSettled, tripId, userId, settlementRecords = [], onSettlementCreated }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [showCelebration, setShowCelebration] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedSettlement, setSelectedSettlement] = useState<Settlement | null>(null);
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementNote, setSettlementNote] = useState('');
  const [settling, setSettling] = useState(false);
  const previousCount = useRef(settlements.length);

  const memberFor = (id: string) => members.find((member) => member.user_id === id);
  const displayName = (id: string) => getProfileDisplayName(memberFor(id)?.profile, labelFor(id));
  const settlementText = settlements.map((item) => `${displayName(item.from)} → ${displayName(item.to)} ${item.currency} ${item.amount.toFixed(2)}`).join('\n');

  useEffect(() => {
    if (previousCount.current > 0 && settlements.length === 0) setShowCelebration(true);
    previousCount.current = settlements.length;
  }, [settlements.length]);

  async function copySettlement() {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) await navigator.clipboard.writeText(settlementText);
      else await Share.share({ message: settlementText });
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      Alert.alert('複製失敗', error instanceof Error ? error.message : '請手動記下結算內容。');
    }
  }

  function openSettlement(item: Settlement) {
    setSelectedSettlement(item);
    setSettlementAmount(item.amount.toFixed(2));
    setSettlementNote('');
  }

  async function confirmSettlement() {
    if (!selectedSettlement || !tripId || !userId) {
      Alert.alert('無法結清', '找不到行程或使用者資訊，請重新開啟行程後再試。');
      return;
    }
    const amount = Number(settlementAmount);
    if (!Number.isFinite(amount) || amount <= 0 || amount > selectedSettlement.amount + 0.009) {
      Alert.alert('金額無效', `請輸入 0 到 ${selectedSettlement.amount.toFixed(2)} 之間的金額。`);
      return;
    }
    setSettling(true);
    try {
      const record = await createSettlementRecord({ trip_id: tripId, from_user_id: selectedSettlement.from, to_user_id: selectedSettlement.to, amount, currency: selectedSettlement.currency, note: settlementNote, settled_by: userId });
      onSettlementCreated?.(record);
      onSettled?.();
      setSelectedSettlement(null);
      setSettlementNote('');
    } catch (error) {
      Alert.alert('結清失敗', error instanceof Error ? error.message : '請稍後再試。');
    } finally {
      setSettling(false);
    }
  }

  const isComplete = settlements.length === 0;
  return (
    <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
      <Text style={[styles.title, { color: theme.colors.primary }]}>分帳結算</Text>
      {!isComplete ? <>
        {settlements.map((item, index) => <View key={`${item.from}-${item.to}-${index}`} style={styles.row}>
          <View style={styles.settlementText}>
            <View style={styles.person}><ProfileAvatar profile={memberFor(item.from)?.profile} userId={item.from} size={24} /><Text numberOfLines={1} style={[styles.personName, { color: theme.colors.text }]}>{displayName(item.from)}</Text></View>
            <Text style={[styles.connector, { color: theme.colors.muted }]}>應轉給</Text>
            <View style={styles.person}><ProfileAvatar profile={memberFor(item.to)?.profile} userId={item.to} size={24} /><Text numberOfLines={1} style={[styles.personName, { color: theme.colors.text }]}>{displayName(item.to)}</Text></View>
          </View>
          <View style={styles.amountColumn}><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.amount, { color: theme.colors.primary }]}>{item.currency} {item.amount.toFixed(2)}</Text><Pressable accessibilityRole="button" onPress={() => openSettlement(item)} style={[styles.rowSettleButton, { borderColor: theme.colors.primary }]}><Text style={[styles.rowSettleText, { color: theme.colors.primary }]}>標記為已結清</Text></Pressable></View>
        </View>)}
        <View style={styles.actions}><Pressable accessibilityRole="button" onPress={() => void copySettlement()} style={[styles.actionButton, { borderColor: theme.colors.border }]}><Text style={{ color: theme.colors.text, fontWeight: '700' }}>{copied ? '已複製' : '一鍵複製結算文字'}</Text></Pressable></View>
      </> : <Pressable style={styles.complete} onPress={() => setShowCelebration(true)}><PuppyMascot puppy="-2" size={220} accessibilityLabel="分帳完成" /><Text style={[styles.empty, { color: theme.colors.muted }]}>目前沒有需要轉帳的款項</Text><Text style={styles.hint}>大家都已經對好帳囉</Text></Pressable>}

      {settlementRecords.length > 0 ? <View style={styles.history}><Text style={[styles.historyTitle, { color: theme.colors.text }]}>結清歷史紀錄</Text>{settlementRecords.map((record) => <View key={record.id} style={styles.historyRow}><Text style={[styles.historyText, { color: theme.colors.text }]}>{displayName(record.from_user_id)} → {displayName(record.to_user_id)} {record.currency} {record.amount.toFixed(2)}</Text><Text style={[styles.historyNote, { color: theme.colors.muted }]}>{record.note || '已完成轉帳'} · {new Date(record.settled_at).toLocaleDateString()}</Text></View>)}</View> : null}

      <Modal visible={showCelebration} transparent animationType="fade" onRequestClose={() => setShowCelebration(false)}><View style={styles.modalBackdrop}><View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}><PuppyMascot puppy="-2" size={220} accessibilityLabel="分帳完成" /><Text style={[styles.modalTitle, { color: theme.colors.text }]}>分帳完成！</Text><Text style={[styles.modalText, { color: theme.colors.muted }]}>旅費已整理完成，祝你們旅途愉快。</Text><Pressable style={styles.closeButton} onPress={() => setShowCelebration(false)}><Text style={styles.closeText}>關閉</Text></Pressable></View></View></Modal>
      <Modal visible={Boolean(selectedSettlement)} transparent animationType="fade" onRequestClose={() => { if (!settling) setSelectedSettlement(null); }}><View style={styles.modalBackdrop}><View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}><Text style={[styles.modalTitle, { color: theme.colors.text }]}>確認結清</Text><Text style={[styles.modalText, { color: theme.colors.muted }]}>{selectedSettlement ? `${displayName(selectedSettlement.from)} → ${displayName(selectedSettlement.to)} ${selectedSettlement.currency}` : ''}</Text><TextInput value={settlementAmount} onChangeText={setSettlementAmount} keyboardType="decimal-pad" placeholder="轉帳金額" placeholderTextColor={theme.colors.muted} style={[styles.modalInput, { color: theme.colors.text, borderColor: theme.colors.border }]} /><TextInput value={settlementNote} onChangeText={setSettlementNote} placeholder="備註，例如：LINE Pay 已轉" placeholderTextColor={theme.colors.muted} style={[styles.modalInput, { color: theme.colors.text, borderColor: theme.colors.border }]} /><View style={styles.modalActions}><Pressable disabled={settling} style={styles.closeButton} onPress={() => setSelectedSettlement(null)}><Text style={styles.closeText}>取消</Text></Pressable><Pressable disabled={settling} style={[styles.closeButton, { opacity: settling ? 0.6 : 1 }]} onPress={() => void confirmSettlement()}><Text style={styles.closeText}>{settling ? '儲存中…' : '確認結清'}</Text></Pressable></View></View></View></Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', backgroundColor: EDITORIAL_COLORS.terracottaSoft, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 14, padding: 16, gap: 10, marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '800' }, row: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, complete: { alignItems: 'center', gap: 8 }, settlementText: { flex: 1, minWidth: 0, gap: 2 }, person: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 }, personName: { flexShrink: 1, fontSize: 13, fontWeight: '700' }, connector: { fontSize: 11, marginLeft: 29 }, amountColumn: { maxWidth: '42%', flexShrink: 0, alignItems: 'flex-end', gap: 4 }, amount: { fontSize: 13, fontWeight: '800', textAlign: 'right' }, rowSettleButton: { minHeight: 36, justifyContent: 'center', borderWidth: 1, borderRadius: 8, paddingHorizontal: 8 }, rowSettleText: { fontSize: 11, fontWeight: '800' }, actions: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }, actionButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 }, empty: { textAlign: 'center' }, hint: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '700' }, modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(31,31,31,.45)' }, modalCard: { width: '100%', maxWidth: 360, alignItems: 'center', gap: 8, padding: 24, borderRadius: 14, borderWidth: 1, borderColor: EDITORIAL_COLORS.line }, modalTitle: { fontSize: 22, fontWeight: '800' }, modalText: { textAlign: 'center' }, modalInput: { width: '100%', minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 }, modalActions: { width: '100%', flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }, history: { gap: 6, paddingTop: 4, borderTopWidth: 1, borderTopColor: EDITORIAL_COLORS.line }, historyTitle: { fontSize: 14, fontWeight: '800' }, historyRow: { gap: 2 }, historyText: { fontSize: 12, fontWeight: '700' }, historyNote: { fontSize: 11 }, closeButton: { marginTop: 8, minHeight: 44, justifyContent: 'center', borderRadius: 10, backgroundColor: EDITORIAL_COLORS.terracotta, paddingHorizontal: 24, paddingVertical: 10 }, closeText: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
});
