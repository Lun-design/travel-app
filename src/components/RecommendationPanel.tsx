import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, TextInput, View, useColorScheme } from 'react-native';
import { getThemeForMode, type ThemeMode } from '@/lib/theme';
import { buildGlobalItineraryPayload, getCuratedRecommendations, getPresetItineraries, RECOMMENDATION_THEMES, searchGlobalPlaces, type GlobalItineraryPayload, type GlobalPlaceSearchResult, type RecommendationPreset, type RecommendationThemeId } from '@/lib/global-recommendations';

type Props = {
  tripId: string;
  userId: string;
  dayNumber: number;
  themeMode: ThemeMode;
  onAddToItinerary: (place: GlobalPlaceSearchResult, payload: GlobalItineraryPayload) => Promise<void>;
  onImportPreset?: (preset: RecommendationPreset) => Promise<void>;
};

export function RecommendationPanel({ tripId, userId, dayNumber, themeMode, onAddToItinerary, onImportPreset }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<GlobalPlaceSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [addingId, setAddingId] = useState<string | null>(null);
  const [importingPresetId, setImportingPresetId] = useState<string | null>(null);
  const [activeTheme, setActiveTheme] = useState<RecommendationThemeId>('must-see');
  const [searched, setSearched] = useState(false);
  const presets = useMemo(() => query.trim().length >= 2 ? getPresetItineraries(query) : [], [query]);
  const curatedRecommendations = useMemo(() => getCuratedRecommendations(query, activeTheme), [activeTheme, query]);

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
    } catch (error) {
      Alert.alert('帶入失敗', error instanceof Error ? error.message : '無法加入行程');
    } finally {
      setAddingId(null);
    }
  }

  async function handleImportPreset(preset: RecommendationPreset) {
    if (!onImportPreset) return;
    setImportingPresetId(preset.id);
    try {
      await onImportPreset(preset);
    } catch (error) {
      Alert.alert('套用失敗', error instanceof Error ? error.message : '無法匯入懶人包');
    } finally {
      setImportingPresetId(null);
    }
  }

  return <View style={[styles.container, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
    <Text style={[styles.title, { color: theme.colors.text }]}>🌍 全球景點智慧搜尋</Text>
    <Text style={[styles.subtitle, { color: theme.colors.muted }]}>搜尋城市、地標或景點，結果會保留國際座標並自動判定時區。</Text>
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
      {RECOMMENDATION_THEMES.map((themeItem) => <Pressable key={themeItem.id} accessibilityRole="button" accessibilityLabel={`瀏覽${themeItem.label}推薦`} onPress={() => setActiveTheme(themeItem.id)} style={[styles.themeTab, { borderColor: activeTheme === themeItem.id ? theme.colors.primary : theme.colors.border, backgroundColor: activeTheme === themeItem.id ? theme.colors.primary : theme.colors.background }]}><Text style={{ color: activeTheme === themeItem.id ? '#ffffff' : theme.colors.text, fontWeight: '800', fontSize: 12 }}>{themeItem.label}</Text></Pressable>)}
    </View>
    <Text style={[styles.themeDescription, { color: theme.colors.muted }]}>{RECOMMENDATION_THEMES.find((themeItem) => themeItem.id === activeTheme)?.description}</Text>
    <View style={styles.curatedList}>
      {curatedRecommendations.map((place) => <View key={`curated-${place.id}`} style={[styles.curatedCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
        <View style={styles.copy}><Text style={[styles.resultTitle, { color: theme.colors.text }]}>{place.title}</Text><Text numberOfLines={1} style={[styles.address, { color: theme.colors.muted }]}>{place.address}</Text><Text style={[styles.meta, { color: theme.colors.muted }]}>{place.category === 'outdoor' ? '戶外' : place.category === 'indoor' ? '室內' : '景點'} · 約 {place.estimatedDurationMinutes} 分鐘</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel={`將 ${place.title} 帶入行程`} disabled={addingId !== null || importingPresetId !== null} onPress={() => void handleAdd(place)} style={[styles.addButton, { borderColor: theme.colors.primary }]}><Text style={[styles.addText, { color: theme.colors.primary }]}>一鍵帶入</Text></Pressable>
      </View>)}
    </View>
    {presets.length > 0 ? <View style={styles.presetSection}>
      <Text style={[styles.presetHeading, { color: theme.colors.text }]}>✨ {query.trim()} 熱門懶人包</Text>
      {presets.map((preset) => <View key={preset.id} style={[styles.presetCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}><View style={styles.copy}><Text style={[styles.resultTitle, { color: theme.colors.text }]}>{preset.title}</Text><Text style={[styles.address, { color: theme.colors.muted }]}>{preset.description}</Text><Text style={[styles.meta, { color: theme.colors.muted }]}>{preset.durationLabel} · {preset.places.length} 個景點</Text></View><Pressable accessibilityRole="button" accessibilityLabel={`一鍵帶入${preset.title}`} disabled={importingPresetId !== null || addingId !== null} onPress={() => void handleImportPreset(preset)} style={[styles.presetButton, { backgroundColor: theme.colors.primary, opacity: importingPresetId === preset.id ? 0.65 : 1 }]}>{importingPresetId === preset.id ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>一鍵帶入全天行程</Text>}</Pressable></View>)}
    </View> : null}
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
  searchRow: { width: '100%', flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, minWidth: 0, minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  searchButton: { minHeight: 44, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#ffffff', fontWeight: '800' },
  emptyText: { fontSize: 13, paddingVertical: 6 },
  themeTabs: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  themeTab: { minHeight: 38, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  themeDescription: { fontSize: 12 },
  curatedList: { width: '100%', gap: 6 },
  curatedCard: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 9 },
  presetSection: { width: '100%', gap: 8, paddingTop: 4 },
  presetHeading: { fontSize: 15, fontWeight: '800' },
  presetCard: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 11, padding: 10 },
  presetButton: { minHeight: 42, borderRadius: 9, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
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
