import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { getTrip, listTripMembers, type Trip, type TripMemberWithProfile } from '@/lib/trips';
import { InviteTripModal } from '@/components/InviteTripModal';
import { filterAndSortItems, type ItineraryItem } from '@/lib/itinerary';
import { deleteItineraryItem, listItineraryItems, saveItineraryItem } from '@/lib/itinerary-api';
import { DayTabs } from '@/components/DayTabs';
import { TripMap } from '@/components/TripMap';
import { ItineraryTimeline } from '@/components/ItineraryTimeline';
import { ItineraryItemModal } from '@/components/ItineraryItemModal';

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const tripId = Array.isArray(id) ? id[0] : id;
  const [trip, setTrip] = useState<Trip | null>(null);
  const [members, setMembers] = useState<TripMemberWithProfile[]>([]);
  const [items, setItems] = useState<ItineraryItem[]>([]);
  const [userId, setUserId] = useState('');
  const [day, setDay] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(false);
  const [editing, setEditing] = useState<ItineraryItem | null>(null);
  const [inviteVisible, setInviteVisible] = useState(false);

  const days = useMemo(() => {
    const found = Array.from(new Set(items.map((item) => item.day_number))).sort((a, b) => a - b);
    return found.length ? found : [1];
  }, [items]);

  async function load() {
    if (!tripId) return;
    setLoading(true);
    setError('');
    try {
      const [{ data: auth }, tripData, memberData, itemData] = await Promise.all([
        supabase.auth.getUser(), getTrip(tripId), listTripMembers(tripId), listItineraryItems(tripId),
      ]);
      setUserId(auth.user?.id ?? ''); setTrip(tripData); setMembers(memberData); setItems(itemData);
    } catch (e: any) {
      console.error('[TripDetail] load failed', e);
      setError(e?.message ?? '無法載入行程資料。');
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [tripId]);
  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;
  if (!trip) return <View style={styles.center}><Text style={styles.error}>{error || '找不到此行程。'}</Text></View>;

  const visible = filterAndSortItems(items, day);
  return <View style={styles.container}>
    <ScrollView contentContainerStyle={styles.content}>
      <Pressable onPress={() => router.back()}><Text style={styles.back}>‹ 返回我的行程</Text></Pressable>
      <Text style={styles.title}>{trip.title}</Text>
      <Text style={styles.destination}>{trip.destination}</Text>
      <Text style={styles.date}>{trip.start_date} ～ {trip.end_date}</Text>
      <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>旅伴（{members.length}）</Text><Pressable onPress={() => setInviteVisible(true)}><Text style={styles.link}>邀請成員</Text></Pressable></View>
      <View style={styles.members}>{members.map((member) => <View key={member.user_id} style={styles.member}><Text>{member.profile?.display_name || member.user_id.slice(0, 8) + '…'}</Text><Text style={styles.role}>{member.role}</Text></View>)}</View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <DayTabs days={days} selected={day} onChange={setDay} />
      <View style={styles.map}><TripMap items={items} day={day} /></View>
      <View style={styles.timeline}><ItineraryTimeline items={visible} onEdit={(item) => { setEditing(item); setModal(true); }} onDelete={async (item) => { try { await deleteItineraryItem(item.id); await load(); } catch (e: any) { setError(e?.message ?? '刪除失敗。'); } }} /></View>
    </ScrollView>
    <Pressable style={styles.fab} onPress={() => { setEditing(null); setModal(true); }}><Text style={styles.fabText}>＋ 新增景點／活動</Text></Pressable>
    <ItineraryItemModal visible={modal} item={editing} day={day} tripId={tripId} userId={userId} onClose={() => setModal(false)} onSave={async (data) => { try { await saveItineraryItem(data); setModal(false); await load(); } catch (e: any) { setError(e?.message ?? '儲存失敗。'); } }} onDelete={editing ? async () => { await deleteItineraryItem(editing.id); await load(); } : undefined} />
    <InviteTripModal visible={inviteVisible} inviteCode={trip.invite_code} onClose={() => setInviteVisible(false)} />
  </View>;
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#f8fafc' }, content: { padding: 20, paddingTop: 50, paddingBottom: 100, gap: 10 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }, back: { color: '#2563eb', fontWeight: '600', marginBottom: 8 }, title: { fontSize: 30, fontWeight: '700' }, destination: { fontSize: 19, color: '#334155' }, date: { color: '#64748b' }, sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }, sectionTitle: { fontSize: 18, fontWeight: '700' }, link: { color: '#2563eb', fontWeight: '600' }, members: { gap: 6 }, member: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: 'white', borderRadius: 10, padding: 10 }, role: { color: '#2563eb', textTransform: 'capitalize' }, map: { height: 280, borderRadius: 16, overflow: 'hidden', marginTop: 8 }, timeline: { backgroundColor: 'white', borderRadius: 16, padding: 12 }, fab: { position: 'absolute', right: 20, bottom: 24, borderRadius: 24, paddingHorizontal: 18, paddingVertical: 14, backgroundColor: '#2563eb' }, fabText: { color: 'white', fontWeight: '700' }, error: { color: '#b91c1c', paddingVertical: 8 } });
