import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { getThemeForMode, type ThemeMode } from '@/lib/theme';
import { buildGlobalItineraryPayload, RECOMMENDATION_THEMES, searchDynamicRecommendations, searchGlobalPlaces, type GlobalItineraryPayload, type GlobalPlaceSearchResult, type RecommendationThemeId } from '@/lib/global-recommendations';

type Props = {
  tripId: string;
  userId: string;
  dayNumber: number;
  destination?: string | null;
  themeMode: ThemeMode;
  onAddToItinerary: (place: GlobalPlaceSearchResult, payload: GlobalItineraryPayload) => Promise<void>;
};

export function RecommendationPanel({ tripId, userId, dayNumber, destination, themeMode, onAddToItinerary }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalPlaceSearchResult[]>([]);
  const [destinationInput, setDestinationInput] = useState(destination?.trim() ?? '');
  const [selectedDestination, setSelectedDestination] = useState(destination?.trim() ?? '');
  const [recommendations, setRecommendations] = useState<GlobalPlaceSearchResult[]>([]);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [recommendationSearched, setRecommendationSearched] = useState(false);
  const [recommendationError, setRecommendationError] = useState('');
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [activeTheme, setActiveTheme] = useState<RecommendationThemeId>('must-see');
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const nextDestination = destination?.trim() ?? '';
    setDestinationInput(nextDestination);
    setSelectedDestination(nextDestination);
  }, [destination]);

  const loadRecommendations = useCallback(async (destinationValue: string, themeValue: RecommendationThemeId) => {
    const normalized = destinationValue.trim();
    if (normalized.length < 2) {
      setRecommendations([]);
      setRecommendationSearched(false);
      return;
    }
    setRecommendationLoading(true);
    setRecommendationSearched(true);
    setRecommendationError('');
    try {
      setRecommendations(await searchDynamicRecommendations(normalized, themeValue));
    } catch (error) {
      setRecommendations([]);
      setRecommendationError(error instanceof Error ? error.message : '暫時無法取得即時推薦');
    } finally {
      setRecommendationLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedDestination.trim().length >= 2) void loadRecommendations(selectedDestination, activeTheme);
  }, [activeTheme, loadRecommendations, selectedDestination]);

  function selectDestination(value: string) {
    const normalized = value.trim();
    setDestinationInput(value);
    setSelectedDestination(normalized);
  }

  function handleThemeSelect(theme: RecommendationThemeId) {
    setActiveTheme(theme);
    const typedDestination = destinationInput.trim();
    if (typedDestination !== selectedDestination) setSelectedDestination(typedDestination);
  }

  async function handleSearch() {
    const value = query.trim();
    if (value.length < 2) return;
    setSearching(true);
    setSearched(true);
    try {
      setResults(await searchGlobalPlaces(value));
    } catch (error) {
      setResults([]);
      Alert.alert('搜尋失敗', error instanceof Error ? error.message : '暫時無法取得全球景點');
    } finally {
      setSearching(false);
    }
  }

  async function handleAdd(place: GlobalPlaceSearchResult) {
    setAddingId(place.id);
    try {
      const payload = buildGlobalItineraryPayload(place, {
        tripId,
        createdBy: userId,
        dayNumber,
        startTime: '10:00',
      });
      await onAddToItinerary(place, payload);
      setResults((current) => current.filter((entry) => entry.id !== place.id));
      setRecommendations((current) => current.filter((entry) => entry.id !== place.id));
    } catch (error) {
      Alert.alert('帶入失敗', error instanceof Error ? error.message : '無法加入行程');
    } finally {
      setAddingId(null);
    }
  }

  return <View style={[styles.container, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
    <Text style={[styles.title, { color: theme.colors.text }]}>🌍 全球景點智慧搜尋</Text>
    <Text style={[styles.subtitle, { color: theme.colors.muted }]}>選擇目的地後，推薦會即時從 Places API 取得當地景點與美食。</Text>
    <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>選擇推薦地區</Text>
    <TextInput
      value={destinationInput}
      onChangeText={setDestinationInput}
      onSubmitEditing={() => selectDestination(destinationInput)}
      placeholder="輸入板橋、台中、東京或其他地區"
      placeholderTextColor={theme.colors.muted}
      style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
      returnKeyType="done"
    />
    <View style={styles.destinationChips}>
      {Array.from(new Set(['板橋', '台中', '東京', '首爾', '巴黎', destination?.trim()])).filter(Boolean).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityLabel={`選擇${value}推薦地區`} onPress={() => selectDestination(value!)} style={[styles.destinationChip, { borderColor: selectedDestination === value ? theme.colors.primary : theme.colors.border, backgroundColor: selectedDestination === value ? theme.colors.primary : theme.colors.background }]}><Text style={{ color: selectedDestination === value ? '#ffffff' : theme.colors.text, fontWeight: '700', fontSize: 12 }}>{value}</Text></Pressable>)}
    </View>
    <View style={styles.searchRow}>
      <TextInput
        value={query}
        onChangeText={(value) => { setQuery(value); setSearched(false); }}
        onSubmitEditing={() => void handleSearch()}
        placeholder="例如：東京鐵塔、巴黎羅浮宮、Central Park"
        placeholderTextColor={theme.colors.muted}
        style={[styles.input, { color: theme.colors.text, backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}
        returnKeyType="search"
      />
      <Pressable accessibilityRole="button" accessibilityLabel="搜尋全球景點" disabled={searching} onPress={() => void handleSearch()} style={[styles.searchButton, { backgroundColor: theme.colors.primary, opacity: searching ? 0.65 : 1 }]}>
        {searching ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>搜尋</Text>}
      </Pressable>
    </View>
    <View style={styles.themeTabs}>
      {RECOMMENDATION_THEMES.map((themeItem) => <Pressable key={themeItem.id} accessibilityRole="button" accessibilityLabel={`瀏覽${themeItem.label}推薦`} onPress={() => handleThemeSelect(themeItem.id)} style={[styles.themeTab, { borderColor: activeTheme === themeItem.id ? theme.colors.primary : theme.colors.border, backgroundColor: activeTheme === themeItem.id ? theme.colors.primary : theme.colors.background }]}><Text style={{ color: activeTheme === themeItem.id ? '#ffffff' : theme.colors.text, fontWeight: '800', fontSize: 12 }}>{themeItem.label}</Text></Pressable>)}
    </View>
    <Text style={[styles.themeDescription, { color: theme.colors.muted }]}>{RECOMMENDATION_THEMES.find((themeItem) => themeItem.id === activeTheme)?.description}</Text>
    {recommendationLoading ? <View style={styles.loadingRow}><ActivityIndicator color={theme.colors.primary} /><Text style={[styles.meta, { color: theme.colors.muted }]}>正在尋找當地推薦…</Text></View> : null}
    {recommendationError ? <Text style={[styles.emptyText, { color: theme.colors.muted }]}>{recommendationError}</Text> : null}
    {recommendationSearched && !recommendationLoading && !recommendationError && recommendations.length === 0 ? <Text style={[styles.emptyText, { color: theme.colors.muted }]}>目前找不到符合的推薦，請換個地區或主題。</Text> : null}
    <View style={styles.curatedList}>
      {recommendations.map((place) => <View key={`curated-${place.id}`} style={[styles.curatedCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
        <View style={styles.copy}><Text style={[styles.resultTitle, { color: theme.colors.text }]}>{place.title}</Text><Text numberOfLines={1} style={[styles.address, { color: theme.colors.muted }]}>{place.address}</Text><Text style={[styles.meta, { color: theme.colors.muted }]}>{place.category === 'outdoor' ? '戶外' : place.category === 'indoor' ? '室內' : '景點'} · 約 {place.estimatedDurationMinutes} 分鐘</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={`將 ${place.title} 帶入行程`} disabled={addingId !== null} onPress={() => void handleAdd(place)} style={[styles.addButton, { borderColor: theme.colors.primary }]}><Text style={[styles.addText, { color: theme.colors.primary }]}>一鍵帶入</Text></Pressable>
      </View>)}
    </View>
    {searched && !searching && results.length === 0 ? <Text style={[styles.emptyText, { color: theme.colors.muted }]}>查無結果，請嘗試英文、日文或城市名稱。</Text> : null}
    {results.length > 0 ? <View style={styles.results}>
      {results.map((place) => <View key={place.id} style={[styles.result, { borderColor: theme.colors.border }]}>
        <View style={styles.copy}>
          <Text style={[styles.resultTitle, { color: theme.colors.text }]}>{place.title}</Text>
          <Text numberOfLines={2} style={[styles.address, { color: theme.colors.muted }]}>{[place.city, place.country].filter(Boolean).join(' · ') || place.address}</Text>
          <View style={styles.metaRow}>
            <Text style={[styles.meta, { color: theme.colors.muted }]}>{place.category === 'outdoor' ? '戶外' : place.category === 'indoor' ? '室內' : '景點'} · 約 {place.estimatedDurationMinutes} 分鐘</Text>
            <Text style={[styles.meta, { color: theme.colors.muted }]}>{place.timezone}</Text>
          </View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`將 ${place.title} 帶入行程`} disabled={addingId !== null} onPress={() => void handleAdd(place)} style={[styles.addButton, { borderColor: theme.colors.primary, opacity: addingId && addingId !== place.id ? 0.55 : 1 }]}>
          {addingId === place.id ? <ActivityIndicator color={theme.colors.primary} /> : <Text style={[styles.addText, { color: theme.colors.primary }]}>一鍵帶入</Text>}
        </Pressable>
      </View>)}
    </View> : null}
  </View>;
}

const styles = StyleSheet.create({
  container: { width: '100%', borderWidth: 1, borderRadius: 14, padding: 14, gap: 10, marginBottom: 12 },
  title: { fontSize: 18, fontWeight: '800' },
  subtitle: { fontSize: 12, lineHeight: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '800' },
  searchRow: { width: '100%', flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, minWidth: 0, minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  searchButton: { minHeight: 44, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#ffffff', fontWeight: '800' },
  emptyText: { fontSize: 13, paddingVertical: 6 },
  destinationChips: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  destinationChip: { minHeight: 36, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  themeTabs: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  themeTab: { minHeight: 38, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  themeDescription: { fontSize: 12 },
  loadingRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 8 },
  curatedList: { width: '100%', gap: 6 },
  curatedCard: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 9 },
  results: { width: '100%', gap: 8 },
  result: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 10, padding: 10 },
  copy: { flex: 1, minWidth: 0, gap: 3 },
  resultTitle: { fontWeight: '800', fontSize: 15 },
  address: { fontSize: 12 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  meta: { fontSize: 11 },
  addButton: { minHeight: 40, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  addText: { fontSize: 12, fontWeight: '800' },
});
