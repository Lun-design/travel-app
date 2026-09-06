import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { fetchWeatherForecast } from '@/lib/weather-api';
import type { ItineraryItem } from '@/lib/itinerary';
import { createPackingItem, deletePackingItem as deletePackingItemRemote, importPackingTemplate, listPackingItems, updatePackingItem as updatePackingItemRemote, type PackingItem } from '@/lib/packing-api';
import { dedupePackingItems, generatePackingSuggestions, groupPackingItems, isPackingComplete, packingItemKey, packingProgress, type PackingTemplate } from '@/lib/packing-utils';
import type { TripMemberWithProfile } from '@/lib/trips';
import { PuppyMascot } from './PuppyMascot';
import { EDITORIAL_COLORS, getThemeForMode, type ThemeMode } from '@/lib/theme';
import { offlineStore } from '@/lib/offline-store';
import { getProfileDisplayName } from '@/lib/profiles';
import { ProfileAvatar } from './ProfileAvatar';

const categories = ['證件', '電子產品', '衣物', '藥品', '隨身物品', '未分類'];
const templates: PackingTemplate[] = ['國內輕旅行', '國外海島', '雪國滑雪'];

export function PackingPanel({ tripId, userId = 'anonymous', members, destination = '', tripStartDate, items: itineraryItems = [], themeMode }: {
  tripId: string;
  userId?: string;
  members: TripMemberWithProfile[];
  destination?: string;
  tripStartDate?: string;
  items?: ItineraryItem[];
  themeMode?: ThemeMode;
}) {
  const theme = getThemeForMode(themeMode ?? 'system', useColorScheme());
  const [items, setItems] = useState<PackingItem[]>([]);
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [name, setName] = useState('');
  const [category, setCategory] = useState('未分類');
  const [busy, setBusy] = useState(false);
  const [celebrateVisible, setCelebrateVisible] = useState(false);
  const offlineScope = { userId, tripId };
  const deletePackingItem = (id: string) => deletePackingItemRemote(id, { offlineScope, store: offlineStore });
  const updatePackingItem = (id: string, patch: Parameters<typeof updatePackingItemRemote>[1], options = { offlineScope, store: offlineStore }) => updatePackingItemRemote(id, patch, options);
  const progress = useMemo(() => packingProgress(items), [items]);
  const groups = useMemo(() => groupPackingItems(items), [items]);
  const hasExistingItem = (candidate: { name: string; category: string }) => items.some((item) => packingItemKey(item) === packingItemKey(candidate));
  const memberFor = (id: string | null) => id ? members.find((member) => member.user_id === id) : undefined;
  const label = (id: string | null) => id ? getProfileDisplayName(memberFor(id)?.profile, id.slice(0, 8)) : '未指派';

  async function load() {
    try { setItems(await listPackingItems(tripId, { offlineScope, store: offlineStore })); }
    catch (error: any) { Alert.alert('載入清單失敗', error?.message ?? '請稍後再試。'); }
  }
  useEffect(() => { void load(); }, [tripId]);

  async function toggle(item: PackingItem) {
    const next = !item.is_checked;
    setItems((current) => current.map((value) => value.id === item.id ? { ...value, is_checked: next, is_packed: next } : value));
    try {
      await updatePackingItem(item.id, { is_checked: next, is_packed: next }, { offlineScope, store: offlineStore });
      const nextItems = items.map((value) => value.id === item.id ? { ...value, is_checked: next, is_packed: next } : value);
      if (next && isPackingComplete(nextItems)) setCelebrateVisible(true);
    }
    catch { await load(); }
  }

  async function add() {
    if (!name.trim()) return;
    if (hasExistingItem({ name, category })) { setName(''); return; }
    setBusy(true);
    try { const item = await createPackingItem({ trip_id: tripId, category, name: name.trim() }, { offlineScope, store: offlineStore, existingItems: items }); setItems((current) => current.some((value) => value.id === item.id) ? current : [...current, item]); setName(''); }
    catch (error: any) { Alert.alert('新增項目失敗', error?.message ?? '請稍後再試。'); }
    finally { setBusy(false); }
  }

  async function importTemplate(template: PackingTemplate) {
    setBusy(true);
    try { await importPackingTemplate(tripId, template, { offlineScope, store: offlineStore, existingItems: items }); await load(); }
    catch (error: any) { Alert.alert('匯入範本失敗', error?.message ?? '請稍後再試。'); }
    finally { setBusy(false); }
  }

  async function suggestItems() {
    setBusy(true);
    try {
      const firstLocated = itineraryItems.find((item) => item.latitude !== null && item.latitude !== undefined && item.longitude !== null && item.longitude !== undefined);
      const weather = firstLocated && tripStartDate ? await fetchWeatherForecast(Number(firstLocated.latitude), Number(firstLocated.longitude), tripStartDate) : null;
      const suggestions = dedupePackingItems(generatePackingSuggestions(destination, weather), items);
      if (!suggestions.length) { Alert.alert('清單已很完整', '目前沒有新的建議項目。'); return; }
      await Promise.all(suggestions.map((item) => createPackingItem({ trip_id: tripId, category: item.category, name: item.name }, { offlineScope, store: offlineStore, existingItems: items })));
      await load();
    } catch (error: any) { Alert.alert('產生建議失敗', error?.message ?? '請稍後再試。'); }
    finally { setBusy(false); }
  }

  return <View style={[styles.root, { backgroundColor: theme.colors.background }]}><View style={[styles.container, { backgroundColor: theme.colors.background }] }>
    <View style={styles.progressCard}><View style={styles.progressHeader}><Text style={styles.progressTitle}>準備進度</Text><Text style={styles.progressValue}>{progress.completed}/{progress.total} ({progress.percentage}%)</Text></View><View style={styles.track}><View style={[styles.fill, { width: `${progress.percentage}%` }]} /></View></View>
    <Pressable style={styles.aiButton} onPress={() => void suggestItems()} disabled={busy}><Text style={styles.aiText}>🪄 AI 智慧建議清單</Text><Text style={styles.aiHint}>依目的地與預報補上常用必帶物品</Text></Pressable>
    <Text style={styles.sectionTitle}>快速匯入範本</Text><View style={styles.templates}>{templates.map((value) => <Pressable key={value} style={styles.template} onPress={() => void importTemplate(value)} disabled={busy}><Text style={styles.templateText}>📋 {value}</Text></Pressable>)}</View>
    <View style={styles.addRow}><TextInput style={styles.input} placeholder="新增項目，例如：行動電源" value={name} onChangeText={setName} onSubmitEditing={() => void add()} /><Pressable style={styles.addButton} onPress={() => void add()} disabled={busy}><Text style={styles.white}>新增</Text></Pressable></View>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>{categories.map((value) => <Pressable key={value} onPress={() => setCategory(value)} style={[styles.category, category === value && styles.categorySelected]}><Text style={category === value ? styles.white : undefined}>{value}</Text></Pressable>)}</ScrollView>
    {categories.filter((value) => groups[value]?.length).map((value) => <View key={value} style={styles.group}><Pressable style={styles.groupHeader} onPress={() => setOpen((current) => ({ ...current, [value]: !(current[value] ?? true) }))}><Text style={styles.groupTitle}>{value}</Text><Text style={styles.groupCount}>{groups[value].filter((item) => item.is_checked).length}/{groups[value].length} {open[value] === false ? '展開' : '收合'}</Text></Pressable>{open[value] === false ? null : groups[value].map((item) => <View key={item.id} style={styles.item}><Pressable style={[styles.checkbox, item.is_checked && styles.checked]} onPress={() => void toggle(item)}><Text style={styles.checkText}>{item.is_checked ? '✓' : ''}</Text></Pressable><Text numberOfLines={2} style={[styles.itemName, item.is_checked && styles.done]}>{item.name}</Text><Pressable style={styles.assigneeButton} onPress={() => { const next = members.find((member) => member.user_id !== item.assigned_to); if (next) void updatePackingItem(item.id, { assigned_to: next.user_id }).then(load); }}><ProfileAvatar profile={memberFor(item.assigned_to)?.profile} userId={item.assigned_to ?? undefined} size={26} /><Text numberOfLines={1} style={styles.assignee}>{label(item.assigned_to)}</Text></Pressable><Pressable onPress={() => void deletePackingItem(item.id).then(load)}><Text style={styles.delete}>×</Text></Pressable></View>)}</View>)}
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
  </View></View>;
}

const styles = StyleSheet.create({
  root: { width: '100%', maxWidth: '100%', minHeight: 0 },
  container: { width: '100%', maxWidth: '100%', minHeight: 0, boxSizing: 'border-box', padding: 4, paddingBottom: 100, gap: 13 },
  progressCard: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', backgroundColor: EDITORIAL_COLORS.paper, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 14, padding: 14, gap: 12 },
  progressHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  progressTitle: { color: EDITORIAL_COLORS.charcoal, fontWeight: '800', flexShrink: 1 },
  progressValue: { color: EDITORIAL_COLORS.terracotta, fontSize: 13, fontWeight: '800', flexShrink: 0 },
  track: { height: 9, backgroundColor: EDITORIAL_COLORS.sand, borderRadius: 5, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: EDITORIAL_COLORS.terracotta, borderRadius: 5 },
  aiButton: { width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', backgroundColor: EDITORIAL_COLORS.terracottaSoft, borderColor: EDITORIAL_COLORS.line, borderWidth: 1, borderRadius: 12, minHeight: 44, padding: 14, gap: 3 },
  aiText: { color: EDITORIAL_COLORS.terracotta, fontSize: 16, fontWeight: '800' },
  aiHint: { color: EDITORIAL_COLORS.taupe, fontSize: 12 },
  sectionTitle: { color: EDITORIAL_COLORS.charcoal, fontSize: 16, fontWeight: '800', marginTop: 4 },
  templates: { flexDirection: 'row', flexWrap: 'wrap', width: '100%', gap: 8 },
  template: { maxWidth: '100%', minHeight: 44, justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 9, backgroundColor: EDITORIAL_COLORS.paper, borderRadius: 10, borderWidth: 1, borderColor: EDITORIAL_COLORS.line },
  templateText: { fontSize: 13 },
  addRow: { width: '100%', maxWidth: '100%', flexDirection: 'row', gap: 8 },
  input: { flex: 1, minWidth: 0, minHeight: 44, backgroundColor: EDITORIAL_COLORS.paper, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 10, padding: 12 },
  addButton: { flexShrink: 0, minHeight: 44, backgroundColor: EDITORIAL_COLORS.terracotta, borderRadius: 10, justifyContent: 'center', paddingHorizontal: 14 },
  white: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
  categoryRow: { gap: 8 },
  category: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10, backgroundColor: EDITORIAL_COLORS.sand },
  categorySelected: { backgroundColor: EDITORIAL_COLORS.terracotta },
  group: { width: '100%', maxWidth: '100%', boxSizing: 'border-box', backgroundColor: EDITORIAL_COLORS.paper, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, borderRadius: 14, overflow: 'hidden' },
  groupHeader: { width: '100%', minHeight: 44, flexDirection: 'row', justifyContent: 'space-between', padding: 14, backgroundColor: EDITORIAL_COLORS.sand, boxSizing: 'border-box' },
  groupTitle: { fontWeight: '800' },
  groupCount: { color: EDITORIAL_COLORS.taupe },
  item: { width: '100%', maxWidth: '100%', boxSizing: 'border-box', minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 7, padding: 11, borderTopWidth: 1, borderTopColor: EDITORIAL_COLORS.line },
  checkbox: { width: 28, height: 28, borderRadius: 7, borderWidth: 2, borderColor: '#A9A397', alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: EDITORIAL_COLORS.terracotta, borderColor: EDITORIAL_COLORS.terracotta },
  checkText: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
  itemName: { flex: 1, minWidth: 0, flexShrink: 1, fontSize: 14 },
  done: { textDecorationLine: 'line-through', color: '#94a3b8' },
  assigneeButton: { flexShrink: 1, maxWidth: '34%', minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 4 },
  assignee: { color: EDITORIAL_COLORS.terracotta, fontSize: 11 },
  delete: { color: EDITORIAL_COLORS.dangerText, fontSize: 22, minHeight: 44, paddingVertical: 10 },
  modalBackdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: 'rgba(31,31,31,.45)' },
  celebrateCard: { width: '100%', maxWidth: 360, alignItems: 'center', gap: 8, padding: 24, borderRadius: 14, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, backgroundColor: EDITORIAL_COLORS.paper },
  celebrateTitle: { color: EDITORIAL_COLORS.charcoal, fontSize: 22, fontWeight: '800' },
  celebrateText: { color: EDITORIAL_COLORS.taupe, textAlign: 'center' },
  closeButton: { marginTop: 8, minHeight: 44, justifyContent: 'center', borderRadius: 10, backgroundColor: EDITORIAL_COLORS.terracotta, paddingHorizontal: 24, paddingVertical: 10 },
});
