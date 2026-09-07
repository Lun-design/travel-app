import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Pressable, Share, StyleSheet, Text, View, useColorScheme } from 'react-native';
import type { Settlement } from '@/lib/expenses-api';
import { getThemeForMode, type ThemeMode } from '@/lib/theme';
import { EDITORIAL_COLORS } from '@/lib/theme';
import { PuppyMascot } from './PuppyMascot';
import type { TripMemberWithProfile } from '@/lib/trips';
import { getProfileDisplayName } from '@/lib/profiles';
import { ProfileAvatar } from './ProfileAvatar';

type Props = {
  settlements: Settlement[];
  labelFor: (id: string) => string;
  members?: TripMemberWithProfile[];
  themeMode?: ThemeMode;
  onSettled?: () => void;
};

export function SettlementCard({ settlements, labelFor, members = [], themeMode = 'system', onSettled }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [showCelebration, setShowCelebration] = useState(false);
  const [markedSettled, setMarkedSettled] = useState(false);
  const [copied, setCopied] = useState(false);
  const previousCount = useRef(settlements.length);

  const memberFor = (id: string) => members.find((member) => member.user_id === id);
  const displayName = (id: string) => getProfileDisplayName(memberFor(id)?.profile, labelFor(id));
  const settlementText = settlements.map((item) => `${displayName(item.from)} → ${displayName(item.to)} ${item.currency} ${item.amount.toFixed(2)}`).join('\n');
  useEffect(() => {
    if (previousCount.current > 0 && settlements.length === 0) setShowCelebration(true);
    previousCount.current = settlements.length;
    setMarkedSettled(false);
  }, [settlements.length, settlementText]);

  async function copySettlement() {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(settlementText);
      } else {
        await Share.share({ message: settlementText });
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (error) {
      Alert.alert('複製失敗', error instanceof Error ? error.message : '請手動記下結算內容。');
    }
  }

  function markSettled() {
    setMarkedSettled(true);
    onSettled?.();
    setShowCelebration(true);
  }

  const isComplete = markedSettled || settlements.length === 0;
  return <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
    <Text style={[styles.title, { color: theme.colors.primary }]}>分帳結算</Text>
    {!isComplete ? <>
      {settlements.map((item, index) => <View key={`${item.from}-${item.to}-${index}`} style={styles.row}>
        <View style={styles.settlementText}>
          <View style={styles.person}><ProfileAvatar profile={memberFor(item.from)?.profile} userId={item.from} size={24} /><Text numberOfLines={1} style={[styles.personName, { color: theme.colors.text }]}>{displayName(item.from)}</Text></View>
          <Text style={[styles.connector, { color: theme.colors.muted }]}>應轉給</Text>
          <View style={styles.person}><ProfileAvatar profile={memberFor(item.to)?.profile} userId={item.to} size={24} /><Text numberOfLines={1} style={[styles.personName, { color: theme.colors.text }]}>{displayName(item.to)}</Text></View>
        </View>
        <Text numberOfLines={1} adjustsFontSizeToFit style={[styles.amount, { color: theme.colors.primary }]}>{item.currency} {item.amount.toFixed(2)}</Text>
      </View>)}
      <View style={styles.actions}>
        <Pressable accessibilityRole="button" onPress={() => void copySettlement()} style={[styles.actionButton, { borderColor: theme.colors.border }]}><Text style={{ color: theme.colors.text, fontWeight: '700' }}>{copied ? '已複製' : '複製結算文字'}</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={markSettled} style={[styles.actionButton, { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary }]}><Text style={styles.actionButtonText}>標記已結清</Text></Pressable>
      </View>
    </> : <Pressable style={styles.complete} onPress={() => setShowCelebration(true)}><PuppyMascot puppy="-2" size={220} accessibilityLabel="分帳完成" /><Text style={[styles.empty, { color: theme.colors.muted }]}>{markedSettled ? '本次分帳已標記結清！' : '目前沒有需要轉帳的款項'}</Text><Text style={styles.hint}>大家都已經對好帳囉</Text></Pressable>}
    <Modal visible={showCelebration} transparent animationType="fade" onRequestClose={() => setShowCelebration(false)}><View style={styles.modalBackdrop}><View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}><PuppyMascot puppy="-2" size={220} accessibilityLabel="分帳完成" /><Text style={[styles.modalTitle, { color: theme.colors.text }]}>分帳完成！</Text><Text style={[styles.modalText, { color: theme.colors.muted }]}>旅費已整理完成，祝你們旅途愉快。</Text><Pressable style={styles.closeButton} onPress={() => setShowCelebration(false)}><Text style={styles.closeText}>關閉</Text></Pressable></View></View></Modal>
  </View>;
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', backgroundColor: EDITORIAL_COLORS.terracottaSoft, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 14, padding: 16, gap: 10, marginBottom: 14 },
  title: { fontSize: 17, fontWeight: '800' },
  row: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  complete: { alignItems: 'center', gap: 8 },
  settlementText: { flex: 1, minWidth: 0, gap: 2 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0 },
  personName: { flexShrink: 1, fontSize: 13, fontWeight: '700' },
  connector: { fontSize: 11, marginLeft: 29 },
  amount: { maxWidth: '42%', flexShrink: 0, fontSize: 13, fontWeight: '800', textAlign: 'right' },
  actions: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  actionButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  actionButtonText: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
  empty: { textAlign: 'center' },
  hint: { color: EDITORIAL_COLORS.terracotta, fontSize: 12, fontWeight: '700' },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(31,31,31,.45)' },
  modalCard: { width: '100%', maxWidth: 360, alignItems: 'center', gap: 8, padding: 24, borderRadius: 14, borderWidth: 1, borderColor: EDITORIAL_COLORS.line },
  modalTitle: { fontSize: 22, fontWeight: '800' },
  modalText: { textAlign: 'center' },
  closeButton: { marginTop: 8, minHeight: 44, justifyContent: 'center', borderRadius: 10, backgroundColor: EDITORIAL_COLORS.terracotta, paddingHorizontal: 24, paddingVertical: 10 },
  closeText: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
});
