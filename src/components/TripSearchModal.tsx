import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { searchTripData, TRIP_SEARCH_LABELS, type TripSearchData, type TripSearchKind, type TripSearchResult } from '@/lib/trip-search';
import type { AppTheme } from '@/lib/theme';

export function TripSearchModal({ visible, data, theme, isOffline, onClose, onSelect }: { visible: boolean; data: TripSearchData; theme: AppTheme; isOffline: boolean; onClose: () => void; onSelect: (result: TripSearchResult) => void }) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<TripSearchKind | undefined>();
  useEffect(() => { if (visible) { setQuery(''); setKind(undefined); } }, [visible, data.tripId]);
  const results = useMemo(() => visible ? searchTripData(data, query, kind) : [], [visible, data.items, data.vouchers, data.expenses, data.places, data.tripId, query, kind]);
  return <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
    <View style={styles.backdrop}>
      <Pressable style={styles.dismiss} accessibilityRole="button" accessibilityLabel="關閉行程搜尋背景" onPress={onClose} />
      <View style={[styles.card, { backgroundColor: theme.colors.surface }]}>
        <View style={styles.heading}><Text style={[styles.title, { color: theme.colors.text }]}>搜尋此行程</Text><Pressable accessibilityRole="button" accessibilityLabel="關閉行程搜尋" style={styles.close} onPress={onClose}><Text style={{ color: theme.colors.muted, fontSize: 26 }}>×</Text></Pressable></View>
        <Text style={[styles.hint, { color: theme.colors.muted }]}>{isOffline ? '離線搜尋已快取的景點、票券、旅費與靈感' : '搜尋名稱、地址、備註或預約編號'}</Text>
        <TextInput autoFocus={visible} value={query} onChangeText={setQuery} accessibilityLabel="搜尋行程內容" placeholder="例如：USJ、住宿地址、ABC123" placeholderTextColor={theme.colors.muted} maxLength={200} returnKeyType="search" style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.surfaceMuted }]} />
        <View style={styles.filters}>{([undefined, 'item', 'voucher', 'expense', 'place'] as const).map((type) => <Pressable key={type ?? 'all'} accessibilityRole="button" accessibilityState={{ selected: kind === type }} onPress={() => setKind(type)} style={[styles.filter, { backgroundColor: kind === type ? theme.colors.primary : theme.colors.surfaceMuted }]}><Text style={{ color: kind === type ? '#FFF' : theme.colors.muted, fontSize: 12 }}>{type ? TRIP_SEARCH_LABELS[type] : '全部'}</Text></Pressable>)}</View>
        <Text style={[styles.hint, { color: theme.colors.muted }]}>{query.trim() ? `${results.length} 筆結果` : '輸入關鍵字開始搜尋'}</Text>
        <FlatList style={styles.list} data={results} keyboardShouldPersistTaps="handled" initialNumToRender={12} windowSize={5} keyExtractor={(item) => `${item.kind}:${item.id}`} ListEmptyComponent={query.trim() ? <Text style={[styles.empty, { color: theme.colors.muted }]}>沒有符合的內容，試試名稱、地址或其他關鍵字。</Text> : null} renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`查看${TRIP_SEARCH_LABELS[item.kind]} ${item.title}`} style={[styles.result, { backgroundColor: theme.colors.surfaceMuted }]} onPress={() => onSelect(item)}><Text style={{ fontSize: 11, color: theme.colors.primary }}>{TRIP_SEARCH_LABELS[item.kind]}{item.dayNumber ? ` · Day ${item.dayNumber}` : ''}</Text><Text style={[styles.resultTitle, { color: theme.colors.text }]}>{item.title}</Text>{item.subtitle ? <Text numberOfLines={2} style={[styles.hint, { color: theme.colors.muted }]}>{item.subtitle}</Text> : null}</Pressable>} />
      </View>
    </View>
  </Modal>;
}
const styles = StyleSheet.create({
  backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 16, backgroundColor: 'rgba(0,0,0,0.4)' },
  dismiss: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  card: { width: '100%', maxWidth: 640, height: '85%', borderRadius: 24, padding: 20, gap: 12 },
  heading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { fontSize: 21, fontWeight: '700' },
  close: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  hint: { fontSize: 12 },
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 16 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  filter: { borderRadius: 20, minHeight: 40, justifyContent: 'center', paddingHorizontal: 12 },
  list: { flex: 1, minHeight: 0 },
  empty: { paddingVertical: 24, textAlign: 'center', fontSize: 13 },
  result: { padding: 14, borderRadius: 14, gap: 6, marginBottom: 8 },
  resultTitle: { fontSize: 16, fontWeight: '700' },
});
