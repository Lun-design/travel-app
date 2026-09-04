import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import type { Settlement } from '@/lib/expenses-api';
import { getAppTheme } from '@/lib/theme';
import { PuppyMascot } from './PuppyMascot';

export function SettlementCard({ settlements, labelFor }: { settlements: Settlement[]; labelFor: (id: string) => string }) {
  const theme = getAppTheme(useColorScheme());
  const [showCelebration, setShowCelebration] = useState(false);
  const previousCount = useRef(settlements.length);
  useEffect(() => { if (previousCount.current > 0 && settlements.length === 0) setShowCelebration(true); previousCount.current = settlements.length; }, [settlements.length]);
  return <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
    <Text style={[styles.title, { color: theme.colors.primary }]}>AA 結算</Text>
    {settlements.length ? settlements.map((item, index) => <View key={`${item.from}-${item.to}-${index}`} style={styles.row}><Text numberOfLines={2} style={[styles.settlementText, { color: theme.colors.text }]}>{labelFor(item.from)} 應給 {labelFor(item.to)}</Text><Text numberOfLines={1} adjustsFontSizeToFit style={[styles.amount, { color: theme.colors.primary }]}>{item.currency} {item.amount.toFixed(2)}</Text></View>) : <Pressable style={styles.complete} onPress={() => setShowCelebration(true)}><PuppyMascot puppy="-2" size={220} accessibilityLabel="分帳已結清" /><Text style={[styles.empty, { color: theme.colors.muted }]}>目前沒有待結清款項</Text><Text style={styles.hint}>點擊查看慶祝動畫</Text></Pressable>}
    <Modal visible={showCelebration} transparent animationType="fade" onRequestClose={() => setShowCelebration(false)}><View style={styles.modalBackdrop}><View style={[styles.modalCard, { backgroundColor: theme.colors.surface }]}><PuppyMascot puppy="-2" size={220} accessibilityLabel="分帳結清" /><Text style={[styles.modalTitle, { color: theme.colors.text }]}>🎉 分帳結清！</Text><Text style={[styles.modalText, { color: theme.colors.muted }]}>大家的旅費都已經算清楚了。</Text><Pressable style={styles.closeButton} onPress={() => setShowCelebration(false)}><Text style={styles.closeText}>好的</Text></Pressable></View></View></Modal>
  </View>;
}

const styles = StyleSheet.create({
  card: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', backgroundColor: '#eff6ff', borderRadius: 16, padding: 16, gap: 10, marginBottom: 14 }, title: { fontSize: 17, fontWeight: '800' }, row: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 }, complete: { alignItems: 'center', gap: 8 }, settlementText: { flex: 1, minWidth: 0 }, amount: { maxWidth: '42%', flexShrink: 0, fontSize: 13, fontWeight: '800', textAlign: 'right' }, empty: { textAlign: 'center' }, hint: { color: '#2563eb', fontSize: 12, fontWeight: '700' }, modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15,23,42,.45)' }, modalCard: { width: '100%', maxWidth: 360, alignItems: 'center', gap: 8, padding: 24, borderRadius: 24 }, modalTitle: { fontSize: 22, fontWeight: '800' }, modalText: { textAlign: 'center' }, closeButton: { marginTop: 8, borderRadius: 12, backgroundColor: '#2563eb', paddingHorizontal: 24, paddingVertical: 12 }, closeText: { color: 'white', fontWeight: '800' },
});
// Legacy layout contract: settlementText: { flex: 1, minWidth: 0
