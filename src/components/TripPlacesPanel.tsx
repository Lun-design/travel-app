import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { fetchGooglePlaceDetails, resolveTripPlaceAddress, searchGooglePlaces } from '@/lib/google-places';
import type { GeocodingResult } from '@/lib/geocoding';
import type { GlobalItineraryPayload, GlobalPlaceSearchResult, RecommendationPreset } from '@/lib/global-recommendations';
import { createTripPlace, deleteTripPlace, scheduleTripPlace, type TripPlace } from '@/lib/trip-places-api';
import { getThemeForMode, type ThemeMode } from '@/lib/theme';
import { RecommendationPanel } from '@/components/RecommendationPanel';

type Props = {
  tripId: string;
  userId: string;
  places: TripPlace[];
  days: number[];
  themeMode: ThemeMode;
  onChanged: () => Promise<void>;
  onScheduled: (itemId: string, dayNumber: number) => Promise<void>;
  onTimezoneDetected?: (timezone: string) => Promise<void>;
};

export function TripPlacesPanel({ tripId, userId, places, days, themeMode, onChanged, onScheduled, onTimezoneDetected }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<TripPlace | null>(null);
  const [selectedDay, setSelectedDay] = useState(days[0] ?? 1);
  const [startTime, setStartTime] = useState('10:00');
  const [duration, setDuration] = useState('60');
  const [customVisible, setCustomVisible] = useState(false);
  const [customTitle, setCustomTitle] = useState('');
  const [customAddress, setCustomAddress] = useState('');
  const [busy, setBusy] = useState(false);

  const savedPlaces = useMemo(() => places.filter((place) => place.status === 'saved'), [places]);

  async function handleSearch() {
    if (query.trim().length < 2) return;
    setHasSearched(true);
    setSearching(true);
    try {
      setResults(await searchGooglePlaces(query.trim()));
    } catch (error) {
      Alert.alert('搜尋失敗', error instanceof Error ? error.message : '請稍後再試');
    } finally {
      setSearching(false);
    }
  }

  async function handleCustomAdd() {
    if (!customTitle.trim()) return;
    setBusy(true);
    try {
      await createTripPlace({
        trip_id: tripId,
        title: customTitle,
        address: customAddress || null,
        lat: null,
        lng: null,
        category: 'spot',
        notes: null,
        created_by: userId,
      });
      setCustomTitle('');
      setCustomAddress('');
      setCustomVisible(false);
      setQuery('');
      setResults([]);
      setHasSearched(false);
      await onChanged();
    } catch (error) {
      Alert.alert('加入失敗', error instanceof Error ? error.message : '請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function handleAdd(result: GeocodingResult) {
    setBusy(true);
    try {
      let details = result;
      if (result.provider === 'google' && result.googlePlaceId) {
        details = await fetchGooglePlaceDetails(result.googlePlaceId);
      }
      await createTripPlace({
        trip_id: tripId,
        title: details.title,
        address: resolveTripPlaceAddress(result.displayName, details.displayName),
        lat: Number.isFinite(details.latitude) ? details.latitude : null,
        lng: Number.isFinite(details.longitude) ? details.longitude : null,
        category: 'spot',
        notes: null,
        created_by: userId,
      });
      setResults((current) => current.filter((entry) => entry.id !== result.id));
      await onChanged();
    } catch (error) {
      Alert.alert('加入失敗', error instanceof Error ? error.message : '請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete(place: TripPlace) {
    try {
      await deleteTripPlace(place.id);
      await onChanged();
    } catch (error) {
      Alert.alert('刪除失敗', error instanceof Error ? error.message : '請稍後再試');
    }
  }

  async function handleSchedule() {
    if (!selectedPlace) return;
    setBusy(true);
    try {
      const scheduled = await scheduleTripPlace(selectedPlace.id, {
        dayNumber: selectedDay,
        startTime,
        durationMinutes: Number(duration) || 60,
        createdBy: userId,
      });
      await onChanged();
      await onScheduled(scheduled.item.id, selectedDay);
      setSelectedPlace(null);
    } catch (error) {
      Alert.alert('排入行程失敗', error instanceof Error ? error.message : '請稍後再試');
    } finally {
      setBusy(false);
    }
  }

  async function handleRecommendationAdd(place: GlobalPlaceSearchResult, payload: GlobalItineraryPayload) {
    setBusy(true);
    try {
      const created = await createTripPlace({
        trip_id: tripId,
        title: place.title,
        address: place.address,
        lat: place.latitude,
        lng: place.longitude,
        category: place.category,
        notes: null,
        created_by: userId,
      });
      const scheduled = await scheduleTripPlace(created.id, {
        dayNumber: Number(payload.day_number ?? selectedDay),
        startTime: payload.time,
        durationMinutes: payload.duration_minutes,
        createdBy: userId,
      });
      if (onTimezoneDetected && payload.timezone) await onTimezoneDetected(payload.timezone);
      await onChanged();
      await onScheduled(scheduled.item.id, Number(payload.day_number ?? selectedDay));
    } finally {
      setBusy(false);
    }
  }

  async function handlePresetImport(preset: RecommendationPreset) {
    setBusy(true);
    try {
      let lastItemId = '';
      let lastDay = days[0] ?? 1;
      let detectedTimezone = '';
      for (const place of preset.places) {
        const created = await createTripPlace({
          trip_id: tripId,
          title: place.title,
          address: place.address,
          lat: place.latitude,
          lng: place.longitude,
          category: place.category,
          notes: null,
          created_by: userId,
        });
        const scheduled = await scheduleTripPlace(created.id, {
          dayNumber: place.dayNumber,
          startTime: place.suggestedStartTime,
          durationMinutes: place.estimatedDurationMinutes,
          createdBy: userId,
        });
        lastItemId = scheduled.item.id;
        lastDay = place.dayNumber;
        if (!detectedTimezone) detectedTimezone = place.timezone;
      }
      if (onTimezoneDetected && detectedTimezone) await onTimezoneDetected(detectedTimezone);
      await onChanged();
      if (lastItemId) await onScheduled(lastItemId, lastDay);
    } finally {
      setBusy(false);
    }
  }

  return <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
    <RecommendationPanel tripId={tripId} userId={userId} dayNumber={selectedDay} themeMode={themeMode} onAddToItinerary={handleRecommendationAdd} onImportPreset={handlePresetImport} />
    <View style={[styles.header, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
      <Text style={[styles.title, { color: theme.colors.text }]}>💡 靈感收藏庫</Text>
      <Text style={[styles.subtitle, { color: theme.colors.muted }]}>先收藏想去的地方，再安排到適合的日期。</Text>
      <View style={styles.searchRow}>
        <TextInput
          value={query}
          onChangeText={(value) => { setQuery(value); setHasSearched(false); setResults([]); }}
          onSubmitEditing={() => void handleSearch()}
          placeholder="搜尋餐廳、景點或活動"
          placeholderTextColor={theme.colors.muted}
          style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}
          returnKeyType="search"
        />
        <Pressable accessibilityRole="button" disabled={searching} onPress={() => void handleSearch()} style={[styles.searchButton, { backgroundColor: theme.colors.primary }]}>
          {searching ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>搜尋</Text>}
        </Pressable>
      </View>
      {hasSearched && !searching && results.length === 0 ? <View style={[styles.noResults, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
        <Text style={[styles.noResultsText, { color: theme.colors.muted }]}>查無此景點，嘗試搜尋 Universal Studios Japan 或英文／日文名稱。</Text>
        <Pressable onPress={() => { setCustomTitle(query.trim()); setCustomVisible(true); }} style={[styles.customButton, { borderColor: theme.colors.primary }]}><Text style={[styles.smallButtonText, { color: theme.colors.primary }]}>手動新增自訂景點</Text></Pressable>
      </View> : null}
      {results.length > 0 ? <View style={[styles.results, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        {results.map((result) => <View key={result.id} style={styles.resultRow}>
          <View style={styles.resultCopy}><Text style={[styles.resultTitle, { color: theme.colors.text }]}>{result.title}</Text><Text numberOfLines={1} style={[styles.resultAddress, { color: theme.colors.muted }]}>{result.displayName}</Text></View>
          <Pressable disabled={busy} onPress={() => void handleAdd(result)} style={[styles.smallButton, { borderColor: theme.colors.primary }]}><Text style={[styles.smallButtonText, { color: theme.colors.primary }]}>加入</Text></Pressable>
        </View>)}
      </View> : null}
    </View>

    <View style={styles.listHeader}><Text style={[styles.sectionTitle, { color: theme.colors.text }]}>尚未排入行程 ({savedPlaces.length})</Text></View>
    {savedPlaces.length === 0 ? <View style={[styles.empty, { borderColor: theme.colors.border }]}><Text style={[styles.emptyText, { color: theme.colors.muted }]}>目前還沒有收藏景點，先搜尋一個吧！</Text></View> : <View style={styles.list}>
      {savedPlaces.map((place) => <View key={place.id} style={[styles.card, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}>
        <View style={styles.cardCopy}><Text style={[styles.cardTitle, { color: theme.colors.text }]}>{place.title}</Text>{place.address ? <Text numberOfLines={2} style={[styles.cardAddress, { color: theme.colors.muted }]}>{place.address}</Text> : null}{place.notes ? <Text style={[styles.cardNotes, { color: theme.colors.muted }]}>{place.notes}</Text> : null}</View>
        <View style={styles.cardActions}><Pressable onPress={() => { setSelectedDay(days[0] ?? 1); setSelectedPlace(place); }} style={[styles.smallButton, { backgroundColor: theme.colors.primary }]}><Text style={styles.buttonText}>排入行程</Text></Pressable><Pressable onPress={() => void handleDelete(place)} style={[styles.smallButton, { borderColor: theme.colors.border }]}><Text style={[styles.smallButtonText, { color: theme.colors.muted }]}>刪除</Text></Pressable></View>
      </View>)}
    </View>}

    <Modal visible={Boolean(selectedPlace)} transparent animationType="slide" onRequestClose={() => setSelectedPlace(null)}>
      <View style={styles.modalBackdrop}><View style={[styles.modalCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Text style={[styles.modalTitle, { color: theme.colors.text }]}>排入哪一天？</Text>
        <Text style={[styles.modalPlace, { color: theme.colors.muted }]}>{selectedPlace?.title}</Text>
        <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>Day</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.dayRow}>{days.map((value) => <Pressable key={value} onPress={() => setSelectedDay(value)} style={[styles.dayButton, { borderColor: value === selectedDay ? theme.colors.primary : theme.colors.border, backgroundColor: value === selectedDay ? theme.colors.primary : theme.colors.surface }]}><Text style={{ color: value === selectedDay ? '#fff' : theme.colors.text }}>Day {value}</Text></Pressable>)}</ScrollView>
        <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>開始時間</Text><TextInput value={startTime} onChangeText={setStartTime} keyboardType="numbers-and-punctuation" style={[styles.modalInput, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholder="10:00" />
        <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>停留時間（分鐘）</Text><TextInput value={duration} onChangeText={setDuration} keyboardType="number-pad" style={[styles.modalInput, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholder="60" />
        <View style={styles.modalActions}><Pressable onPress={() => setSelectedPlace(null)} style={[styles.modalButton, { borderColor: theme.colors.border }]}><Text style={{ color: theme.colors.text }}>取消</Text></Pressable><Pressable disabled={busy} onPress={() => void handleSchedule()} style={[styles.modalButton, { backgroundColor: theme.colors.primary }]}><Text style={styles.buttonText}>{busy ? '儲存中' : '確認排入'}</Text></Pressable></View>
      </View></View>
    </Modal>

    <Modal visible={customVisible} transparent animationType="slide" onRequestClose={() => setCustomVisible(false)}>
      <View style={styles.modalBackdrop}><View style={[styles.modalCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Text style={[styles.modalTitle, { color: theme.colors.text }]}>手動新增景點</Text>
        <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>景點名稱</Text>
        <TextInput autoFocus value={customTitle} onChangeText={setCustomTitle} style={[styles.modalInput, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholder="例如：大阪城" />
        <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>地址（選填）</Text>
        <TextInput value={customAddress} onChangeText={setCustomAddress} style={[styles.modalInput, { borderColor: theme.colors.border, color: theme.colors.text }]} placeholder="可稍後補上地址" />
        <View style={styles.modalActions}><Pressable onPress={() => setCustomVisible(false)} style={[styles.modalButton, { borderColor: theme.colors.border }]}><Text style={{ color: theme.colors.text }}>取消</Text></Pressable><Pressable disabled={busy || !customTitle.trim()} onPress={() => void handleCustomAdd()} style={[styles.modalButton, { backgroundColor: theme.colors.primary, opacity: busy || !customTitle.trim() ? 0.55 : 1 }]}><Text style={styles.buttonText}>{busy ? '儲存中' : '加入收藏庫'}</Text></Pressable></View>
      </View></View>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  header: { width: '100%', borderWidth: 1, borderRadius: 16, padding: 16, gap: 10 },
  title: { fontSize: 22, fontWeight: '800' },
  subtitle: { fontSize: 13 },
  searchRow: { width: '100%', flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, minWidth: 0, minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  searchButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 10 },
  buttonText: { color: '#fff', fontWeight: '800' },
  noResults: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 10 },
  noResultsText: { fontSize: 13, lineHeight: 19 },
  customButton: { alignSelf: 'flex-start', minHeight: 40, borderWidth: 1, borderRadius: 9, justifyContent: 'center', paddingHorizontal: 12 },
  results: { borderWidth: 1, borderRadius: 10, overflow: 'hidden' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderBottomWidth: 1, borderBottomColor: '#E5E2D9' },
  resultCopy: { flex: 1, minWidth: 0, gap: 2 },
  resultTitle: { fontWeight: '800' },
  resultAddress: { fontSize: 12 },
  smallButton: { minHeight: 40, minWidth: 58, borderRadius: 9, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  smallButtonText: { fontWeight: '800' },
  listHeader: { paddingTop: 18, paddingBottom: 8 },
  sectionTitle: { fontSize: 17, fontWeight: '800' },
  list: { gap: 10, paddingBottom: 100 },
  card: { width: '100%', borderWidth: 1, borderRadius: 14, padding: 14, gap: 12 },
  cardCopy: { gap: 4 },
  cardTitle: { fontSize: 17, fontWeight: '800' },
  cardAddress: { fontSize: 13 },
  cardNotes: { fontSize: 13, fontStyle: 'italic' },
  cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  empty: { borderWidth: 1, borderRadius: 14, padding: 22, alignItems: 'center' },
  emptyText: { fontSize: 14 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(31,31,31,0.45)', justifyContent: 'flex-end' },
  modalCard: { width: '100%', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, padding: 20, gap: 10 },
  modalTitle: { fontSize: 21, fontWeight: '800' },
  modalPlace: { fontSize: 14 },
  fieldLabel: { fontSize: 13, fontWeight: '700', marginTop: 4 },
  dayRow: { gap: 8, paddingVertical: 2 },
  dayButton: { minHeight: 40, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  modalInput: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 8 },
  modalButton: { minHeight: 44, minWidth: 88, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
});
