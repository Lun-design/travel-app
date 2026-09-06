import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { LayoutAnimation, Platform, Pressable, ScrollView, StyleSheet, Text, UIManager, useColorScheme, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getDefaultMapOpen, getTripDetailLayout } from '@/lib/trip-detail-layout';
import { getThemeForMode, type ThemeMode } from '@/lib/theme';
import { loadThemeMode, saveThemeMode } from '@/lib/theme-preference';
import { tripDayNumbers } from '@/lib/trip-dates';
import type { ItineraryItem } from '@/lib/itinerary';
import type { Voucher } from '@/lib/vouchers';
import { DayTabs } from '@/components/DayTabs';
import { ExpenseModal } from '@/components/ExpenseModal';
import { InviteTripModal } from '@/components/InviteTripModal';
import { ItineraryItemModal } from '@/components/ItineraryItemModal';
import { OfflineSyncBanner } from '@/components/OfflineSyncBanner';
import { PackingPanel } from '@/components/PackingPanel';
import { SkeletonCard } from '@/components/SkeletonCard';
import { TimelinePanel } from '@/components/trip-detail/TimelinePanel';
import { TripDetailHeader } from '@/components/trip-detail/TripDetailHeader';
import { TripDetailTabs, type TripDetailTab } from '@/components/trip-detail/TripDetailTabs';
import { ExpensesPanel } from '@/components/trip-detail/ExpensesPanel';
import { VoucherPreviewModal } from '@/components/VoucherPreviewModal';
import { VouchersPanel } from '@/components/VouchersPanel';
import { TripSettingsModal } from '@/components/TripSettingsModal';
import { UserProfileModal } from '@/components/UserProfileModal';
import { useTripDetailData } from '@/hooks/useTripDetailData';
import { ActiveTripContext } from '@/contexts/ActiveTripContext';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const tripId = Array.isArray(id) ? id[0] : id;
  const insets = useSafeAreaInsets();
  const systemScheme = useColorScheme();
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const theme = getThemeForMode(themeMode, systemScheme);
  const layout = getTripDetailLayout(width);
  const headerMascotSize = width >= 1100 ? 150 : width >= 800 ? 125 : width >= 600 ? 96 : 72;
  const data = useTripDetailData(tripId);
  const [day, setDay] = useState(1);
  const [tab, setTab] = useState<TripDetailTab>('timeline');
  const [isMapOpen, setIsMapOpen] = useState(() => getDefaultMapOpen(width));
  const [isMapLoading, setIsMapLoading] = useState(false);
  const [isDayTransitioning, setIsDayTransitioning] = useState(false);
  const [focusedItemId, setFocusedItemId] = useState<string | null>(null);
  const [previewVoucher, setPreviewVoucher] = useState<Voucher | null>(null);
  const [itemModal, setItemModal] = useState(false);
  const [expenseModal, setExpenseModal] = useState(false);
  const [editingItem, setEditingItem] = useState<ItineraryItem | null>(null);
  const [editingExpense, setEditingExpense] = useState<any>(null);
  const [inviteVisible, setInviteVisible] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const timelineScrollRef = useRef<ScrollView>(null);
  const days = useMemo(() => data.trip ? tripDayNumbers(data.trip.start_date, data.trip.end_date) : [1], [data.trip]);
  const visibleItems = useMemo(() => data.items.filter((item) => item.day_number === day).sort((left, right) => left.position - right.position), [data.items, day]);

  useEffect(() => { void loadThemeMode().then(setThemeMode); }, []);
  useEffect(() => { if (Platform.OS === 'android') UIManager.setLayoutAnimationEnabledExperimental?.(true); }, []);
  useEffect(() => { if (!isDayTransitioning) return; const timer = setTimeout(() => setIsDayTransitioning(false), 180); return () => clearTimeout(timer); }, [isDayTransitioning]);
  useEffect(() => { if (!isMapOpen) { setIsMapLoading(false); return; } const timer = setTimeout(() => setIsMapLoading(false), 220); return () => clearTimeout(timer); }, [isMapOpen]);

  function animateLayout() { LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut); }
  function handleDayChange(nextDay: number) { if (nextDay === day) return; animateLayout(); setDay(nextDay); setFocusedItemId(null); setIsDayTransitioning(true); }
  function toggleMap() { animateLayout(); setIsMapLoading(true); setIsMapOpen((current) => !current); }
  function changeThemeMode(mode: ThemeMode) { setThemeMode(mode); void saveThemeMode(mode); }
  function handleMapMarkerPress(itemId: string) {
    setFocusedItemId(itemId);
    const index = visibleItems.findIndex((item) => item.id === itemId);
    if (index < 0) return;
    if (Platform.OS === 'web' && typeof document !== 'undefined') { document.getElementById(`itinerary-item-${itemId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    timelineScrollRef.current?.scrollTo({ y: index * 160, animated: true });
  }
  async function saveItem(input: Parameters<typeof data.saveItem>[0]) {
    const saved = await data.saveItem(input);
    data.setItems((current) => current.some((entry) => entry.id === saved.id) ? current.map((entry) => entry.id === saved.id ? saved : entry) : [...current, saved]);
    setDay(saved.day_number);
    setItemModal(false);
    await data.reload();
  }
  async function deleteItem(item: ItineraryItem) { await data.removeItem(item.id); await data.reload(); }
  async function saveExpense(input: Parameters<typeof data.saveExpenseRecord>[0], splits: Parameters<typeof data.saveExpenseRecord>[1]) { await data.saveExpenseRecord(input, splits); setExpenseModal(false); await data.reload(); }
  async function deleteExpense(expense: any) { await data.removeExpense(expense.id); await data.reload(); }

  if (data.loading) return <View style={[styles.loadingShell, { backgroundColor: theme.colors.background }]}><SkeletonCard variant="header" /><SkeletonCard /><SkeletonCard /></View>;
  if (!data.trip) return <View style={styles.center}><Text style={styles.error}>{data.error || '找不到此行程。'}</Text></View>;
  const trip = data.trip;
  const MainScroll = tab === 'timeline' ? ScrollView : View;

  return <ActiveTripContext.Provider value={trip.id}><View style={[styles.container, { backgroundColor: theme.colors.background, paddingHorizontal: layout.screenPaddingHorizontal, paddingTop: layout.screenPaddingTop, paddingBottom: 22 + insets.bottom }]}>
    <MainScroll style={styles.mainScroll} {...(tab === 'timeline' ? { contentContainerStyle: styles.mainContent, keyboardShouldPersistTaps: 'handled' as const } : {})}>
    <TripDetailHeader trip={trip} members={data.members} userId={data.userId} profile={data.profile} theme={theme} themeMode={themeMode} mascotSize={headerMascotSize} insets={insets} onBack={() => router.canGoBack() ? router.back() : router.replace('/')} onInvite={() => setInviteVisible(true)} onThemeModeChange={changeThemeMode} onSettings={() => setSettingsVisible(true)} onProfile={() => setProfileVisible(true)} compact={layout.compact} />
     {data.isOffline ? <View style={[styles.offlineBar, { backgroundColor: theme.colors.warningSurface, borderColor: theme.colors.border }]}><Text style={[styles.offlineText, { color: theme.colors.warningText }]}>📡 離線模式：已載入快取行程</Text></View> : null}
    <OfflineSyncBanner isOffline={data.isOffline} pendingCount={data.pendingSyncCount} conflicts={data.syncConflicts} onResolve={(id, resolution) => { void data.resolveConflict(id, resolution); }} />
    {data.error ? <Text style={styles.error}>{data.error}</Text> : null}
    <TripDetailTabs value={tab} onChange={setTab} theme={theme} />
    {tab === 'timeline' && <TimelinePanel trip={trip} day={day} days={days} items={data.items} visibleItems={visibleItems} themeMode={themeMode} layout={layout} insets={insets} isMapOpen={isMapOpen} isMapLoading={isMapLoading} isDayTransitioning={isDayTransitioning} focusedItemId={focusedItemId} vouchers={data.vouchers} timelineScrollRef={timelineScrollRef} onDayChange={handleDayChange} onToggleMap={toggleMap} onMapMarkerPress={handleMapMarkerPress} onFocusedVoucher={setPreviewVoucher} onEdit={(item) => { setEditingItem(item); setItemModal(true); }} onDelete={deleteItem} onReorder={data.reorderItems} onAdd={() => { setEditingItem(null); setItemModal(true); }} />}
    {tab === 'expenses' && <ExpensesPanel themeMode={themeMode} expenses={data.expenses} members={data.members} rates={data.rateSnapshot.rates} rateLabel={`匯率來源：${data.rateSnapshot.source}${data.rateSnapshot.updatedAt ? ` · ${new Date(data.rateSnapshot.updatedAt).toLocaleString()}` : ''}`} onEdit={(expense) => { setEditingExpense(expense); setExpenseModal(true); }} onDelete={deleteExpense} onAdd={() => { setEditingExpense(null); setExpenseModal(true); }} />}
    {tab === 'packing' && <View style={styles.panelContainer}><ScrollView style={styles.panelScroll} contentContainerStyle={styles.panelScrollContent}><PackingPanel themeMode={themeMode} tripId={tripId!} userId={data.userId} members={data.members} destination={trip.destination} tripStartDate={trip.start_date} items={data.items} /></ScrollView></View>}
    {tab === 'documents' && <View style={styles.panelContainer}><VouchersPanel themeMode={themeMode} tripId={tripId!} userId={data.userId} items={data.items} /></View>}
    </MainScroll>
    {tab === 'timeline' && <Pressable accessibilityRole="button" style={[styles.addSpot, { right: layout.fabRight, bottom: layout.fabBottom + insets.bottom, paddingHorizontal: layout.fabPaddingHorizontal, paddingVertical: layout.fabPaddingVertical, maxWidth: layout.fabMaxWidth, backgroundColor: theme.colors.primary }]} onPress={() => { setEditingItem(null); setItemModal(true); }}><Text numberOfLines={1} style={{ color: '#ffffff', fontWeight: '800', fontSize: layout.fabFontSize }}>＋ 新增景點／活動</Text></Pressable>}
    <ItineraryItemModal visible={itemModal} item={editingItem} day={day} tripStartDate={trip.start_date} tripEndDate={trip.end_date} tripId={tripId!} userId={data.userId} onClose={() => setItemModal(false)} onSave={saveItem} onDelete={editingItem ? async () => { await data.removeItem(editingItem.id); await data.reload(); } : undefined} />
    <ExpenseModal themeMode={themeMode} rateSnapshot={data.rateSnapshot} onLockRate={data.lockRate} visible={expenseModal} tripId={tripId!} expense={editingExpense} members={data.members} userId={data.userId} onClose={() => setExpenseModal(false)} onSave={saveExpense} />
    <InviteTripModal visible={inviteVisible} inviteCode={trip.invite_code} onClose={() => setInviteVisible(false)} />
    <VoucherPreviewModal voucher={previewVoucher} onClose={() => setPreviewVoucher(null)} />
    <TripSettingsModal visible={settingsVisible} startDate={trip.start_date} endDate={trip.end_date} departureTime={trip.default_departure_time} timezone={trip.timezone} themeMode={themeMode} onThemeModeChange={changeThemeMode} onClose={() => setSettingsVisible(false)} onSave={async (changes) => { const updated = await data.saveTripSettings(changes); setDay((current) => Math.min(current, tripDayNumbers(updated.start_date, updated.end_date).length)); }} />
    <UserProfileModal visible={profileVisible} profile={data.profile} themeMode={themeMode} onClose={() => setProfileVisible(false)} onSaved={(updated) => { data.setProfile(updated); data.setMembers((current) => current.map((member) => member.user_id === updated.id ? { ...member, profile: { ...member.profile, display_name: updated.display_name, full_name: updated.full_name, email: updated.email, avatar_url: updated.avatar_url } } : member)); }} />
  </View></ActiveTripContext.Provider>;
}

const styles = StyleSheet.create({
  addSpot: { position: 'absolute', zIndex: 1000, minHeight: 44, justifyContent: 'center', borderRadius: 12 },
  mainScroll: { flex: 1, minHeight: 0, width: '100%' },
  mainContent: { width: '100%', flexGrow: 1, paddingBottom: 100 },
  container: { flex: 1, width: '100%', maxWidth: '100%', overflow: 'hidden', boxSizing: 'border-box', paddingBottom: 22 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingShell: { flex: 1, width: '100%', gap: 16, padding: 20 },
  panelContainer: { flex: 1, minHeight: 0, width: '100%', overflow: 'hidden' },
  panelScroll: { flex: 1, width: '100%', minHeight: 0 },
  panelScrollContent: { width: '100%', minHeight: '100%', paddingBottom: 100, boxSizing: 'border-box' },
  offlineBar: { width: '100%', minHeight: 32, justifyContent: 'center', borderRadius: 10, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 8, overflow: 'hidden' },
  offlineText: { fontSize: 12, fontWeight: '700' },
  error: { color: '#944B3C', marginBottom: 8 },
});
