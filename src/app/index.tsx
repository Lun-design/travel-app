import { Link, useRouter } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { createTrip, deleteTrip, leaveTrip, listTripsWithMembers, updateTrip, type Trip, type TripMemberWithProfile } from '@/lib/trips';
import { tripManagementAction } from '@/lib/trip-list';
import { CreateTripModal } from '@/components/CreateTripModal';
import { InviteTripModal } from '@/components/InviteTripModal';
import { PuppyMascot } from '@/components/PuppyMascot';
import { clearOfflineCache } from '@/lib/offline-cache';
import { getCurrentProfile, type Profile } from '@/lib/profiles';
import { EDITORIAL_COLORS } from '@/lib/theme';
import { ProfileAvatar } from '@/components/ProfileAvatar';
import { UserProfileModal } from '@/components/UserProfileModal';
import { cloneTripById } from '@/lib/trip-cloning';

const HOME_AVATAR_LIMIT = 4;
const TRIP_COVER_URL = 'https://images.unsplash.com/photo-1500534623283-312aade485b7?w=1200';

function daysUntil(date: string) {
  const diff = Math.ceil((new Date(`${date}T00:00:00`).getTime() - Date.now()) / 86400000);
  return diff > 0 ? `離出發還有 ${diff} 天` : diff === 0 ? '今天出發' : '旅程進行中';
}

export default function HomeScreen() {
  const router = useRouter();
  const [trips, setTrips] = useState<Trip[]>([]);
  const [members, setMembers] = useState<Record<string, TripMemberWithProfile[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createVisible, setCreateVisible] = useState(false);
  const [editingTrip, setEditingTrip] = useState<Trip | null>(null);
  const [joinVisible, setJoinVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const [userId, setUserId] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const [cloningTripId, setCloningTripId] = useState<string | null>(null);
  const [tripActionBusyId, setTripActionBusyId] = useState<string | null>(null);
  const [cloneError, setCloneError] = useState('');
  const [tripActionError, setTripActionError] = useState('');
  const actionGuard = useRef(new Set<string>());

  async function load() {
    setLoading(true);
    setError('');
    try {
      const aggregated = await listTripsWithMembers();
      const auth = await supabase.auth.getSession().then(({ data }) => data.session?.user ?? null).catch(() => null);
      const profileData = await getCurrentProfile().catch(() => null);
      setUserId(auth?.id ?? '');
      setProfile(profileData);
      setTrips(aggregated.map(({ trip }) => trip));
      setMembers(Object.fromEntries(aggregated.map(({ trip, members: tripMembers }) => [trip.id, tripMembers])));
    } catch (cause) {
      console.error('[HomeScreen] list trips failed', cause);
      setError(cause instanceof Error ? cause.message : '無法載入行程。');
    } finally {
      setLoading(false);
    }
  }

  async function signOut() {
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) throw signOutError;
      await clearOfflineCache();
    } catch (cause) {
      Alert.alert('登出失敗', cause instanceof Error ? cause.message : '請稍後再試。');
    }
  }

  async function handleClone(tripId: string) {
    if (cloningTripId) return;
    setCloningTripId(tripId);
    setCloneError('');
    try {
      const newTripId = await cloneTripById(tripId);
      router.push(`/trips/${newTripId}`);
    } catch (cause) {
      setCloneError(cause instanceof Error ? cause.message : '目前無法複製這份行程。');
    } finally {
      setCloningTripId(null);
    }
  }

  async function performTripAction(trip: Trip, action: 'delete' | 'leave') {
    try {
      if (action === 'delete') await deleteTrip(trip.id);
      else await leaveTrip(trip.id);
      setTrips((current) => current.filter((item) => item.id !== trip.id));
      setMembers((current) => {
        const next = { ...current };
        delete next[trip.id];
        return next;
      });
      setTripActionError('');
    } catch (cause) {
      setTripActionError(cause instanceof Error ? cause.message : '行程操作失敗，請稍後再試。');
    } finally {
      actionGuard.current.delete(trip.id);
      setTripActionBusyId(null);
    }
  }

  function confirmTripAction(trip: Trip) {
    if (actionGuard.current.has(trip.id)) return;
    const membership = members[trip.id]?.find((member) => member.user_id === userId);
    const action = tripManagementAction(membership?.role);
    if (!action) {
      Alert.alert('無法管理行程', '找不到你的行程成員權限，請重新整理後再試。');
      return;
    }

    actionGuard.current.add(trip.id);
    setTripActionBusyId(trip.id);
    const deleting = action === 'delete';
    let actionConfirmed = false;
    Alert.alert(
      deleting ? '刪除行程' : '退出行程',
      deleting ? `確定永久刪除「${trip.title}」及其所有行程資料嗎？` : `確定退出「${trip.title}」嗎？`,
      [
        { text: '取消', style: 'cancel', onPress: () => { actionGuard.current.delete(trip.id); setTripActionBusyId(null); } },
        { text: deleting ? '刪除' : '退出', style: 'destructive', onPress: () => { actionConfirmed = true; void performTripAction(trip, action); } },
      ],
      { cancelable: true, onDismiss: () => { if (!actionConfirmed) { actionGuard.current.delete(trip.id); setTripActionBusyId(null); } } },
    );
  }

  useEffect(() => { void load(); }, []);

  if (loading) return <View style={styles.center}><PuppyMascot puppy="-5" size={72} accessibilityLabel="載入中" /><Text style={styles.loadingText}>載入行程中…</Text></View>;

  return <View style={styles.container}>
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <View style={styles.brand}><PuppyMascot puppy="-1" size={60} accessibilityLabel="出遊由起來" /><View><Text style={styles.eyebrow}>TRAVEL PLANNER</Text><Text style={styles.title}>我的行程</Text></View></View>
        <Pressable accessibilityRole="button" accessibilityLabel="建立行程" style={styles.primary} onPress={() => setCreateVisible(true)}><Text style={styles.white}>＋ 建立行程</Text></Pressable>
      </View>
      <View style={styles.utilityActions}>
        <Pressable style={styles.utilityButton} onPress={() => setJoinVisible(true)}><Text style={styles.link}>加入行程</Text></Pressable>
        <Pressable style={styles.profileButton} onPress={() => setProfileVisible(true)} accessibilityRole="button" accessibilityLabel="編輯個人檔案"><ProfileAvatar profile={profile} userId={userId} size={36} /></Pressable>
        <Pressable style={styles.utilityButton} onPress={() => void signOut()}><Text style={styles.link}>登出</Text></Pressable>
      </View>
    </View>

    {error ? <Text style={styles.error}>{error}</Text> : null}
    {cloneError ? <Text style={styles.error}>{cloneError}</Text> : null}
    {tripActionError ? <Text style={styles.error}>{tripActionError}</Text> : null}

    {!error && trips.length === 0 ? <View style={styles.empty}>
      <Text style={styles.emptyTitle}>準備好下一趟旅程了嗎？</Text>
      <Text style={styles.muted}>建立行程，和旅伴一起開始規劃。</Text>
      <Pressable style={styles.primary} onPress={() => setCreateVisible(true)}><Text style={styles.white}>＋ 建立行程</Text></Pressable>
    </View> : <FlatList
      contentContainerStyle={styles.list}
      data={trips}
      keyExtractor={(trip) => trip.id}
      renderItem={({ item }) => {
        const membership = members[item.id]?.find((member) => member.user_id === userId);
        const action = tripManagementAction(membership?.role);
        const isActionBusy = tripActionBusyId === item.id;
        return <View style={styles.cardWrap}>
          <Link href={`/trips/${item.id}`} asChild>
            <Pressable style={styles.card}>
              <ImageBackground source={{ uri: TRIP_COVER_URL }} imageStyle={styles.coverImage} style={styles.cover}>
                <View style={styles.overlay}>
                  <Text style={styles.countdown}>{daysUntil(item.start_date)}</Text>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardDestination}>{item.destination}</Text>
                </View>
              </ImageBackground>
              <View style={styles.cardInfo}>
                <Text style={styles.date}>{item.start_date} ～ {item.end_date}</Text>
                <View style={styles.avatarGroup}>{(members[item.id] ?? []).slice(0, HOME_AVATAR_LIMIT).map((member, index) => <View key={member.user_id} style={[styles.avatar, { marginLeft: index ? -9 : 0 }]}><ProfileAvatar profile={member.profile} userId={member.user_id} size={30} /></View>)}<Text style={styles.memberCount}>{members[item.id]?.length ?? 0} 位旅伴</Text></View>
              </View>
            </Pressable>
          </Link>
          <View style={styles.cardActions}>
            <Pressable style={styles.cloneButton} onPress={() => void handleClone(item.id)} disabled={cloningTripId !== null || isActionBusy}><Text style={styles.cloneButtonText}>{cloningTripId === item.id ? '正在複製…' : '📋 複製行程'}</Text></Pressable>
            {membership?.role === 'owner' ? <Pressable style={styles.actionButton} onPress={() => setEditingTrip(item)} disabled={isActionBusy}><Text style={styles.actionText}>編輯行程</Text></Pressable> : null}
            {action ? <Pressable accessibilityRole="button" accessibilityLabel={action === 'delete' ? '刪除行程' : '退出行程'} style={[styles.actionButton, styles.dangerButton]} onPress={() => confirmTripAction(item)} disabled={isActionBusy}><Text style={styles.dangerText}>{isActionBusy ? '處理中…' : action === 'delete' ? '刪除行程' : '退出行程'}</Text></Pressable> : null}
          </View>
        </View>;
      }}
      ListFooterComponent={<Pressable accessibilityRole="button" accessibilityLabel="新增另一個行程" style={styles.secondary} onPress={() => setCreateVisible(true)}><Text style={styles.secondaryText}>＋ 新增另一個行程</Text></Pressable>}
    />}

    {!error ? <>
      <CreateTripModal visible={createVisible} userId={userId} onClose={() => setCreateVisible(false)} onCreate={async (input) => { await createTrip(input); setCreateVisible(false); await load(); }} />
      <CreateTripModal visible={editingTrip !== null} userId={userId} initialTrip={editingTrip} onClose={() => setEditingTrip(null)} onUpdate={async (tripId, changes) => { const updated = await updateTrip(tripId, changes); setTrips((current) => current.map((trip) => trip.id === tripId ? updated : trip)); setEditingTrip(null); }} />
    </> : null}
    <InviteTripModal visible={joinVisible} onClose={() => setJoinVisible(false)} onJoined={(id) => router.push(`/trips/${id}`)} />
    <UserProfileModal visible={profileVisible} profile={profile} onClose={() => setProfileVisible(false)} onSaved={(updated) => { setProfile(updated); setMembers((current) => Object.fromEntries(Object.entries(current).map(([tripId, tripMembers]) => [tripId, tripMembers.map((member) => member.user_id === updated.id ? { ...member, profile: { ...member.profile, display_name: updated.display_name, full_name: updated.full_name, email: updated.email, avatar_url: updated.avatar_url } } : member)]))); }} />
  </View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: EDITORIAL_COLORS.oat, paddingHorizontal: 22, paddingTop: 28 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: EDITORIAL_COLORS.oat },
  loadingText: { color: EDITORIAL_COLORS.taupe, marginTop: 10 },
  header: { marginBottom: 18, gap: 10 },
  headerTop: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  eyebrow: { fontSize: 11, letterSpacing: 2, color: EDITORIAL_COLORS.taupe, fontWeight: '700' },
  title: { fontSize: 29, color: EDITORIAL_COLORS.charcoal, fontWeight: '800', marginTop: 3, letterSpacing: -0.4 },
  primary: { backgroundColor: EDITORIAL_COLORS.terracotta, borderRadius: 12, minHeight: 48, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 11 },
  utilityActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 12 },
  utilityButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  link: { color: EDITORIAL_COLORS.terracotta, fontWeight: '700' },
  profileButton: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  list: { gap: 16, paddingBottom: 32 },
  cardWrap: { gap: 8 },
  card: { borderRadius: 14, backgroundColor: EDITORIAL_COLORS.paper, overflow: 'hidden', borderWidth: 1, borderColor: EDITORIAL_COLORS.line },
  cover: { height: 132, justifyContent: 'flex-end' },
  coverImage: { borderTopLeftRadius: 14, borderTopRightRadius: 14 },
  overlay: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: 'rgba(31,31,31,.42)' },
  countdown: { alignSelf: 'flex-start', color: EDITORIAL_COLORS.paper, backgroundColor: EDITORIAL_COLORS.terracotta, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 8, fontWeight: '700', fontSize: 12, marginBottom: 6 },
  cardTitle: { color: EDITORIAL_COLORS.paper, fontSize: 21, fontWeight: '800', letterSpacing: -0.3 },
  cardDestination: { color: '#EEE9DF', fontSize: 14, marginTop: 2 },
  cardInfo: { paddingHorizontal: 14, paddingVertical: 11, gap: 8 },
  date: { color: EDITORIAL_COLORS.taupe, fontSize: 13 },
  avatarGroup: { flexDirection: 'row', alignItems: 'center' },
  avatar: { borderRadius: 17, borderWidth: 2, borderColor: EDITORIAL_COLORS.paper, overflow: 'hidden' },
  memberCount: { marginLeft: 8, color: EDITORIAL_COLORS.taupe, fontSize: 13 },
  cardActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  cloneButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, borderWidth: 1, borderColor: EDITORIAL_COLORS.line, backgroundColor: EDITORIAL_COLORS.paper },
  cloneButtonText: { color: EDITORIAL_COLORS.terracotta, fontWeight: '800' },
  actionButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 9, backgroundColor: EDITORIAL_COLORS.terracottaSoft },
  actionText: { color: EDITORIAL_COLORS.charcoal, fontWeight: '700' },
  dangerButton: { backgroundColor: EDITORIAL_COLORS.dangerSoft },
  dangerText: { color: EDITORIAL_COLORS.dangerText, fontWeight: '700' },
  empty: { alignItems: 'center', padding: 36, gap: 9, backgroundColor: EDITORIAL_COLORS.paper, borderRadius: 14, borderWidth: 1, borderColor: EDITORIAL_COLORS.line },
  emptyTitle: { fontSize: 20, fontWeight: '800', color: EDITORIAL_COLORS.charcoal },
  muted: { color: EDITORIAL_COLORS.taupe, marginBottom: 10 },
  secondary: { alignSelf: 'stretch', minHeight: 54, alignItems: 'center', justifyContent: 'center', padding: 12, borderWidth: 1.5, borderStyle: 'dashed', borderColor: EDITORIAL_COLORS.terracotta, borderRadius: 12, backgroundColor: EDITORIAL_COLORS.paper },
  secondaryText: { color: EDITORIAL_COLORS.terracotta, fontWeight: '800' },
  white: { color: EDITORIAL_COLORS.paper, fontWeight: '800' },
  error: { color: EDITORIAL_COLORS.dangerText, backgroundColor: EDITORIAL_COLORS.dangerSoft, borderRadius: 9, padding: 10, marginBottom: 8 },
});
