import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getTrip, listTripMembers, updateTrip, type Trip, type TripMemberWithProfile } from '@/lib/trips';
import { filterAndSortItems, type ItineraryItem } from '@/lib/itinerary';
import { tripDayNumbers } from '@/lib/trip-dates';
import { deleteItineraryItem, listItineraryItems, saveItineraryItem, updateItineraryItemsOrder } from '@/lib/itinerary-api';
import { calculateBalances, deleteExpense, listExpenses, saveExpense, type Expense } from '@/lib/expenses-api';
import { listVouchers } from '@/lib/vouchers-api'; import type { Voucher } from '@/lib/vouchers';
import { getTripDetailLayout } from '@/lib/trip-detail-layout';
import { DayTabs } from '@/components/DayTabs'; import { TripMap } from '@/components/TripMap'; import { ItineraryTimeline } from '@/components/ItineraryTimeline'; import { ItineraryItemModal } from '@/components/ItineraryItemModal'; import { InviteTripModal } from '@/components/InviteTripModal'; import { ExpenseList } from '@/components/ExpenseList'; import { ExpenseModal } from '@/components/ExpenseModal'; import { SettlementCard } from '@/components/SettlementCard'; import { PackingPanel } from '@/components/PackingPanel'; import { VouchersPanel } from '@/components/VouchersPanel'; import { VoucherPreviewModal } from '@/components/VoucherPreviewModal'; import { TripSettingsModal } from '@/components/TripSettingsModal';
import { PuppyMascot } from '@/components/PuppyMascot';

type Tab = 'timeline' | 'expenses' | 'packing' | 'documents';
const tabs: { value: Tab; label: string }[] = [{ value: 'timeline', label: '行程時間軸' }, { value: 'expenses', label: '💰 旅費分帳' }, { value: 'packing', label: '🧳 打包清單' }, { value: 'documents', label: '🎫 預約與票券' }];

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(); const router = useRouter(); const { width } = useWindowDimensions(); const tripId = Array.isArray(id) ? id[0] : id;
  const layout = getTripDetailLayout(width);
  const headerMascotSize = width >= 1100 ? 150 : width >= 800 ? 125 : width >= 600 ? 96 : 72;
  const [trip, setTrip] = useState<Trip | null>(null); const [members, setMembers] = useState<TripMemberWithProfile[]>([]); const [items, setItems] = useState<ItineraryItem[]>([]); const [expenses, setExpenses] = useState<Expense[]>([]); const [vouchers, setVouchers] = useState<Voucher[]>([]); const [previewVoucher, setPreviewVoucher] = useState<Voucher | null>(null); const [userId, setUserId] = useState(''); const [day, setDay] = useState(1); const [tab, setTab] = useState<Tab>('timeline'); const [loading, setLoading] = useState(true); const [error, setError] = useState(''); const [itemModal, setItemModal] = useState(false); const [expenseModal, setExpenseModal] = useState(false); const [editingItem, setEditingItem] = useState<ItineraryItem | null>(null); const [editingExpense, setEditingExpense] = useState<Expense | null>(null); const [inviteVisible, setInviteVisible] = useState(false); const [settingsVisible, setSettingsVisible] = useState(false);
  const days = useMemo(() => trip ? tripDayNumbers(trip.start_date, trip.end_date) : [1], [trip]);
  const memberName = (memberId: string) => members.find((member) => member.user_id === memberId)?.profile?.display_name || memberId.slice(0, 8);
  async function reorderItems(order: { id: string; position: number }[]) { const previous = items; const positions = new Map(order.map((entry) => [entry.id, entry.position])); setItems((current) => current.map((item) => positions.has(item.id) ? { ...item, position: positions.get(item.id)! } : item)); try { await updateItineraryItemsOrder(order); } catch (cause) { setItems(previous); throw cause; } }
  async function load() { if (!tripId) return; setLoading(true); setError(''); try { const [{ data: auth }, tripData, memberData, itemData, expenseData, voucherData] = await Promise.all([supabase.auth.getUser(), getTrip(tripId), listTripMembers(tripId), listItineraryItems(tripId), listExpenses(tripId), listVouchers(tripId)]); setUserId(auth.user?.id ?? ''); setTrip(tripData); setMembers(memberData); setItems(itemData); setExpenses(expenseData); setVouchers(voucherData); } catch (cause: any) { console.error('[TripDetail] load failed', cause); setError(cause?.message ?? '無法載入行程資料。'); } finally { setLoading(false); } }
  useEffect(() => { void load(); }, [tripId]);
  if (loading) return <View style={styles.center}><PuppyMascot puppy="-5" size={72} accessibilityLabel="載入中" /><Text style={styles.loadingText}>載入行程中…</Text></View>;
  if (!trip) return <View style={styles.center}><Text style={styles.error}>{error || '找不到此行程。'}</Text></View>;
  const visibleItems = filterAndSortItems(items, day);
  return <View style={[styles.container, { paddingHorizontal: layout.screenPaddingHorizontal, paddingTop: layout.screenPaddingTop }]}>
    <View style={styles.header}><View style={styles.headerMain}><Pressable onPress={() => router.canGoBack() ? router.back() : router.replace('/')}><Text style={styles.back}>‹ 返回我的行程</Text></Pressable><Text style={styles.title}>{trip.title}</Text><Text style={styles.destination}>{trip.destination} · {trip.start_date} ～ {trip.end_date}</Text></View><View style={styles.headerAside}><PuppyMascot puppy="-11" size={headerMascotSize} accessibilityLabel="旅伴一起出發" /><View style={styles.headerMembers}>{members.slice(0, 4).map((member, index) => <View key={member.user_id} style={[styles.avatar, { marginLeft: index ? -9 : 0 }]}><Text style={styles.avatarText}>{(member.profile?.display_name || member.user_id)[0].toUpperCase()}</Text></View>)}<Pressable style={styles.inviteButton} onPress={() => setInviteVisible(true)}><Text style={styles.inviteText}>＋ 邀請</Text></Pressable></View></View></View>
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {trip.created_by === userId ? <Pressable style={styles.settingsButton} onPress={() => setSettingsVisible(true)}><Text style={styles.settingsText}>⚙️ 行程設定</Text></Pressable> : null}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroller} contentContainerStyle={styles.tabs}>{tabs.map((item) => <Pressable key={item.value} style={[styles.tab, tab === item.value && styles.activeTab]} onPress={() => setTab(item.value)}><Text numberOfLines={1} style={[styles.tabLabel, tab === item.value ? styles.activeText : styles.tabText]}>{item.label}</Text></Pressable>)}</ScrollView>
    {tab === 'timeline' && <><DayTabs days={days} selected={day} onChange={setDay} /><View style={[styles.columns, width >= 800 && styles.columnsWide]}><ScrollView style={styles.timelinePane} contentContainerStyle={[styles.paneContent, { paddingHorizontal: layout.panePadding, paddingTop: layout.panePadding }]}><Text style={styles.paneTitle}>Day {day} 行程</Text><ItineraryTimeline items={visibleItems} vouchers={vouchers} onPreviewVoucher={setPreviewVoucher} scheduleContext={{ tripStartDate: trip.start_date, dayNumber: day, defaultDepartureTime: trip.default_departure_time }} onEdit={(item) => { setEditingItem(item); setItemModal(true); }} onDelete={async (item) => { await deleteItineraryItem(item.id); await load(); }} onReorder={reorderItems} /></ScrollView><View style={[styles.mapPane, { minHeight: layout.mapMinHeight }]}><TripMap items={items} day={day} /></View></View><Pressable style={[styles.fab, { right: layout.fabRight, bottom: layout.fabBottom, paddingHorizontal: layout.fabPaddingHorizontal, paddingVertical: layout.fabPaddingVertical, maxWidth: layout.fabMaxWidth }]} onPress={() => { setEditingItem(null); setItemModal(true); }}><Text numberOfLines={1} style={[styles.buttonText, { fontSize: layout.fabFontSize }]}>＋ 新增景點／活動</Text></Pressable></>}
    {tab === 'expenses' && <ScrollView contentContainerStyle={styles.panel}><SettlementCard settlements={calculateBalances(expenses)} labelFor={memberName} /><ExpenseList expenses={expenses} members={members} onEdit={(expense) => { setEditingExpense(expense); setExpenseModal(true); }} onDelete={async (expense) => { await deleteExpense(expense.id); await load(); }} /><Pressable style={styles.primary} onPress={() => { setEditingExpense(null); setExpenseModal(true); }}><Text style={styles.buttonText}>＋ 新增旅費</Text></Pressable></ScrollView>}
    {tab === 'packing' && <PackingPanel tripId={tripId} members={members} destination={trip.destination} tripStartDate={trip.start_date} items={items} />}
    {tab === 'documents' && <VouchersPanel tripId={tripId} userId={userId} items={items} />}
    <ItineraryItemModal visible={itemModal} item={editingItem} day={day} tripStartDate={trip.start_date} tripEndDate={trip.end_date} tripId={tripId} userId={userId} onClose={() => setItemModal(false)} onSave={async (data) => {
      const saved = await saveItineraryItem(data);
      setItems((current) => {
        const existingIndex = current.findIndex((entry) => entry.id === saved.id);
        if (existingIndex === -1) return [...current, saved];
        return current.map((entry) => entry.id === saved.id ? saved : entry);
      });
      setDay(saved.day_number);
      setItemModal(false);
    }} onDelete={editingItem ? async () => { await deleteItineraryItem(editingItem.id); await load(); } : undefined} />
    <ExpenseModal visible={expenseModal} tripId={tripId} expense={editingExpense} members={members} userId={userId} onClose={() => setExpenseModal(false)} onSave={async (expense, splits) => { await saveExpense(expense, splits); setExpenseModal(false); await load(); }} />
    <InviteTripModal visible={inviteVisible} inviteCode={trip.invite_code} onClose={() => setInviteVisible(false)} />
    <VoucherPreviewModal voucher={previewVoucher} onClose={() => setPreviewVoucher(null)} />
    <TripSettingsModal visible={settingsVisible} startDate={trip.start_date} endDate={trip.end_date} departureTime={trip.default_departure_time} onClose={() => setSettingsVisible(false)} onSave={async (changes) => { const updated = await updateTrip(trip.id, changes); setTrip(updated); setDay((current) => Math.min(current, tripDayNumbers(updated.start_date, updated.end_date).length)); }} />
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', backgroundColor: '#f8fafc', paddingBottom: 22 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { color: '#64748b', marginTop: 10 },
  header: { width: '100%', maxWidth: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 14 },
  headerMain: { flex: 1, minWidth: 0 },
  headerAside: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, flexShrink: 1 },
  back: { color: '#2563eb', fontWeight: '700', marginBottom: 9 },
  title: { fontSize: 30, fontWeight: '800', color: '#0f172a' },
  destination: { color: '#64748b' },
  headerMembers: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  avatar: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#dbeafe', borderWidth: 2, borderColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#1d4ed8', fontWeight: '800' },
  inviteButton: { marginLeft: 12, borderRadius: 13, backgroundColor: '#e0e7ff', paddingHorizontal: 12, paddingVertical: 9 },
  inviteText: { color: '#3730a3', fontWeight: '700' },
  settingsButton: { alignSelf: 'flex-start', marginBottom: 8, borderRadius: 12, backgroundColor: '#e0e7ff', paddingHorizontal: 12, paddingVertical: 8 },
  settingsText: { color: '#3730a3', fontWeight: '700' },
  tabScroller: { width: '100%', maxWidth: '100%', height: 52, maxHeight: 52, flexGrow: 0, marginBottom: 7 },
  tabs: { minWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#e2e8f0', borderRadius: 13, paddingVertical: 4, paddingRight: 4, paddingLeft: 12 },
  tab: { height: 44, flexGrow: 0, flexShrink: 0, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14, borderRadius: 10 },
  tabLabel: { lineHeight: 20, textAlign: 'center', textAlignVertical: 'center', includeFontPadding: false },
  activeTab: { backgroundColor: 'white' },
  tabText: { color: '#64748b', fontWeight: '700' },
  activeText: { color: '#1d4ed8', fontWeight: '800' },
  columns: { flex: 1, width: '100%', maxWidth: '100%', minWidth: 0, gap: 14, overflow: 'hidden' },
  columnsWide: { flexDirection: 'row' },
  timelinePane: { flex: 1, width: '100%', maxWidth: '100%', minWidth: 0, backgroundColor: 'white', borderRadius: 18, overflow: 'hidden' },
  paneContent: { width: '100%', maxWidth: '100%', boxSizing: 'border-box', paddingBottom: 100 },
  paneTitle: { fontSize: 18, fontWeight: '800' },
  mapPane: { flex: 1, width: '100%', maxWidth: '100%', minWidth: 0, borderRadius: 18, overflow: 'hidden' },
  panel: { width: '100%', maxWidth: '100%', boxSizing: 'border-box', paddingBottom: 100, paddingTop: 8 },
  primary: { alignSelf: 'center', backgroundColor: '#2563eb', borderRadius: 13, paddingHorizontal: 20, paddingVertical: 13, marginTop: 18 },
  fab: { position: 'absolute', zIndex: 20, elevation: 8, borderRadius: 24, backgroundColor: '#2563eb' },
  buttonText: { color: 'white', fontWeight: '800' },
  error: { color: '#b91c1c', marginBottom: 8 },
});
