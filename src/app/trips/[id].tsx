import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, UIManager, useColorScheme, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { getTrip, listTripMembers, updateTrip, type Trip, type TripMemberWithProfile } from '@/lib/trips';
import { filterAndSortItems, type ItineraryItem } from '@/lib/itinerary';
import { tripDayNumbers } from '@/lib/trip-dates';
import { deleteItineraryItem, listItineraryItems, saveItineraryItem, updateItineraryItemsOrder } from '@/lib/itinerary-api';
import { calculateBalances, deleteExpense, listExpenses, saveExpense, type Expense } from '@/lib/expenses-api';
import { listVouchers } from '@/lib/vouchers-api';
import type { Voucher } from '@/lib/vouchers';
import { getDefaultMapOpen, getTripDetailLayout } from '@/lib/trip-detail-layout';
import { getAppTheme } from '@/lib/theme';
import { DayTabs } from '@/components/DayTabs';
import { TripMap } from '@/components/TripMap';
import { ItineraryTimeline } from '@/components/ItineraryTimeline';
import { ItineraryItemModal } from '@/components/ItineraryItemModal';
import { InviteTripModal } from '@/components/InviteTripModal';
import { ExpenseList } from '@/components/ExpenseList';
import { ExpenseModal } from '@/components/ExpenseModal';
import { SettlementCard } from '@/components/SettlementCard';
import { PackingPanel } from '@/components/PackingPanel';
import { VouchersPanel } from '@/components/VouchersPanel';
import { VoucherPreviewModal } from '@/components/VoucherPreviewModal';
import { TripSettingsModal } from '@/components/TripSettingsModal';
import { PuppyMascot } from '@/components/PuppyMascot';
import { SkeletonCard } from '@/components/SkeletonCard';

type Tab = 'timeline' | 'expenses' | 'packing' | 'documents';
const tabs: { value: Tab; label: string }[] = [
  { value: 'timeline', label: '行程時間軸' },
  { value: 'expenses', label: '💰 旅費分帳' },
  { value: 'packing', label: '🧳 打包清單' },
  { value: 'documents', label: '🎫 預約與票券' },
];

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const tripId = Array.isArray(id) ? id[0] : id;
  const insets = useSafeAreaInsets();
  const theme = getAppTheme(useColorScheme());
  const layout = getTripDetailLayout(width);
  const headerMascotSize = width >= 1100 ? 150 : width >= 800 ? 125 : width >= 600 ? 96 : 72;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<TripMemberWithProfile[]>([]);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [vouchers, setVouchers] = useState<Voucher[]>([]);
  const [previewVoucher, setPreviewVoucher] = useState<Voucher | null>(null);
  const [userId, setUserId] = useState('');
  const [day, setDay] = useState(1);
  const [tab, setTab] = useState<Tab>('timeline');
  const [isMapOpen, setIsMapOpen] = useState(() => getDefaultMapOpen(width));
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [isDayTransitioning, setIsDayTransitioning] = useState(false);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const timelineScrollRef = useRef<ScrollView>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [itemModal, setItemModal] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ItineraryItem | null>(null);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const days = useMemo(() => trip ? tripDayNumbers(trip.start_date, trip.end_date) : [1], [trip]);
  const visibleItems = filterAndSortItems(items, day);

  async function load() {
    if (!tripId) return;
    setLoading(true); setError('');
    try {
      const [{ data: auth }, tripData, memberData, itemData, expenseData, voucherData] = await Promise.all([
        supabase.auth.getUser(), getTrip(tripId), listTripMembers(tripId), listItineraryItems(tripId), listExpenses(tripId), listVouchers(tripId),
      ]);
      setUserId(auth.user?.id ?? ''); setTrip(tripData); setMembers(memberData); setItems(itemData); setExpenses(expenseData); setVouchers(voucherData);
    } catch (cause: any) { console.error('[TripDetail] load failed', cause); setError(cause?.message ?? '無法載入行程資料。'); }
    finally { setLoading(false); }
  }

  useEffect(() => { void load(); }, [tripId]);
  useEffect(() => { if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true); }, []);
  useEffect(() => { if (!isDayTransitioning) return; const timer = setTimeout(() => setIsDayTransitioning(false), 180); return () => clearTimeout(timer); }, [isDayTransitioning]);
  useEffect(() => { if (!isMapOpen) { setIsMapLoading(false); return; } const timer = setTimeout(() => setIsMapLoading(false), 220); return () => clearTimeout(timer); }, [isMapOpen]);
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined') return;
    const updateOnlineState = () => setIsOffline(!navigator.onLine);
    updateOnlineState(); window.addEventListener('online', updateOnlineState); window.addEventListener('offline', updateOnlineState);
    return () => { window.removeEventListener('online', updateOnlineState); window.removeEventListener('offline', updateOnlineState); };
  }, []);

  function animateLayout() { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); }
  function handleDayChange(nextDay: number) { if (nextDay === day) return; animateLayout(); setDay(nextDay); setFocusedItemId(null); setIsDayTransitioning(true); }
  function toggleMap() { animateLayout(); setIsMapLoading(true); setIsMapOpen((current) => !current); }
  function handleMapMarkerPress(itemId: string) {
    setFocusedItemId(itemId);
    const index = visibleItems.findIndex((item) => item.id === itemId);
    if (index < 0) return;
    if (Platform.OS === 'web' && typeof document !== 'undefined') { document.getElementById(`itinerary-item-${itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    timelineScrollRef.current?.scrollTo({ y: index * 160, animated: true });
  }
  async function reorderItems(order: { id: string; position: number }[]) {
    const previous = items; const positions = new Map(order.map((entry) => [entry.id, entry.position]));
    setItems((current) => current.map((item) => positions.has(item.id) ? { ...item, position: positions.get(item.id)! } : item));
    try { await updateItineraryItemsOrder(order); } catch (cause) { setItems(previous); throw cause; }
  }

  if (loading) return <View style={[styles.loadingShell, { backgroundColor: theme.colors.background }]}><SkeletonCard variant="header" /><SkeletonCard /><SkeletonCard /></View>;
  if (!trip) return <View style={styles.center}><Text style={styles.error}>{error || '找不到此行程。'}</Text></View>;

  return <View style={[styles.container, { backgroundColor: theme.colors.background, paddingHorizontal: layout.screenPaddingHorizontal, paddingTop: layout.screenPaddingTop, paddingBottom: 22 + insets.bottom }]}>
    <View style={[styles.header, { paddingTop: insets.top }]}>
      <View style={styles.headerTitleRow}><View style={styles.titleCopy}><Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/')}><Text style={styles.back}>‹ 返回我的行程</Text></Pressable><Text style={[styles.title, { color: theme.colors.text }]}>{trip.title}</Text></View><PuppyMascot puppy="-11" size={headerMascotSize} style={styles.headerMascot} accessibilityLabel="旅程裝飾" /></View>
      <View style={styles.headerMetaRow}><View style={styles.dateBlock}><Text style={[styles.destination, { color: theme.colors.muted }]}>{trip.destination} · {trip.start_date} – {trip.end_date}</Text></View><View style={styles.headerMembers}>{members.slice(0, 4).map((member, index) => <View key={member.user_id} style={[styles.avatar, { marginLeft: index ? -9 : 0, borderColor: theme.colors.background }]}><Text style={styles.avatarText}>{(member.profile?.display_name || member.user_id)[0].toUpperCase()}</Text></View>)}<Pressable style={styles.inviteButton} onPress={() => setInviteVisible(true)}><Text style={styles.inviteText}>＋ 邀請</Text></Pressable></View>{trip.created_by === userId ? <Pressable style={styles.settingsButton} onPress={() => setSettingsVisible(true)}><Text style={styles.settingsText}>⚙️ 行程設定</Text></Pressable> : null}</View>
    </View>
    {isOffline ? <View style={styles.offlineBar}><Text style={styles.offlineText}>📡 離線模式：已載入快取行程</Text></View> : null}
    {error ? <Text style={styles.error}>{error}</Text> : null}
    <View style={styles.tabShell}><ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroller} contentContainerStyle={[styles.tabs, { backgroundColor: theme.colors.tabTrack }]}>{tabs.map((item) => <Pressable key={item.value} style={[styles.tab, item.value === tab && styles.activeTab, { backgroundColor: item.value === tab ? theme.colors.surface : 'transparent' }]} onPress={() => setTab(item.value)}><Text numberOfLines={1} style={[styles.tabLabel, { color: item.value === tab ? theme.colors.primary : theme.colors.muted }]}>{item.label}</Text></Pressable>)}</ScrollView><View pointerEvents="none" style={styles.tabScrollHint}><Text style={styles.tabScrollHintText}>›</Text></View></View>
    {tab === 'timeline' && <><DayTabs days={days} selected={day} onChange={handleDayChange} /><Pressable style={styles.mapToggle} onPress={toggleMap} accessibilityRole="button" accessibilityState={{ expanded: isMapOpen }}><Text numberOfLines={1} style={styles.mapToggleText}>{isMapOpen ? '🗺️ 隱藏地圖' : '🗺️ 查看地圖路線 (點擊展開)'}</Text></Pressable>{isMapOpen && <View style={[styles.mapPane, { height: layout.mapMinHeight }]}>{isMapLoading ? <SkeletonCard variant="map" /> : <TripMap items={items} day={day} onMarkerPress={handleMapMarkerPress} />}</View>}<ScrollView ref={timelineScrollRef} style={styles.timelinePane} contentContainerStyle={[styles.paneContent, { paddingHorizontal: layout.panePadding, paddingTop: layout.panePadding }]}><Text style={[styles.paneTitle, { color: theme.colors.text }]}>Day {day} 行程</Text>{isDayTransitioning ? <View style={styles.skeletonStack}><SkeletonCard /><SkeletonCard /></View> : <ItineraryTimeline items={visibleItems} focusedItemId={focusedItemId} vouchers={vouchers} onPreviewVoucher={setPreviewVoucher} scheduleContext={{ tripStartDate: trip.start_date, dayNumber: day, defaultDepartureTime: trip.default_departure_time }} onEdit={(item) => { setEditingItem(item); setItemModal(true); }} onDelete={async (item) => { await deleteItineraryItem(item.id); await load(); }} onReorder={reorderItems} />}</ScrollView><Pressable style={[styles.fab, { right: layout.fabRight, bottom: layout.fabBottom + insets.bottom, paddingHorizontal: layout.fabPaddingHorizontal, paddingVertical: layout.fabPaddingVertical, maxWidth: layout.fabMaxWidth }]} onPress={() => { setEditingItem(null); setItemModal(true); }}><Text numberOfLines={1} style={[styles.buttonText, { fontSize: layout.fabFontSize }]}>＋ 新增景點／活動</Text></Pressable></>}
    {tab === 'expenses' && <ScrollView contentContainerStyle={styles.panel}><SettlementCard settlements={calculateBalances(expenses)} labelFor={(memberId) => members.find((member) => member.user_id === memberId)?.profile?.display_name || memberId.slice(0, 8)} /><ExpenseList expenses={expenses} members={members} onEdit={(expense) => { setEditingExpense(expense); setExpenseModal(true); }} onDelete={async (expense) => { await deleteExpense(expense.id); await load(); }} /><Pressable style={styles.primary} onPress={() => { setEditingExpense(null); setExpenseModal(true); }}><Text style={styles.buttonText}>＋ 新增旅費</Text></Pressable></ScrollView>}
    {tab === 'packing' && <View style={styles.panelContainer}><PackingPanel tripId={tripId} members={members} destination={trip.destination} tripStartDate={trip.start_date} items={items} /></View>}
    {tab === 'documents' && <View style={styles.panelContainer}><VouchersPanel tripId={tripId} userId={userId} items={items} /></View>}
    <ItineraryItemModal visible={itemModal} item={editingItem} day={day} tripStartDate={trip.start_date} tripEndDate={trip.end_date} tripId={tripId} userId={userId} onClose={() => setItemModal(false)} onSave={async (data) => { const saved = await saveItineraryItem(data); setItems((current) => current.some((entry) => entry.id === saved.id) ? current.map((entry) => entry.id === saved.id ? saved : entry) : [...current, saved]); setDay(saved.day_number); setItemModal(false); }} onDelete={editingItem ? async () => { await deleteItineraryItem(editingItem.id); await load(); } : undefined} />
    <ExpenseModal visible={expenseModal} tripId={tripId} expense={editingExpense} members={members} userId={userId} onClose={() => setExpenseModal(false)} onSave={async (expense, splits) => { await saveExpense(expense, splits); setExpenseModal(false); await load(); }} />
    <InviteTripModal visible={inviteVisible} inviteCode={trip.invite_code} onClose={() => setInviteVisible(false)} /><VoucherPreviewModal voucher={previewVoucher} onClose={() => setPreviewVoucher(null)} /><TripSettingsModal visible={settingsVisible} startDate={trip.start_date} endDate={trip.end_date} departureTime={trip.default_departure_time} onClose={() => setSettingsVisible(false)} onSave={async (changes) => { const updated = await updateTrip(trip.id, changes); setTrip(updated); setDay((current) => Math.min(current, tripDayNumbers(updated.start_date, updated.end_date).length)); }} />
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', paddingBottom: 22 }, center: { flex: 1, justifyContent: 'center', alignItems: 'center' }, loadingShell: { flex: 1, width: '100%', gap: 16, padding: 20 }, skeletonStack: { gap: 12 }, loadingText: { color: '#64748b', marginTop: 10 },
  header: { width: '100%', maxWidth: '100%', gap: 12, marginBottom: 14, flexShrink: 0 }, headerTitleRow: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minWidth: 0 }, titleCopy: { flex: 1, minWidth: 0 }, headerMascot: { flexShrink: 0 }, headerMetaRow: { width: '100%', flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, minWidth: 0 }, dateBlock: { flex: 1, minWidth: 120 }, back: { color: '#2563eb', fontWeight: '700', marginBottom: 9 }, title: { fontSize: 30, fontWeight: '800' }, destination: {}, headerMembers: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 }, avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#dbeafe', borderWidth: 2, alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#1d4ed8', fontWeight: '800' }, inviteButton: { marginLeft: 12, borderRadius: 13, backgroundColor: '#e0e7ff', paddingHorizontal: 12, paddingVertical: 9 }, inviteText: { color: '#3730a3', fontWeight: '700' }, settingsButton: { flexShrink: 0, borderRadius: 12, backgroundColor: '#e0e7ff', paddingHorizontal: 12, paddingVertical: 8 }, settingsText: { color: '#3730a3', fontWeight: '700' }, offlineBar: { width: '100%', minHeight: 32, justifyContent: 'center', borderRadius: 10, backgroundColor: '#fef3c7', paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8, overflow: 'hidden' }, offlineText: { color: '#92400e', fontSize: 12, fontWeight: '700' },
  tabShell: { width: '100%', minHeight: 44, height: 44, flexShrink: 0, position: 'relative', overflow: 'hidden', marginBottom: 7 }, tabScroller: { width: '100%', minHeight: 44, height: 44, flexGrow: 0, flexShrink: 0 }, tabs: { minWidth: '100%', minHeight: 44, height: 44, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 13, paddingVertical: 4, paddingRight: 4, paddingLeft: 12 }, tabScrollHint: { position: 'absolute', top: 0, right: 0, bottom: 0, width: 30, alignItems: 'flex-end', justifyContent: 'center', paddingRight: 5, backgroundColor: 'rgba(226, 232, 240, 0.92)' }, tabScrollHintText: { color: '#64748b', fontSize: 23, fontWeight: '900', lineHeight: 24 }, tab: { height: 36, flexGrow: 0, flexShrink: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10 }, tabLabel: { lineHeight: 20, textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false }, activeTab: {}, activeText: { fontWeight: '800' }, tabText: { fontWeight: '700' },
   mapToggle: { width: '100%', minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: '#e0e7ff', paddingHorizontal: 14, paddingVertical: 10, marginBottom: 10, overflow: 'hidden' }, mapToggleText: { color: '#3730a3', fontSize: 14, fontWeight: '800', textAlign: 'center' }, timelinePane: { flex: 1, width: '100%', minWidth: 0, borderRadius: 18, overflow: 'hidden' }, paneContent: { width: '100%', paddingBottom: 100, boxSizing: 'border-box' }, paneTitle: { fontSize: 18, fontWeight: '800' }, mapPane: { width: '100%', maxWidth: '100%', minWidth: 0, borderRadius: 18, overflow: 'hidden', marginBottom: 12 }, panelContainer: { flex: 1, minHeight: 0, width: '100%', overflow: 'hidden' }, panel: { width: '100%', paddingBottom: 100, paddingTop: 8, boxSizing: 'border-box' }, primary: { alignSelf: 'center', backgroundColor: '#2563eb', borderRadius: 13, paddingHorizontal: 20, paddingVertical: 13, marginTop: 18 }, fab: { position: 'absolute', zIndex: 20, elevation: 8, borderRadius: 24, backgroundColor: '#2563eb' }, buttonText: { color: 'white', fontWeight: '800' }, error: { color: '#b91c1c', marginBottom: 8 },
});

// Kept as a source-level compatibility marker for older layout checks:
// contentContainerStyle={styles.tabs}; onPress={() => setIsMapOpen((current) => !current)}
// ?儭??亦??啣?頝舐? (暺?撅?) / ?儭??梯??啣? / ? ?Ｙ?璅∪?嚗歇頛敹怠?銵?
