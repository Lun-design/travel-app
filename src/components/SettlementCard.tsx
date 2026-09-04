import React, { useEffect, useRef, useState } from 'react'; import { Modal, Pressable, StyleSheet, Text, View } from 'react-native'; import type { Settlement } from '@/lib/expenses-api'; import { PuppyMascot } from './PuppyMascot';
export function SettlementCard({ settlements, labelFor }: { settlements: Settlement[]; labelFor: (id: string) => string }) {
  const [showCelebration, setShowCelebration] = useState(false);
  const previousCount = useRef(settlements.length);
  useEffect(() => {
    if (previousCount.current > 0 && settlements.length === 0) setShowCelebration(true);
    previousCount.current = settlements.length;
  }, [settlements.length]);
  return <View style={styles.card}>
    <Text style={styles.title}>AA 結算</Text>
    {settlements.length ? settlements.map((item, index) => <View key={`${item.from}-${item.to}-${index}`} style={styles.row}><Text style={styles.text}>{labelFor(item.from)} 應給 {labelFor(item.to)}</Text><Text style={styles.amount}>{item.currency} {item.amount.toFixed(2)}</Text></View>) : <Pressable style={styles.complete} onPress={() => setShowCelebration(true)}><PuppyMascot puppy="-2" size={220} accessibilityLabel="分帳已結清" /><Text style={styles.empty}>目前沒有需要結算的款項，分帳已完成！</Text><Text style={styles.hint}>點擊查看祝賀</Text></Pressable>}
    <Modal visible={showCelebration} transparent animationType="fade" onRequestClose={() => setShowCelebration(false)}>
      <View style={styles.modalBackdrop}><View style={styles.modalCard}><PuppyMascot puppy="-2" size={220} accessibilityLabel="分帳完成" /><Text style={styles.modalTitle}>分帳完成！</Text><Text style={styles.modalText}>大家的旅費已經結清，旅途愉快！</Text><Pressable style={styles.closeButton} onPress={() => setShowCelebration(false)}><Text style={styles.closeText}>太棒了</Text></Pressable></View></View>
    </Modal>
  </View>;
}
const styles = StyleSheet.create({ card: { backgroundColor: '#eff6ff', borderRadius: 16, padding: 16, gap: 10, marginBottom: 14 }, title: { fontSize: 17, fontWeight: '800', color: '#1e3a8a' }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, complete: { alignItems: 'center', gap: 8 }, text: { color: '#334155' }, amount: { fontWeight: '800', color: '#1d4ed8' }, empty: { color: '#64748b', textAlign: 'center' }, hint: { color: '#2563eb', fontSize: 12, fontWeight: '700' }, modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15,23,42,.45)' }, modalCard: { width: '100%', maxWidth: 360, alignItems: 'center', gap: 8, padding: 24, borderRadius: 24, backgroundColor: 'white' }, modalTitle: { color: '#0f172a', fontSize: 22, fontWeight: '800' }, modalText: { color: '#64748b', textAlign: 'center' }, closeButton: { marginTop: 8, borderRadius: 12, backgroundColor: '#2563eb', paddingHorizontal: 24, paddingVertical: 12 }, closeText: { color: 'white', fontWeight: '800' } });
