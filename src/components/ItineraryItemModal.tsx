import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { ItineraryItem, OpeningHours } from '@/lib/itinerary';
import { canAutocompletePlaces, createDebouncedGeocodingSearch, fetchOverpassOpeningHours, getGeocodingAttribution, searchPlaces, type GeocodingResult } from '@/lib/geocoding';
import { fetchGooglePlaceDetails, hasGooglePlacesApiKey, searchGooglePlaces } from '@/lib/google-places';
import { formatFlightRoute, formatFlightTitle, formatTimeHHmm, parseFlightText, parseItineraryNote } from '@/lib/ai-parser';
import { tripDayNumberForDate } from '@/lib/trip-dates';
import { ManualLocationMap } from './ManualLocationMap';
import { OpeningHoursEditor } from './OpeningHoursEditor';

const categories = ['spot', 'food', 'hotel', 'flight', 'trail', 'outdoor'];
type AutoHoursStatus = 'idle' | 'loading' | 'found' | 'missing';

type Props = {
  visible: boolean;
  item?: ItineraryItem | null;
  day: number;
  tripStartDate?: string;
  tripEndDate?: string;
  tripId: string;
  userId: string;
  onClose: () => void;
  onSave: (data: any) => Promise<void>;
  onDelete?: () => Promise<void>;
};

export function ItineraryItemModal({ visible, item, day, tripStartDate, tripEndDate, tripId, userId, onClose, onSave, onDelete }: Props) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [time, setTime] = useState('');
  const [category, setCategory] = useState('spot');
  const [duration, setDuration] = useState('');
  const [openingHours, setOpeningHours] = useState<OpeningHours | null>(null);
  const [autoHoursStatus, setAutoHoursStatus] = useState<AutoHoursStatus>('idle');
  const [difficulty, setDifficulty] = useState('');
  const [notes, setNotes] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [results, setResults] = useState<GeocodingResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState('');
  const [showMore, setShowMore] = useState(false);
  const [showAiInput, setShowAiInput] = useState(false);
  const [aiInput, setAiInput] = useState('');
  const [aiParsing, setAiParsing] = useState(false);
  const [aiMessage, setAiMessage] = useState('');
  const [parsedDate, setParsedDate] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState(day);
  const [saving, setSaving] = useState(false);
  const suppressNextSearch = useRef(false);
  const searchController = useRef(createDebouncedGeocodingSearch(searchPlaces, 400));
  const autocompleteEnabled = canAutocompletePlaces();

  useEffect(() => {
    if (!visible) return;
    setName(item?.location_name ?? '');
    setAddress(item?.address ?? '');
    setTime(formatTimeHHmm(item?.time) ?? item?.time ?? '');
    setCategory(item?.category ?? 'spot');
    setDuration(item?.duration_minutes ? String(item.duration_minutes) : '');
    setOpeningHours(item?.opening_hours ?? null);
    setAutoHoursStatus(item?.opening_hours ? 'found' : 'idle');
    setDifficulty(item?.difficulty ?? '');
    setNotes(item?.notes ?? '');
    setLat(item?.latitude ?? null);
    setLng(item?.longitude ?? null);
    setResults([]);
    setSearchMessage('');
    setShowMore(false);
    setShowAiInput(false);
    setAiInput('');
    setAiParsing(false);
    setAiMessage('');
    setParsedDate(null);
    setSelectedDay(item?.day_number ?? day);
    setSaving(false);
    searchController.current.cancel();
  }, [visible, item, day]);

  useEffect(() => {
    if (!visible || !autocompleteEnabled) return;
    if (suppressNextSearch.current) {
      suppressNextSearch.current = false;
      return;
    }
    if (name.trim().length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    setSearchMessage('');
    searchController.current.schedule(name, (nextResults) => {
      setResults(nextResults);
      setSearching(false);
      setSearchMessage(nextResults.length ? '' : '找不到結果，請確認名稱或手動調整地圖位置。');
    }, (error) => {
      setSearching(false);
      setSearchMessage(error instanceof Error ? error.message : '搜尋失敗，請稍後再試。');
    });
    return () => searchController.current.cancel();
  }, [autocompleteEnabled, name, visible]);

  async function search() {
    if (name.trim().length < 2) {
      setSearchMessage('請輸入至少 2 個字元再搜尋。');
      return;
    }
    searchController.current.cancel();
    setSearching(true);
    setSearchMessage('');
    try {
      const nextResults = await searchPlaces(name);
      setResults(nextResults);
      setSearchMessage(nextResults.length ? '' : '找不到結果，請確認名稱或手動調整地圖位置。');
    } catch (error) {
      setSearchMessage(error instanceof Error ? error.message : '搜尋失敗，請稍後再試。');
    } finally {
      setSearching(false);
    }
  }

  async function chooseResult(result: GeocodingResult): Promise<boolean> {
    let selectedResult = result;
    if (result.provider === 'google' && result.googlePlaceId) {
      setSearching(true);
      setSearchMessage('正在載入 Google Places 詳細資料…');
      try {
        selectedResult = await fetchGooglePlaceDetails(result.googlePlaceId);
      } catch (error) {
        console.warn('[ItineraryItemModal] Google Place details lookup failed', error);
        setSearching(false);
        setSearchMessage('Google 景點詳細資料取得失敗，請稍後再試或改用其他結果。');
        return false;
      }
      setSearching(false);
    }
    suppressNextSearch.current = true;
    setName(selectedResult.title);
    setAddress(selectedResult.displayName);
    setLat(Number.isFinite(selectedResult.latitude) ? selectedResult.latitude : null);
    setLng(Number.isFinite(selectedResult.longitude) ? selectedResult.longitude : null);
    setOpeningHours(selectedResult.openingHours ?? null);
    setAutoHoursStatus(selectedResult.openingHours ? 'found' : 'idle');
    setResults([]);
    if (selectedResult.openingHours) {
      setSearchMessage('已自動帶入地圖與營業時間。');
      return true;
    }
    if (selectedResult.provider === 'google') {
      setAutoHoursStatus('missing');
      setSearchMessage('Google 尚未提供營業時間，您可以在下方手動設定。');
      return true;
    }
    try {
      const overpassHours = await fetchOverpassOpeningHours(selectedResult);
      if (overpassHours) {
        setOpeningHours(overpassHours);
        setAutoHoursStatus('found');
        setSearchMessage('已透過 OSM 補充帶入營業時間。');
      } else {
        setAutoHoursStatus('missing');
        setSearchMessage('已自動帶入地圖位置；未找到營業時間，可手動設定。');
      }
    } catch (error) {
      console.warn('[ItineraryItemModal] Overpass opening-hours lookup skipped', error);
      setAutoHoursStatus('missing');
      setSearchMessage('已帶入地圖位置；營業時間查詢暫時不可用，可手動設定。');
    }
    return true;
  }

  async function save() {
    if (saving) return;
    if (!name.trim()) {
      Alert.alert('欄位未完成', '請輸入景點名稱。');
      return;
    }
    const payload = {
      ...(item?.id ? { id: item.id } : {}),
      trip_id: tripId,
      created_by: item?.created_by ?? userId,
      day_number: selectedDay,
      location_name: name.trim(),
      address: address.trim() || null,
      time: formatTimeHHmm(time) ?? (time.trim() || null),
      category,
      duration_minutes: duration ? Number(duration) : null,
      opening_hours: openingHours,
      difficulty: category === 'trail' ? difficulty || null : null,
      notes: notes.trim() || null,
      latitude: lat,
      longitude: lng,
    };

    setSaving(true);
    try {
      await onSave(payload);
      onClose();
    } catch (error) {
      console.error('[ItineraryItemModal] save failed', error);
      const message = error instanceof Error && error.message ? error.message : '景點儲存失敗，請稍後再試。';
      Alert.alert('儲存失敗', message);
    } finally {
      setSaving(false);
    }
  }

  function syncParsedDate(date: string | null): { status: 'none' | 'mapped' | 'unavailable' | 'outside'; day: number | null } {
    if (!date) return { status: 'none', day: null };
    setParsedDate(date);
    if (!tripStartDate) return { status: 'unavailable', day: null };
    const mappedDay = tripDayNumberForDate(date, tripStartDate, tripEndDate);
    if (!mappedDay) return { status: 'outside', day: null };
    setSelectedDay(mappedDay);
    return { status: 'mapped', day: mappedDay };
  }

  async function parseAiInput() {
    const text = aiInput.trim();
    if (!text) {
      setAiMessage('請先貼上航班簡訊或輸入行程速記');
      return;
    }

    setAiParsing(true);
    setAiMessage('');
    setParsedDate(null);
    const flight = parseFlightText(text);
    if (flight) {
      const dateResult = syncParsedDate(flight.departureDate);
      suppressNextSearch.current = true;
      setCategory('flight');
      setSearchMessage('');
      setResults([]);
      setName(formatFlightTitle(flight));
      setTime(formatTimeHHmm(flight.departureTime) ?? '');
      setAddress(formatFlightRoute(flight) ?? '');
      if (flight.confirmationCode) setNotes(`確認碼：${flight.confirmationCode}`);
      const dateLabel = flight.departureDate ? `（${flight.departureDate}）` : '';
      const dateWarning = dateResult.status === 'outside' ? '；日期不在目前行程範圍，請確認 Day' : dateResult.status === 'unavailable' ? '；請確認此日期對應的 Day' : '';
      setAiMessage(`已解析航班 ${flight.flightNumber}${dateLabel}${flight.confirmationCode ? '，確認碼已寫入備註' : ''}${dateWarning}`);
      setAiParsing(false);
      return;
    }

    const note = parseItineraryNote(text);
    if (!note) {
      setAiMessage('無法辨識這段內容，請輸入包含日期、時間或景點的自然語句');
      setAiParsing(false);
      return;
    }

    const dateResult = syncParsedDate(note.date);
    if (note.time) setTime(formatTimeHHmm(note.time) ?? '');
    const locationName = note.locationName?.trim();
    if (!locationName) {
      const dateLabel = note.date ? `（日期：${note.date}）` : '';
      setAiMessage(note.time ? `已解析時間 ${note.time}${dateLabel}，但找不到景點名稱` : (note.date ? `已解析日期 ${note.date}，但找不到景點名稱` : '找不到可用的景點名稱'));
      setAiParsing(false);
      return;
    }

    suppressNextSearch.current = true;
    setName(locationName);
    setResults([]);
    setSearching(true);
    try {
      const choices = hasGooglePlacesApiKey() ? await searchGooglePlaces(locationName) : await searchPlaces(locationName);
      if (!choices.length) {
        setAiMessage(`找不到「${locationName}」，請手動調整地點或重新輸入`);
        return;
      }
      const applied = await chooseResult(choices[0]);
      if (applied) {
        const dateLabel = note.date ? `（${note.date}${dateResult.status === 'mapped' && dateResult.day ? `，已套用 Day ${dateResult.day}` : dateResult.status === 'outside' ? '，不在目前行程範圍' : '，請確認對應 Day'}）` : '';
        setAiMessage(`已帶入「${locationName}」的地址、座標與營業時間${dateLabel}`);
      } else {
        setAiMessage(`已解析「${locationName}」，但無法取得地點詳細資料`);
      }
    } catch (error) {
      console.warn('[ItineraryItemModal] AI place lookup failed', error);
      setAiMessage('景點搜尋失敗，請檢查網路或改用手動搜尋');
    } finally {
      setSearching(false);
      setAiParsing(false);
    }
  }

  const attribution = getGeocodingAttribution(results);

  return <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}>
      <Text style={styles.kicker}>DAY {selectedDay}</Text>
      <Text style={styles.title}>{item ? '編輯景點／活動' : '新增景點／活動'}</Text>

      <Text style={styles.label}>景點名稱</Text>
      <Pressable accessibilityRole="button" style={styles.aiToggle} onPress={() => { setShowAiInput((current) => !current); setAiMessage(''); }}>
        <Text style={styles.aiToggleText}>{showAiInput ? '收起 AI 快捷輸入' : '✨ AI 快捷輸入'}</Text>
      </Pressable>
      {showAiInput ? <View style={styles.aiPanel}>
        <Text style={styles.aiHint}>貼上航班簡訊、預訂單或行程速記</Text>
        <TextInput
          multiline
          value={aiInput}
          onChangeText={setAiInput}
          placeholder="例如：明天下午2點去吃饗食天堂"
          style={[styles.input, styles.aiInput]}
          textAlignVertical="top"
        />
        <Pressable accessibilityRole="button" style={[styles.aiParseButton, aiParsing && styles.aiParseButtonDisabled]} onPress={() => void parseAiInput()} disabled={aiParsing}>
          {aiParsing ? <ActivityIndicator color="white" /> : <Text style={styles.white}>解析並帶入</Text>}
        </Pressable>
        {aiMessage ? <Text style={styles.aiMessage}>{aiMessage}</Text> : null}
      </View> : null}
      <View style={styles.searchRow}>
        <TextInput style={[styles.input, styles.flex]} placeholder="例如：台北 101" value={name} onChangeText={setName} onSubmitEditing={() => void search()} returnKeyType="search" />
        <Pressable accessibilityRole="button" accessibilityLabel="搜尋景點" style={styles.search} onPress={() => void search()} disabled={searching}>{searching ? <ActivityIndicator color="white" /> : <Text style={styles.white}>搜尋</Text>}</Pressable>
      </View>
      {category !== 'flight' ? <Text style={styles.searchHint}>{autocompleteEnabled ? '停止輸入 400ms 後會自動搜尋；也可按搜尋。' : '可按 Enter 或搜尋按鈕查詢 OpenStreetMap。'}</Text> : null}
      {category !== 'flight' && results.length ? <View style={styles.results}>{results.map((result) => <Pressable key={result.id} style={styles.result} onPress={() => chooseResult(result)}><Text style={styles.resultTitle}>{result.title}</Text><Text style={styles.resultAddress} numberOfLines={2}>{result.displayName}</Text>{result.openingHours ? <Text style={styles.resultHours}>✓ 找到營業時間</Text> : null}</Pressable>)}<Text style={styles.attribution}>{attribution}</Text></View> : null}
      {category !== 'flight' && searchMessage ? <Text style={styles.searchMessage}>{searchMessage}</Text> : null}

      <Text style={styles.label}>地址</Text>
      <TextInput style={styles.input} placeholder="可由搜尋結果自動帶入" value={address} onChangeText={setAddress} />
      <Text style={styles.label}>開始時間（可選）</Text>
      <TextInput style={styles.input} placeholder="09:30" value={time} onChangeText={setTime} />
      {parsedDate ? <Text style={styles.parsedDateHint}>解析日期：{parsedDate}（儲存時將使用 Day {selectedDay}）</Text> : null}

      <Pressable style={styles.moreButton} onPress={() => setShowMore((current) => !current)}><Text style={styles.moreText}>{showMore ? '收合進階設定' : '展開進階設定（類別、停留、營業時間）'}</Text></Pressable>
      {showMore ? <View style={styles.morePanel}>
        <Text style={styles.label}>景點類型</Text>
        <View style={styles.chips}>{categories.map((value) => <Pressable key={value} onPress={() => setCategory(value)} style={[styles.chip, category === value && styles.selected]}><Text style={category === value ? styles.white : styles.chipText}>{value}</Text></Pressable>)}</View>
        {category === 'trail' ? <><Text style={styles.label}>步道難度</Text><View style={styles.chips}>{['easy', 'moderate', 'hard'].map((value) => <Pressable key={value} onPress={() => setDifficulty(value)} style={[styles.chip, difficulty === value && styles.selected]}><Text style={difficulty === value ? styles.white : styles.chipText}>{value}</Text></Pressable>)}</View></> : null}
        <Text style={styles.label}>預估停留時間（分鐘）</Text>
        <TextInput style={styles.input} placeholder="60" keyboardType="number-pad" value={duration} onChangeText={setDuration} />
        <View style={styles.hoursHeading}><Text style={styles.label}>每週營業時間</Text>{autoHoursStatus === 'loading' ? <Text style={styles.hoursLoading}>正在查詢 OSM 營業時間…</Text> : null}{autoHoursStatus === 'missing' ? <Text style={styles.hoursHint}>ℹ️ 該景點未登錄營業時間，可手動設定</Text> : null}</View>
        <OpeningHoursEditor value={openingHours} onChange={setOpeningHours} />
        <Text style={styles.label}>備註</Text>
        <TextInput style={[styles.input, styles.notes]} placeholder="例如：需要預約" multiline value={notes} onChangeText={setNotes} />
        <Text style={styles.label}>地圖 Marker（查無結果時可手動微調）</Text>
        <ManualLocationMap latitude={lat} longitude={lng} onChange={(latitude, longitude) => { setLat(latitude); setLng(longitude); }} />
      </View> : null}

      <View style={styles.actions}>
        <Pressable onPress={onClose}><Text style={styles.cancel}>取消</Text></Pressable>
        {item && onDelete ? <Pressable onPress={() => Alert.alert('刪除景點', '確定要刪除這個景點嗎？', [{ text: '取消' }, { text: '刪除', style: 'destructive', onPress: onDelete }])}><Text style={styles.delete}>刪除</Text></Pressable> : null}
        <Pressable style={[styles.save, saving && styles.saveDisabled]} onPress={() => void save()} disabled={saving}>{saving ? <ActivityIndicator color="white" /> : <Text style={styles.white}>儲存</Text>}</Pressable>
      </View>
    </ScrollView>
  </Modal>;
}

const styles = StyleSheet.create({
  container: { padding: 24, gap: 10, paddingBottom: 42 },
  kicker: { color: '#2563eb', letterSpacing: 1.5, fontWeight: '800' },
  title: { fontSize: 28, fontWeight: '800', color: '#0f172a', marginBottom: 5 },
  label: { color: '#334155', fontSize: 13, fontWeight: '700', marginTop: 6 },
  aiToggle: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: '#eef2ff', alignSelf: 'flex-start' },
  aiToggleText: { color: '#4338ca', fontSize: 13, fontWeight: '800' },
  aiPanel: { borderWidth: 1, borderColor: '#c7d2fe', borderRadius: 14, padding: 12, gap: 9, backgroundColor: '#f8faff' },
  aiHint: { color: '#475569', fontSize: 12 },
  aiInput: { minHeight: 88, textAlignVertical: 'top' },
  aiParseButton: { borderRadius: 11, paddingVertical: 11, alignItems: 'center', backgroundColor: '#4f46e5' },
  aiParseButtonDisabled: { opacity: 0.65 },
  aiMessage: { color: '#334155', fontSize: 12, lineHeight: 17 },
  parsedDateHint: { color: '#1d4ed8', fontSize: 12, fontWeight: '700' },
  input: { borderWidth: 1, borderColor: '#dbe2ea', borderRadius: 13, padding: 13, backgroundColor: '#f8fafc', fontSize: 15 },
  flex: { flex: 1 },
  searchRow: { flexDirection: 'row', gap: 8 },
  search: { minWidth: 66, backgroundColor: '#0f172a', borderRadius: 13, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 15 },
  searchHint: { color: '#64748b', fontSize: 12 },
  results: { borderWidth: 1, borderColor: '#bfdbfe', borderRadius: 13, overflow: 'hidden', backgroundColor: 'white' },
  result: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#dbeafe' },
  resultTitle: { color: '#0f172a', fontWeight: '800', marginBottom: 2 },
  resultAddress: { color: '#64748b', fontSize: 12, lineHeight: 17 },
  resultHours: { color: '#16a34a', fontSize: 12, fontWeight: '700', marginTop: 4 },
  attribution: { color: '#94a3b8', fontSize: 10, padding: 8, textAlign: 'right' },
  searchMessage: { color: '#475569', fontSize: 12 },
  moreButton: { marginTop: 5, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 13, backgroundColor: '#eff6ff' },
  moreText: { color: '#1d4ed8', fontWeight: '800' },
  morePanel: { gap: 10, paddingTop: 2 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderRadius: 20, paddingHorizontal: 13, paddingVertical: 9, backgroundColor: '#e2e8f0' },
  selected: { backgroundColor: '#2563eb' },
  chipText: { color: '#334155' },
  notes: { minHeight: 90, textAlignVertical: 'top' },
  hoursHeading: { gap: 4 },
  hoursLoading: { color: '#2563eb', fontSize: 12 },
  hoursHint: { color: '#64748b', fontSize: 12, lineHeight: 17 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 20, marginTop: 12 },
  cancel: { color: '#475569', fontWeight: '600' },
  delete: { color: '#dc2626', fontWeight: '700' },
  save: { backgroundColor: '#2563eb', borderRadius: 13, paddingHorizontal: 20, paddingVertical: 13 },
  saveDisabled: { opacity: 0.65 },
  white: { color: 'white', fontWeight: '800' },
});
