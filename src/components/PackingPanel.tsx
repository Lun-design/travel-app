import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { fetchWeatherForecast } from '@/lib/weather-api';
import type { ItineraryItem } from '@/lib/itinerary';
import { createPackingItem, deletePackingItem, importPackingTemplate, listPackingItems, updatePackingItem, type PackingItem } from '@/lib/packing-api';
import { generatePackingSuggestions, groupPackingItems, isPackingComplete, packingProgress, type PackingTemplate } from '@/lib/packing-utils';
import type { TripMemberWithProfile } from '@/lib/trips';
import { PuppyMascot } from './PuppyMascot';
import { getAppTheme } from '@/lib/theme';

const categories = ['證件', '電子產品', '衣物', '藥品', '隨身物品', '未分類'];
const templates: PackingTemplate[] = ['國內輕旅行', '國外海島', '雪國滑雪'];

export function PackingPanel({ tripId, members, destination = '', tripStartDate, items: itineraryItems = [] }: {
  tripId: string;
  members: TripMemberWithProfile[];
  destination?: string;
  tripStartDate?: string;
  items?: ItineraryItem[];
}) {
  const theme = getAppTheme(useColorScheme());
  const [items, setItems] = useState<PackingItem[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [name, setName] = useState('');
  const [category, setCategory] = useState('未分類');
  const [busy, setBusy] = useState(false);
  const [celebrateVisible, setCelebrateVisible] = useState(false);
  const progress = useMemo(() => packingProgress(items), [items]);
  const groups = useMemo(() => groupPackingItems(items), [items]);
  const label = (id: string | null) => id ? members.find((member) => member.user_id === id)?.profile?.display_name || id.slice(0, 8) : '未指派';

  async function load() {
    try { setItems(await listPackingItems(tripId)); }
    catch (error: any) { Alert.alert('載入清單失敗', error?.message ?? '請稍後再試。'); }
  }
  useEffect(() => { void load(); }, [tripId]);

  async function toggle(item: PackingItem) {
    const next = !item.is_checked;
    setItems((current) => current.map((value) => value.id === item.id ? { ...value, is_checked: next, is_packed: next } : value));
    try {
      await updatePackingItem(item.id, { is_checked: next, is_packed: next });
      const nextItems = items.map((value) => value.id === item.id ? { ...value, is_checked: next, is_packed: next } : value);
      if (next && isPackingComplete(nextItems)) setCelebrateVisible(true);
    }
    catch { await load(); }
  }

  async function add() {
    if (!name.trim()) return;
    setBusy(true);
    try { const item = await createPackingItem({ trip_id: tripId, category, name: name.trim() }); setItems((current) => [...current, item]); setName(''); }
    catch (error: any) { Alert.alert('新增項目失敗', error?.message ?? '請稍後再試。'); }
    finally { setBusy(false); }
  }

  async function importTemplate(template: PackingTemplate) {
    setBusy(true);
    try { await importPackingTemplate(tripId, template); await load(); }
    catch (error: any) { Alert.alert('匯入範本失敗', error?.message ?? '請稍後再試。'); }
    finally { setBusy(false); }
  }

  async function suggestItems() {
    setBusy(true);
    try {
      const firstLocated = itineraryItems.find((item) => item.latitude !== null && item.latitude !== undefined && item.longitude !== null && item.longitude !== undefined);
      const weather = firstLocated && tripStartDate ? await fetchWeatherForecast(Number(firstLocated.latitude), Number(firstLocated.longitude), tripStartDate) : null;
      const existingNames = new Set(items.map((item) => item.name.trim().toLocaleLowerCase()));
      const suggestions = generatePackingSuggestions(destination, weather).filter((item) => !existingNames.has(item.name.toLocaleLowerCase()));
      if (!suggestions.length) { Alert.alert('清單已很完整', '目前沒有新的建議項目。'); return; }
      await Promise.all(suggestions.map((item) => createPackingItem({ trip_id: tripId, category: item.category, name: item.name })));
      await load();
    } catch (error: any) { Alert.alert('產生建議失敗', error?.message ?? '請稍後再試。'); }
    finally { setBusy(false); }
  }

  return <ScrollView style={[styles.scroll, { backgroundColor: theme.colors.background }]} contentContainerStyle={[styles.container, { backgroundColor: theme.colors.background }]}>
    <View style={styles.progressCard}><View style={styles.progressHeader}><Text style={styles.progressTitle}>準備進度</Text><Text style={styles.progressValue}>{progress.completed}/{progress.total} ({progress.percentage}%)</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${progress.percentage}%` }]} /></View></View>
    <Pressable style={styles.aiButton} onPress={() => void suggestItems()} disabled={busy}><Text style={styles.aiText}>🪄 AI 智慧建議清單</Text><Text style={styles.aiHint}>依目的地與預報補上常用必帶物品</Text></Pressable>
    <Text style={styles.sectionTitle}>快速匯入範本</Text><View style={styles.templates}>{templates.map((value) => <Pressable key={value} style={styles.template} onPress={() => void importTemplate(value)} disabled={busy}><Text style={styles.templateText}>📋 {value}</Text></Pressable>)}</View>
    <View style={styles.addRow}><TextInput style={styles.input} placeholder="新增項目，例如：行動電源" value={name} onChangeText={setName} onSubmitEditing={() => void add()} /><Pressable style={styles.addButton} onPress={() => void add()} disabled={busy}><Text style={styles.white}>新增</Text></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>{categories.map((value) => <Pressable key={value} onPress={() => setCategory(value)} style={[styles.category, category === value && styles.categorySelected]}><Text style={category === value ? styles.white : undefined}>{value}</Text></Pressable>)}</ScrollView>
    {categories.filter((value) => groups[value]?.length).map((value) => <View key={value} style={styles.group}><Pressable style={styles.groupHeader} onPress={() => setOpen((current) => ({ ...current, [value]: !(current[value] ?? true) }))}><Text style={styles.groupTitle}>{value}</Text><Text style={styles.groupCount}>{groups[value].filter((item) => item.is_checked).length}/{groups[value].length} {open[value] === false ? '展開' : '收合'}</Text></Pressable>{open[value] === false ? null : groups[value].map((item) => <View key={item.id} style={styles.item}><Pressable style={[styles.checkbox, item.is_checked && styles.checked]} onPress={() => void toggle(item)}><Text style={styles.checkText}>{item.is_checked ? '✓' : ''}</Text></Pressable><Text numberOfLines={2} style={[styles.itemName, item.is_checked && styles.done]}>{item.name}</Text><Pressable style={styles.assigneeButton} onPress={() => { const next = members.find((member) => member.user_id !== item.assigned_to); if (next) void updatePackingItem(item.id, { assigned_to: next.user_id }).then(load); }}><Text numberOfLines={1} style={styles.assignee}>{label(item.assigned_to)}</Text></Pressable><Pressable onPress={() => void deletePackingItem(item.id).then(load)}><Text style={styles.delete}>×</Text></Pressable></View>)}</View>)}
    <Modal visible={celebrateVisible} transparent animationType="fade" onRequestClose={() => setCelebrateVisible(false)}>
      <View style={styles.modalBackdrop}>
        <View style={styles.celebrateCard}>
          <PuppyMascot puppy="-4" size={220} accessibilityLabel="打包完成" />
          <Text style={styles.celebrateTitle}>全部打包完成！</Text>
          <Text style={styles.celebrateText}>行李準備好了，祝你旅途愉快。</Text>
          <Pressable style={styles.closeButton} onPress={() => setCelebrateVisible(false)}><Text style={styles.white}>太棒了</Text></Pressable>
        </View>
      </View>
    </Modal>
  </ScrollView>;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, width: '100%', maxWidth: '100%', minHeight: 0, overflow: 'hidden' },
  container: { width: '100%', maxWidth: '100%', minHeight: 0, boxSizing: 'border-box', padding: 4, paddingBottom: 100, gap: 13 },
  progressCard: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', backgroundColor: '#eff6ff', borderRadius: 17, padding: 14, gap: 12 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  progressTitle: { color: '#1e3a8a', fontWeight: '800', flexShrink: 1 },
  progressValue: { color: '#2563eb', fontSize: 13, fontWeight: '800', flexShrink: 0 },
  track: { height: 9, backgroundColor: '#dbeafe', borderRadius: 8, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: '#2563eb', borderRadius: 8 },
  aiButton: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, borderRadius: 15, padding: 14, gap: 3 },
  aiText: { color: '#9a3412', fontSize: 16, fontWeight: '800' },
  aiHint: { color: '#c2410c', fontSize: 12 },
  sectionTitle: { fontSize: 16, fontWeight: '800', marginTop: 4 },
  templates: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', gap: 8 },
  template: { maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 9, backgroundColor: 'white', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  templateText: { fontSize: 13 },
  addRow: { width: '100%', maxWidth: '100%', flexDirection: 'row', gap: 8 },
  input: { flex: 1, minWidth: 0, backgroundColor: 'white', borderWidth: 1, borderColor: '#dbe2ea', borderRadius: 12, padding: 12 },
  addButton: { flexShrink: 0, backgroundColor: '#2563eb', borderRadius: 12, justifyContent: 'center', paddingHorizontal: 14 },
  white: { color: 'white', fontWeight: '800' },
  categoryRow: { gap: 8 },
  category: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 18, backgroundColor: '#e2e8f0' },
  categorySelected: { backgroundColor: '#2563eb' },
  group: { width: '100%', maxWidth: '100%', boxSizing: 'border-box', backgroundColor: 'white', borderRadius: 15, overflow: 'hidden' },
  groupHeader: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', padding: 14, backgroundColor: '#f1f5f9', boxSizing: 'border-box' },
  groupTitle: { fontWeight: '800' },
  groupCount: { color: '#64748b' },
  item: { width: '100%', maxWidth: '100%', boxSizing: 'border-box', flexDirection: 'row', alignItems: 'center', gap: 7, padding: 11, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  checkbox: { width: 24, height: 24, borderRadius: 7, borderWidth: 2, borderColor: '#94a3b8', alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  checkText: { color: 'white', fontWeight: '800' },
  itemName: { flex: 1, minWidth: 0, flexShrink: 1, fontSize: 14 },
  done: { textDecorationLine: 'line-through', color: '#94a3b8' },
  assigneeButton: { flexShrink: 1, maxWidth: '28%' },
  assignee: { color: '#2563eb', fontSize: 11 },
  delete: { color: '#dc2626', fontSize: 22 },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(15,23,42,.45)' },
  celebrateCard: { width: '100%', maxWidth: 360, alignItems: 'center', gap: 8, padding: 24, borderRadius: 24, backgroundColor: 'white' },
  celebrateTitle: { color: '#0f172a', fontSize: 22, fontWeight: '800' },
  celebrateText: { color: '#64748b', textAlign: 'center' },
  closeButton: { marginTop: 8, borderRadius: 12, backgroundColor: '#2563eb', paddingHorizontal: 24, paddingVertical: 12 },
});
