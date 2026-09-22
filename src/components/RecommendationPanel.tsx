import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useColorScheme,
} from 'react-native';
import { getThemeForMode, type ThemeMode } from '@/lib/theme';
import { getSpotImageUrl } from '@/lib/spot-image';
import {
  buildGlobalItineraryPayload,
  buildExpandedRecommendationQuery,
  DEFAULT_RECOMMENDATION_PAGE_SIZE,
  getLocalRecommendationFallback,
  getRecommendationSubcategories,
  mergeRecommendationResults,
  paginateRecommendations,
  RECOMMENDATION_THEMES,
  searchDynamicRecommendationsPage,
  searchGlobalPlaces,
  type GlobalItineraryPayload,
  type GlobalPlaceSearchResult,
  type RecommendationPage,
  type RecommendationSubcategoryId,
  type RecommendationThemeId,
} from '@/lib/global-recommendations';

type Props = {
  tripId: string;
  userId: string;
  dayNumber: number;
  destination?: string | null;
  themeMode: ThemeMode;
  onAddToItinerary: (place: GlobalPlaceSearchResult, payload: GlobalItineraryPayload) => Promise<void>;
  onAddedToItinerary?: (place: GlobalPlaceSearchResult, payload: GlobalItineraryPayload) => void | Promise<void>;
  onAddToBucket?: (place: GlobalPlaceSearchResult) => Promise<void> | void;
};

const RECOMMENDATION_PAGE_SIZE = DEFAULT_RECOMMENDATION_PAGE_SIZE;
const MAX_RECOMMENDATION_EXPANSIONS = 12;

export function RecommendationPanel({ tripId, userId, dayNumber, destination, themeMode, onAddToItinerary, onAddedToItinerary, onAddToBucket }: Props) {
  const theme = getThemeForMode(themeMode, useColorScheme());
  const [isOpen, setIsOpen] = useState(false);
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
  const [activeSubcategory, setActiveSubcategory] = useState<RecommendationSubcategoryId>('all');
  const [page, setPage] = useState(1);
  const [nextPageToken, setNextPageToken] = useState<string | null>(null);
  const [recommendationLoadingMore, setRecommendationLoadingMore] = useState(false);
  const [recommendationTotalItems, setRecommendationTotalItems] = useState<number | null>(null);
  const [recommendationExpansionIndex, setRecommendationExpansionIndex] = useState(0);
  const [recommendationSource, setRecommendationSource] = useState<'api' | 'seed'>('api');
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [bucketAddedIds, setBucketAddedIds] = useState<string[]>([]);
  const [bucketAddingId, setBucketAddingId] = useState<string | null>(null);
  const [failedImageIds, setFailedImageIds] = useState<string[]>([]);
  const [searched, setSearched] = useState(false);
  const recommendationRequestId = useRef(0);

  function recommendationImageUrl(place: GlobalPlaceSearchResult): string {
    return place.imageUrl
      ?? place.image_url
      ?? place.photoUrl
      ?? place.photo_url
      ?? getSpotImageUrl({
        id: place.id,
        name: place.title,
        address: place.address,
        category: place.category === 'indoor' ? 'spot' : place.category,
        photoReference: place.photoReference,
      });
  }

  function renderRecommendationImage(place: GlobalPlaceSearchResult) {
    if (failedImageIds.includes(place.id)) {
      const isFood = place.types?.some((type) => /restaurant|food|cafe|ramen|noodle/i.test(type)) || /拉麵|麵|烏龍|餐廳|美食|ramen|noodle|cafe|restaurant/i.test(place.title);
      const icon = isFood ? '🍜' : place.category === 'indoor' ? '🏛️' : '📍';
      return <View accessibilityLabel={`${place.title} 預設圖片`} style={styles.recommendationImageFallback}><Text style={styles.recommendationImageIcon}>{icon}</Text></View>;
    }
    return <Image
      source={{ uri: recommendationImageUrl(place) }}
      style={styles.recommendationImage}
      resizeMode="cover"
      accessibilityLabel={`${place.title} 景點圖片`}
      onError={() => setFailedImageIds((current) => current.includes(place.id) ? current : [...current, place.id])}
    />;
  }

  useEffect(() => {
    const nextDestination = destination?.trim() ?? '';
    setDestinationInput(nextDestination);
    setSelectedDestination(nextDestination);
    setPage(1);
    setRecommendationTotalItems(null);
    setRecommendationExpansionIndex(0);
    setNextPageToken(null);
    setAddedIds([]);
  }, [destination]);

  const loadRecommendations = useCallback(async (
    destinationValue: string,
    themeValue: RecommendationThemeId,
    subcategoryValue: RecommendationSubcategoryId,
  ) => {
    const requestId = ++recommendationRequestId.current;
    const normalized = destinationValue.trim();
    if (normalized.length < 2) {
      if (requestId !== recommendationRequestId.current) return;
      setRecommendations([]);
      setRecommendationSearched(false);
      setNextPageToken(null);
      setRecommendationTotalItems(0);
      return;
    }
    setRecommendationLoading(true);
    setRecommendationSearched(true);
    setRecommendationError('');
    setRecommendationExpansionIndex(0);
    // Invalidate the previous query before starting a new destination/theme
    // request; an old token is tied to the old Text Search body and can yield
    // a Google 400 if reused.
    setNextPageToken(null);
    setRecommendations([]);
    setRecommendationTotalItems(null);
    setPage(1);
    try {
      const firstPage = await searchDynamicRecommendationsPage(normalized, themeValue, { subcategory: subcategoryValue });
      if (requestId !== recommendationRequestId.current) return;
      setRecommendations(firstPage.results);
      setNextPageToken(firstPage.nextPageToken);
      setRecommendationTotalItems(firstPage.totalItems);
      setRecommendationSource(firstPage.source ?? 'api');
    } catch (error) {
      if (requestId !== recommendationRequestId.current) return;
      setRecommendations(getLocalRecommendationFallback(normalized, themeValue, subcategoryValue));
      setRecommendationSource('seed');
      setNextPageToken(null);
      setRecommendationTotalItems(null);
      setRecommendationError(error instanceof Error ? error.message : '暫時無法取得即時推薦');
    } finally {
      if (requestId === recommendationRequestId.current) setRecommendationLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen || selectedDestination.trim().length < 2) return;
    void loadRecommendations(selectedDestination, activeTheme, activeSubcategory);
  }, [activeSubcategory, activeTheme, isOpen, loadRecommendations, selectedDestination]);

  const loadMoreRecommendations = useCallback(async (): Promise<RecommendationPage | null> => {
    const normalized = selectedDestination.trim();
    const token = nextPageToken;
    const expansionIndex = recommendationExpansionIndex;
    const canExpand = !token && expansionIndex < MAX_RECOMMENDATION_EXPANSIONS;
    if (normalized.length < 2 || recommendationLoadingMore || (!token && !canExpand)) return null;
    setRecommendationLoadingMore(true);
    setRecommendationError('');
    try {
      const nextPage = await searchDynamicRecommendationsPage(normalized, activeTheme, {
        subcategory: activeSubcategory,
        pageToken: token,
        queryOverride: token
          ? undefined
          : buildExpandedRecommendationQuery(normalized, activeTheme, activeSubcategory, expansionIndex),
      });
      if (nextPage.source === recommendationSource) {
        setRecommendations((current) => mergeRecommendationResults(current, nextPage.results));
      } else if (nextPage.source === 'api') {
        // A successful API expansion supersedes the offline seed list; never
        // present verified API cards and synthetic/local records together.
        setRecommendations(nextPage.results);
        setRecommendationSource('api');
      }
      setNextPageToken(nextPage.nextPageToken);
      setRecommendationTotalItems((current) => nextPage.totalItems ?? current);
      if (!token) setRecommendationExpansionIndex((current) => current + 1);
      return nextPage;
    } catch (error) {
      setRecommendationError(error instanceof Error ? error.message : '?急??⊥????單??刻');
      return null;
    } finally {
      setRecommendationLoadingMore(false);
    }
  }, [activeSubcategory, activeTheme, nextPageToken, recommendationExpansionIndex, recommendationLoadingMore, recommendationSource, selectedDestination]);

  function selectDestination(value: string) {
    const normalized = value.trim();
    setDestinationInput(value);
    setSelectedDestination(normalized);
    setPage(1);
    setRecommendationTotalItems(null);
    setRecommendationExpansionIndex(0);
    setNextPageToken(null);
    setAddedIds([]);
  }

  function handleThemeSelect(nextTheme: RecommendationThemeId) {
    setActiveTheme(nextTheme);
    setActiveSubcategory('all');
    setPage(1);
    setRecommendationTotalItems(null);
    setRecommendationExpansionIndex(0);
    setNextPageToken(null);
    setAddedIds([]);
    const typedDestination = destinationInput.trim();
    if (typedDestination !== selectedDestination) setSelectedDestination(typedDestination);
  }

  function handleSubcategorySelect(nextSubcategory: RecommendationSubcategoryId) {
    setActiveSubcategory(nextSubcategory);
    setPage(1);
    setRecommendationTotalItems(null);
    setRecommendationExpansionIndex(0);
    setNextPageToken(null);
    setAddedIds([]);
  }

  async function handleNextPage() {
    const nextPageStart = page * RECOMMENDATION_PAGE_SIZE;
    const nextPageAlreadyLoaded = recommendations.length > nextPageStart;
    if (recommendationPage.hasNext && nextPageAlreadyLoaded) {
      setPage((current) => current + 1);
      return;
    }
    if (!canLoadNextPage) return;
    const loaded = await loadMoreRecommendations();
    if (loaded?.results.length) setPage((current) => current + 1);
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
      await onAddedToItinerary?.(place, payload);
      setAddedIds((current) => current.includes(place.id) ? current : [...current, place.id]);
    } catch (error) {
      Alert.alert('帶入失敗', error instanceof Error ? error.message : '無法加入行程');
    } finally {
      setAddingId(null);
    }
  }

  async function handleSaveToBucket(place: GlobalPlaceSearchResult) {
    if (!onAddToBucket) return;
    setBucketAddingId(place.id);
    try {
      await onAddToBucket(place);
      setBucketAddedIds((current) => current.includes(place.id) ? current : [...current, place.id]);
    } catch (error) {
      Alert.alert('收藏失敗', error instanceof Error ? error.message : '無法加入靈感收藏庫');
    } finally {
      setBucketAddingId(null);
    }
  }

  const recommendationPage = paginateRecommendations(recommendations, page, RECOMMENDATION_PAGE_SIZE, recommendationTotalItems);
  const nextPageStart = page * RECOMMENDATION_PAGE_SIZE;
  const nextPageAlreadyLoaded = recommendations.length > nextPageStart;
  const canLoadNextPage = recommendations.length > 0 && (
    recommendationPage.hasNext
    || nextPageAlreadyLoaded
    || Boolean(nextPageToken)
    || recommendationExpansionIndex < MAX_RECOMMENDATION_EXPANSIONS
  );
  const displayTotalPages = Math.max(
    recommendationPage.totalPages,
    page + (canLoadNextPage ? 1 : 0),
  );
  const subcategories = getRecommendationSubcategories(activeTheme);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="開啟靈感推薦"
        onPress={() => setIsOpen(true)}
        style={[styles.trigger, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}
      >
        <Text style={[styles.triggerText, { color: theme.colors.text }]}>💡 靈感推薦</Text>
        <Text style={[styles.triggerHint, { color: theme.colors.muted }]}>探索目的地景點與美食</Text>
      </Pressable>

      <Modal
        visible={isOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
            <View style={styles.modalHeader}>
              <View style={styles.headerCopy}>
                <Text style={[styles.title, { color: theme.colors.text }]}>🌍 全球景點智慧搜尋</Text>
                <Text style={[styles.subtitle, { color: theme.colors.muted }]}>依地區與主題即時探索 Places API 景點</Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="關閉靈感推薦"
                onPress={() => setIsOpen(false)}
                style={[styles.closeButton, { borderColor: theme.colors.border }]}
              >
                <Text style={[styles.closeText, { color: theme.colors.text }]}>✕</Text>
              </Pressable>
            </View>

            <ScrollView
              contentContainerStyle={styles.modalContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
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
                {Array.from(new Set(['板橋', '台中', '東京', '首爾', '巴黎', destination?.trim()])).filter(Boolean).map((value) => (
                  <Pressable
                    key={value}
                    accessibilityRole="button"
                    accessibilityLabel={`選擇${value}推薦地區`}
                    onPress={() => selectDestination(value!)}
                    style={[styles.destinationChip, {
                      borderColor: selectedDestination === value ? theme.colors.primary : theme.colors.border,
                      backgroundColor: selectedDestination === value ? theme.colors.primary : theme.colors.background,
                    }]}
                  >
                    <Text style={{ color: selectedDestination === value ? '#ffffff' : theme.colors.text, fontWeight: '700', fontSize: 12 }}>{value}</Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.themeTabs}>
                {RECOMMENDATION_THEMES.map((themeItem) => (
                  <Pressable
                    key={themeItem.id}
                    accessibilityRole="button"
                    accessibilityLabel={`瀏覽${themeItem.label}推薦`}
                    onPress={() => handleThemeSelect(themeItem.id)}
                    style={[styles.themeTab, {
                      borderColor: activeTheme === themeItem.id ? theme.colors.primary : theme.colors.border,
                      backgroundColor: activeTheme === themeItem.id ? theme.colors.primary : theme.colors.background,
                    }]}
                  >
                    <Text style={{ color: activeTheme === themeItem.id ? '#ffffff' : theme.colors.text, fontWeight: '800', fontSize: 12 }}>{themeItem.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Text style={[styles.themeDescription, { color: theme.colors.muted }]}>{RECOMMENDATION_THEMES.find((themeItem) => themeItem.id === activeTheme)?.description}</Text>

              {subcategories.length > 1 ? (
                <View style={styles.subcategorySection}>
                  <Text style={[styles.fieldLabel, { color: theme.colors.text }]}>細分主題</Text>
                  <View style={styles.subcategoryTabs}>
                    {subcategories.map((subcategory) => (
                      <Pressable
                        key={subcategory.id}
                        accessibilityRole="button"
                        accessibilityLabel={`篩選${subcategory.label}`}
                        onPress={() => handleSubcategorySelect(subcategory.id)}
                        style={[styles.subcategoryTab, {
                          borderColor: activeSubcategory === subcategory.id ? theme.colors.primary : theme.colors.border,
                          backgroundColor: activeSubcategory === subcategory.id ? theme.colors.primary : theme.colors.background,
                        }]}
                      >
                        <Text style={{ color: activeSubcategory === subcategory.id ? '#ffffff' : theme.colors.text, fontWeight: '700', fontSize: 12 }}>{subcategory.label}</Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
              ) : null}

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
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="搜尋全球景點"
                  disabled={searching}
                  onPress={() => void handleSearch()}
                  style={[styles.searchButton, { backgroundColor: theme.colors.primary, opacity: searching ? 0.65 : 1 }]}
                >
                  {searching ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.buttonText}>搜尋</Text>}
                </Pressable>
              </View>

              {recommendationLoading ? <View style={styles.loadingRow}><ActivityIndicator color={theme.colors.primary} /><Text style={[styles.meta, { color: theme.colors.muted }]}>正在尋找當地推薦…</Text></View> : null}
              {recommendationError ? <Text style={[styles.emptyText, { color: theme.colors.muted }]}>{recommendationError}</Text> : null}
              {recommendationSearched && !recommendationLoading && !recommendationError && recommendations.length === 0 ? <Text style={[styles.emptyText, { color: theme.colors.muted }]}>目前找不到符合的推薦，請換個地區或主題。</Text> : null}

              <View style={styles.curatedList}>
                {recommendationPage.items.map((place) => (
                  <View key={`curated-${place.id}`} style={[styles.curatedCard, { borderColor: theme.colors.border, backgroundColor: theme.colors.background }]}>
                    {renderRecommendationImage(place)}
                    <View style={styles.copy}>
                      <Text style={[styles.resultTitle, { color: theme.colors.text }]}>{place.title}</Text>
                      <Text numberOfLines={1} style={[styles.address, { color: theme.colors.muted }]}>{place.address}</Text>
                      <Text style={[styles.meta, { color: theme.colors.muted }]}>{place.category === 'outdoor' ? '戶外' : place.category === 'indoor' ? '室內' : '景點'} · 約 {place.estimatedDurationMinutes} 分鐘</Text>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel={`將 ${place.title} 帶入行程`} disabled={addingId !== null || addedIds.includes(place.id)} onPress={() => void handleAdd(place)} style={[styles.addButton, { borderColor: theme.colors.primary, opacity: addedIds.includes(place.id) ? 0.55 : 1 }]}>
                      {addingId === place.id ? <ActivityIndicator color={theme.colors.primary} /> : <Text style={[styles.addText, { color: theme.colors.primary }]}>{addedIds.includes(place.id) ? '已帶入' : '一鍵帶入'}</Text>}
                    </Pressable>
                    {onAddToBucket ? <Pressable accessibilityRole="button" accessibilityLabel={`收藏 ${place.title}`} disabled={bucketAddingId !== null || bucketAddedIds.includes(place.id)} onPress={() => void handleSaveToBucket(place)} style={[styles.addButton, { borderColor: theme.colors.border, opacity: bucketAddedIds.includes(place.id) ? 0.55 : 1 }]}>
                      {bucketAddingId === place.id ? <ActivityIndicator color={theme.colors.primary} /> : <Text style={[styles.addText, { color: theme.colors.text }]}>{bucketAddedIds.includes(place.id) ? '已收藏' : '＋ 收藏'}</Text>}
                    </Pressable> : null}
                  </View>
                ))}
              </View>

              {recommendationLoadingMore ? (
                <View testID="recommendationSkeleton" style={styles.recommendationSkeleton}>
                  {[0, 1, 2].map((index) => (
                    <View key={`recommendation-skeleton-${index}`} style={styles.skeletonRow}>
                      <View style={styles.skeletonImage} />
                      <View style={styles.skeletonCopy} />
                    </View>
                  ))}
                </View>
              ) : null}

              {recommendations.length > 0 ? (
                <View style={styles.pagination}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="上一頁推薦"
                    disabled={!recommendationPage.hasPrevious}
                    onPress={() => setPage((current) => Math.max(1, current - 1))}
                    style={[styles.paginationButton, { borderColor: theme.colors.border, opacity: recommendationPage.hasPrevious ? 1 : 0.45 }]}
                  >
                    <Text style={[styles.paginationText, { color: theme.colors.text }]}>上一頁</Text>
                  </Pressable>
                  <Text style={[styles.pageIndicator, { color: theme.colors.muted }]}>第 {recommendationPage.page} / {displayTotalPages} 頁</Text>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="下一頁推薦"
                    disabled={!canLoadNextPage || recommendationLoading || recommendationLoadingMore}
                    onPress={() => void handleNextPage()}
                    style={[styles.paginationButton, { borderColor: theme.colors.border, opacity: canLoadNextPage ? 1 : 0.45 }]}
                  >
                    {recommendationLoadingMore ? <ActivityIndicator color={theme.colors.primary} /> : <Text style={[styles.paginationText, { color: theme.colors.text }]}>下一頁</Text>}
                  </Pressable>
                </View>
              ) : null}

              {nextPageToken ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="查看更多景點"
                  disabled={recommendationLoadingMore}
                  onPress={() => void loadMoreRecommendations()}
                  style={[styles.loadMoreButton, { borderColor: theme.colors.primary, opacity: recommendationLoadingMore ? 0.6 : 1 }]}
                >
                  {recommendationLoadingMore ? <ActivityIndicator color={theme.colors.primary} /> : <Text style={[styles.loadMoreText, { color: theme.colors.primary }]}>查看更多景點</Text>}
                </Pressable>
              ) : null}

              {searched && !searching && results.length === 0 ? <Text style={[styles.emptyText, { color: theme.colors.muted }]}>查無結果，請嘗試英文、日文或城市名稱。</Text> : null}
              {results.length > 0 ? <View style={styles.results}>
                {results.map((place) => (
                  <View key={place.id} style={[styles.result, { borderColor: theme.colors.border }]}>
                    {renderRecommendationImage(place)}
                    <View style={styles.copy}>
                      <Text style={[styles.resultTitle, { color: theme.colors.text }]}>{place.title}</Text>
                      <Text numberOfLines={2} style={[styles.address, { color: theme.colors.muted }]}>{[place.city, place.country].filter(Boolean).join(' · ') || place.address}</Text>
                      <View style={styles.metaRow}>
                        <Text style={[styles.meta, { color: theme.colors.muted }]}>{place.category === 'outdoor' ? '戶外' : place.category === 'indoor' ? '室內' : '景點'} · 約 {place.estimatedDurationMinutes} 分鐘</Text>
                        <Text style={[styles.meta, { color: theme.colors.muted }]}>{place.timezone}</Text>
                      </View>
                    </View>
                    <Pressable accessibilityRole="button" accessibilityLabel={`將 ${place.title} 帶入行程`} disabled={addingId !== null || addedIds.includes(place.id)} onPress={() => void handleAdd(place)} style={[styles.addButton, { borderColor: theme.colors.primary, opacity: addedIds.includes(place.id) ? 0.55 : addingId && addingId !== place.id ? 0.55 : 1 }]}>
                      {addingId === place.id ? <ActivityIndicator color={theme.colors.primary} /> : <Text style={[styles.addText, { color: theme.colors.primary }]}>{addedIds.includes(place.id) ? '已帶入' : '一鍵帶入'}</Text>}
                    </Pressable>
                  </View>
                ))}
              </View> : null}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: { width: '100%', minHeight: 48, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  triggerText: { fontSize: 16, fontWeight: '800' },
  triggerHint: { fontSize: 12, flexShrink: 1, textAlign: 'right' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.42)', justifyContent: 'flex-end' },
  modalCard: { width: '100%', maxHeight: '94%', borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, overflow: 'hidden' },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 10 },
  headerCopy: { flex: 1, minWidth: 0, gap: 4 },
  closeButton: { minWidth: 44, minHeight: 44, borderWidth: 1, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  closeText: { fontSize: 20, fontWeight: '700' },
  modalContent: { padding: 16, paddingTop: 6, paddingBottom: 40, gap: 10 },
  title: { fontSize: 20, fontWeight: '800' },
  subtitle: { fontSize: 12, lineHeight: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '800' },
  searchRow: { width: '100%', flexDirection: 'row', gap: 8, alignItems: 'center' },
  input: { flex: 1, minWidth: 0, minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12 },
  searchButton: { minHeight: 44, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#ffffff', fontWeight: '800' },
  emptyText: { fontSize: 13, paddingVertical: 6 },
  destinationChips: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  destinationChip: { minHeight: 36, borderWidth: 1, borderRadius: 9, paddingHorizontal: 11, alignItems: 'center', justifyContent: 'center' },
  themeTabs: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  themeTab: { minHeight: 38, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  themeDescription: { fontSize: 12 },
  subcategorySection: { gap: 6 },
  subcategoryTabs: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  subcategoryTab: { minHeight: 36, borderWidth: 1, borderRadius: 9, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  loadingRow: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 8 },
  recommendationSkeleton: { width: '100%', gap: 8, paddingVertical: 4 },
  skeletonRow: { width: '100%', minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 10, backgroundColor: '#F0EDE8' },
  skeletonImage: { width: 56, height: 56, borderRadius: 8, backgroundColor: '#E4DED6' },
  skeletonCopy: { flex: 1, height: 38, borderRadius: 6, backgroundColor: '#E4DED6' },
  curatedList: { width: '100%', gap: 8 },
  curatedCard: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderRadius: 10, padding: 10 },
  recommendationImage: { width: 96, height: 96, borderRadius: 10, backgroundColor: '#EEEAE4' },
  recommendationImageFallback: { width: 96, height: 96, borderRadius: 10, backgroundColor: '#EEEAE4', alignItems: 'center', justifyContent: 'center' },
  recommendationImageIcon: { fontSize: 28 },
  pagination: { width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, paddingTop: 4 },
  paginationButton: { minHeight: 40, borderWidth: 1, borderRadius: 9, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  paginationText: { fontSize: 12, fontWeight: '800' },
  pageIndicator: { fontSize: 12, fontWeight: '700' },
  loadMoreButton: { minHeight: 44, borderWidth: 1, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 14 },
  loadMoreText: { fontSize: 13, fontWeight: '800' },
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
