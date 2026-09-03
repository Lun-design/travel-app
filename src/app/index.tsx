import { Link } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { listTrips, type Trip } from '@/lib/trips';

export default function HomeScreen() {
  const [trips, setTrips] = useState<Trip[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState('');
  useEffect(() => { listTrips().then(setTrips).catch(() => setError('無法載入行程，請確認已登入與 Supabase 設定。')).finally(() => setLoading(false)); }, []);
  if (loading) return <View style={styles.center}><ActivityIndicator /></View>;
  return <View style={styles.container}><Text style={styles.title}>我的行程</Text>{error ? <Text style={styles.error}>{error}</Text> : null}<FlatList data={trips} keyExtractor={(x) => x.id} ListEmptyComponent={<Text>目前還沒有行程</Text>} renderItem={({ item, index }) => <Link href={`/trips/${item.id}`} asChild><Pressable style={index === 0 ? styles.card : styles.row}><Text style={styles.tripTitle}>{item.title}</Text><Text>{item.destination} · {item.start_date} 至 {item.end_date}</Text></Pressable></Link>} /></View>;
}
const styles = StyleSheet.create({ container: { flex: 1, padding: 24, gap: 16, backgroundColor: '#f7f9fc' }, center: { flex: 1, alignItems: 'center', justifyContent: 'center' }, title: { fontSize: 30, fontWeight: '700' }, card: { padding: 20, borderRadius: 18, backgroundColor: '#dbeafe', gap: 8, marginBottom: 12 }, row: { padding: 16, backgroundColor: 'white', borderRadius: 12, marginBottom: 8 }, tripTitle: { fontSize: 18, fontWeight: '600' }, error: { color: '#b91c1c' } });
