import { describe, expect, it, vi } from 'vitest';
import { normalizeImportedText } from '../lib/itinerary-import';
import { enrichImportedItems, runItineraryImport, clearImportedItinerary, sanitizeImportItems } from '../lib/itinerary-import-service';

describe('import parsing regressions', () => {
  it('uses heading context for unnamed activities and keeps duration prose out of clocks', () => {
    const draft = normalizeImportedText(`大阪｜2026/10/25～10/26
10/25｜租和服、住吉大社互拍
- 10:30～12:00：心齋橋租和服，挑款式、換裝與整理髮型。
- 13:30～15:30：參拜、兩人互拍，重點拍紅橋。
10/26｜海遊館、天保山
- 上午逛海遊館，預留約 2～3 小時。
- 怕排隊可考慮加購快速通關，入場門票須另外購買。
- 當天不安排遠程景點，保留交通與報到時間。
- 預估時間約 2～3 小時。`);
    expect(draft.days[0].items.map(i => i.title)).toEqual(['心齋橋租和服', '住吉大社']);
    expect(draft.days[0].items[1]).toMatchObject({ startTime: '13:30', durationMinutes: 120 });
    expect(draft.days[1].items).toHaveLength(1);
    expect(draft.days[1].items[0]).toMatchObject({ title: '海遊館', durationMinutes: 180 });
    expect(draft.days[1].items[0].startTime).not.toBe('02:00');
  });
  it('gives breakfast/checkout a time before airport arrival without moving the flight', () => {
    const draft = normalizeImportedText(`大阪｜2026/10/28～10/28
10/28｜返回台灣
- 早餐、退房，前往關西機場。
- 目標 12:30 前抵達搭機航廈。
- 15:30 起飛，返回桃園。`);
    const [breakfast, airport, flight] = draft.days[0].items;
    expect(breakfast.startTime).toBeDefined();
    expect(breakfast.startTime! < '12:30').toBe(true);
    expect(airport.startTime).toBe('12:30');
    expect(flight.startTime).toBe('15:30');
    expect(breakfast.notes).toContain('退房');
  });
  it('keeps explicit times, supports ASCII ranges, and never treats admission numbers as clocks', () => {
    const draft = normalizeImportedText('City break\nDay 1\n- 09:00~10:30 Museum\n- 下午參觀第 2 美術館');
    expect(draft.days[0].items[0]).toMatchObject({ title: 'Museum', startTime: '09:00', durationMinutes: 90 });
    expect(draft.days[0].items[1].title).toBe('第 2 美術館');
    expect(draft.days[0].items[1].startTime).not.toBe('02:00');
  });
  it('does not silently discard a single-line booking or a first Day heading', () => {
    expect(normalizeImportedText('BR178 06:30-10:10 TPE to KIX').days[0].items[0].category).toBe('flight');
    expect(normalizeImportedText('Day 1\n09:00 Museum').days[0].items[0].title).toBe('Museum');
  });

  it('merges abstract actions into a nearby place instead of creating empty map cards', () => {
    const draft = normalizeImportedText(`大阪｜2026/10/23～10/23
10/23｜黑門市場、難波、道頓堀
- 10:00 到黑門市場逛街、吃早午餐。
- 下午入住飯店、補眠休息。
- 晚上逛道頓堀、吃晚餐。
- 找咖啡廳休息。`);
    const items = draft.days[0].items;
    expect(items.map(item => item.title)).toEqual(['黑門市場', '道頓堀']);
    expect(items[0].notes).toContain('吃早午餐');
    expect(items[1].notes).toContain('吃晚餐');
    expect(items.some(item => /早餐|晚餐|飯店|咖啡廳/.test(item.title))).toBe(false);
  });

  it('advances inferred times from the previous stop duration', () => {
    const draft = normalizeImportedText(`大阪｜2026/10/24～10/24
10/24｜梅田逛街、空中庭園夜景
- 10:00 到大丸、LUCUA。
- 下午找咖啡廳休息。
- 傍晚到梅田空中庭園，看夕景。`);
    const items = draft.days[0].items;
    expect(items.map(item => item.title)).toEqual(['大丸', '梅田空中庭園']);
    expect(items[1].startTime! > items[0].startTime!).toBe(true);
    expect(new Set(items.map(item => item.startTime)).size).toBe(items.length);
  });

  it('recognizes month-day headers with weekday and full-width pipe as separate days', () => {
    const draft = normalizeImportedText(`大阪 6 天 5 夜｜2026/10/23～10/28
**10/23（五）｜黑門市場、難波、道頓堀**
- 06:00 抵達關西機場，入境後前往市區。
**10/24（六）｜梅田逛街、空中庭園夜景**
- 上午吃早餐，前往梅田。
**10/25（日）｜租和服、住吉大社互拍**
- 10:30～12:00：心齋橋租和服。`);
    expect(draft.days.map(day => day.items.length)).toEqual([1, 1, 1, 0, 0, 0]);
    expect(draft.days[0].date).toBe('2026-10-23');
    expect(draft.days[1].date).toBe('2026-10-24');
    expect(draft.days[2].date).toBe('2026-10-25');
    expect(draft.days[1].items[0].title).toContain('梅田');
  });

  it('also recognizes ASCII pipe date headings', () => {
    const draft = normalizeImportedText(`東京｜2026/11/01～11/02
11/01 (日) | 淺草
- 09:00 淺草寺
11/02 | 台場
- 10:00 teamLab`);
    expect(draft.days[0].date).toBe('2026-11-01');
    expect(draft.days[1].date).toBe('2026-11-02');
    expect(draft.days[1].items[0].title).toBe('teamLab');
  });

  it('merges adjacent repeats of the same place after inferred activities are removed', () => {
    const draft = normalizeImportedText(`大阪｜2026/10/25～10/25
10/25（日）｜住吉大社
- 12:00 午餐、前往住吉大社。
- 13:30～15:30：參拜、兩人互拍。`);
    expect(draft.days[0].items.map(item => item.title)).toEqual(['住吉大社']);
    expect(draft.days[0].items[0].durationMinutes).toBeGreaterThanOrEqual(210);
  });

  it('filters transition actions and keeps only navigable place entities', () => {
    const draft = normalizeImportedText(`大阪｜2026/10/23～10/23
10/23｜難波、梅田、道頓堀
- 起床、整理行李。
- 06:30 飯店寄放行李，購買交通票券。
- 從難波搭車前往梅田。
- 10:00 梅田大丸逛街。
- 14:00 道頓堀吃晚餐。
- 晚上搭車回飯店休息。`);
    const titles = draft.days[0].items.map(item => item.title);
    expect(titles).toEqual(['梅田大丸', '道頓堀']);
    expect(titles.some(title => /起床|行李|搭車|飯店|票券|休息/.test(title))).toBe(false);
    expect(draft.days[0].items[1].notes).toContain('吃晚餐');
  });
});

const item = { location_name: '海遊館', address: null, latitude: null, longitude: null, day_number: 1, time: '09:00', duration_minutes: 60, category: 'spot', notes: null };
const place = { title: '海遊館', displayName: '日本大阪市港區海岸通', latitude: 34.65, longitude: 135.42 };

describe('import enrichment and mutations', () => {
  it('sanitizes transition-only payloads before any RPC write', () => {
    expect(sanitizeImportItems([
      { ...item, location_name: '購買交通票券' },
      { ...item, location_name: '梅田大丸' },
      { ...item, location_name: '從難波搭車前往梅田' },
    ]).map(entry => entry.location_name)).toEqual(['梅田大丸']);
  });
  it('enriches with destination context, caches repeated places, and preserves coordinates', async () => {
    const search = vi.fn().mockResolvedValue([place]);
    const input = [item, { ...item, day_number: 2 }, { ...item, latitude: 0, longitude: 0 }];
    const result = await enrichImportedItems(input, '大阪', search);
    expect(search).toHaveBeenCalledExactlyOnceWith('大阪 海遊館');
    expect(result.items[0]).toMatchObject({ latitude: 34.65, longitude: 135.42, address: place.displayName });
    expect(result.items[2].latitude).toBe(0);
    expect(input[0].latitude).toBeNull();
  });
  it('reports missing or failed geocoding without inventing coordinates', async () => {
    const result = await enrichImportedItems([item], '大阪', vi.fn().mockRejectedValue(new Error('offline')));
    expect(result.items[0].latitude).toBeNull();
    expect(result.unresolved).toEqual(['海遊館']);
  });
  it('does not attach the first unrelated result to a named attraction', async () => {
    const result = await enrichImportedItems([item], '大阪', vi.fn().mockResolvedValue([{ ...place, title: '大阪市', displayName: '大阪市' }]));
    expect(result.items[0].latitude).toBeNull();
  });
  it('enriches before one atomic overwrite call and returns fresh server items', async () => {
    const events: string[] = [];
    const rpc = vi.fn(async (_name, args) => { events.push('rpc'); return { data: { items: [{ ...args.p_items[0], id: 'new' }], saved: 1, skipped: 0, removed: 3 }, error: null }; });
    const result = await runItineraryImport({ tripId: 'target', mode: 'overwrite', items: [item], destination: '大阪', dayCount: 6 }, {
      search: async () => { events.push('search'); return [place]; }, rpc,
    });
    expect(events).toEqual(['search', 'rpc']);
    expect(rpc).toHaveBeenCalledWith('import_itinerary_items', expect.objectContaining({ p_trip_id: 'target', p_mode: 'overwrite', p_day_count: 6 }));
    expect(result.items[0]).toMatchObject({ id: 'new', latitude: 34.65 });
  });
  it('refuses empty overwrite and surfaces transaction errors without sequential delete fallback', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'permission denied' } });
    await expect(runItineraryImport({ tripId: 'target', mode: 'overwrite', items: [], destination: '', dayCount: 1 }, { search: vi.fn(), rpc })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
    await expect(runItineraryImport({ tripId: 'target', mode: 'overwrite', items: [item], destination: '', dayCount: 1 }, { search: vi.fn().mockResolvedValue([]), rpc })).rejects.toThrow('permission denied');
    expect(rpc).toHaveBeenCalledTimes(1);
  });
  it('clears only the specified trip through the atomic endpoint', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { items: [], saved: 0, skipped: 0, removed: 4 }, error: null });
    expect((await clearImportedItinerary('target', rpc)).removed).toBe(4);
    expect(rpc).toHaveBeenCalledWith('import_itinerary_items', { p_trip_id: 'target', p_mode: 'clear', p_items: [], p_day_count: 0 });
    await expect(clearImportedItinerary('', rpc)).rejects.toThrow();
  });
});
