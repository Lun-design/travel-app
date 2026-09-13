# 一鍵匯入行程 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支援使用者從純文字、AI 整理的 Markdown 行程或 `.ics` 檔案解析完整日期、Day 與景點，預覽後選擇目標行程並安全合併。

**Architecture:** 所有來源先轉成 `ImportedTripDraft`，再由純函式完成日期補齊、目標行程映射與去重，最後透過既有 Supabase itinerary API 批次寫入。UI 只負責來源輸入、預覽、目標行程與確認；Weather、Packing、Recommendation、分帳核心邏輯維持不變，匯入完成只觸發既有 reload/refetch。

**Tech Stack:** React Native/Expo Router、TypeScript、Vitest、Supabase、既有 `lib/ai-parser.ts` 與 `lib/itinerary-api.ts`。

---

## 檔案與責任邊界

- Create: `lib/markdown-itinerary-parser.ts` — 通用純文字／Markdown 解析，不綁定城市或景點。
- Create: `lib/ics-import.ts` — ICS 行事曆事件解析與時區／全天事件處理。
- Create: `lib/itinerary-import.ts` — 標準資料契約、來源辨識、日期／Day 對應、合併去重與 safe payload。
- Create: `src/components/ItineraryImportModal.tsx` — 匯入 UI、預覽、目標行程與確認狀態。
- Modify: `src/app/trips/[id].tsx` — 入口按鈕、Modal、匯入成功後 reload。
- Modify: `tests/itinerary-import.test.ts` — 純函式與合併流程測試。
- Create: `tests/ics-import.test.ts` — ICS 解析測試。
- Modify: `tests/trip-detail-modules.test.ts` 或新增 UI 測試 — Modal 互動與 reload callback。

## Task 1: 建立標準資料契約與紅燈測試

**Files:**
- Create: `tests/itinerary-import.test.ts`
- Create: `tests/ics-import.test.ts`
- Create: `lib/itinerary-import.ts`

- [ ] **Step 1: 寫標準化解析與日期補齊的失敗測試**

```ts
import { describe, expect, it } from 'vitest';
import { normalizeImportedText, mapDraftToTargetTrip, mergeImportedItems } from '../lib/itinerary-import';

describe('itinerary import contract', () => {
  it('normalizes any destination and builds every day in an inclusive date range', () => {
    const draft = normalizeImportedText('巴黎 3 天\n2027/04/10～2027/04/12\n04/10｜羅浮宮');
    expect(draft.title).toContain('巴黎');
    expect(draft.days.map((day) => day.dayNumber)).toEqual([1, 2, 3]);
    expect(draft.days.map((day) => day.date)).toEqual(['2027-04-10', '2027-04-11', '2027-04-12']);
  });

  it('maps date-less items from a selected target day without changing existing items', () => {
    const mapped = mapDraftToTargetTrip({ days: [{ dayNumber: 1, items: [{ title: 'Museum' }] }], warnings: [] }, { startDate: '2027-04-10', dayOffset: 2 });
    expect(mapped[0]).toMatchObject({ day_number: 3, location_name: 'Museum' });
  });

  it('deduplicates by date, title and start time', () => {
    const merged = mergeImportedItems(
      [{ id: 'existing', day_number: 1, location_name: 'Museum', time: '10:00' }],
      [{ location_name: ' Museum ', day_number: 1, time: '10:00' }, { location_name: 'Museum', day_number: 1, time: '11:00' }],
    );
    expect(merged.added).toHaveLength(1);
    expect(merged.skipped).toHaveLength(1);
  });
});
```

- [ ] **Step 2: 寫 ICS 解析的失敗測試**

```ts
import { describe, expect, it } from 'vitest';
import { parseIcsCalendar } from '../lib/ics-import';

describe('ics itinerary import', () => {
  it('parses timed, all-day and cross-midnight events', () => {
    const draft = parseIcsCalendar([
      'BEGIN:VCALENDAR',
      'BEGIN:VEVENT', 'UID:a', 'DTSTART;TZID=Asia/Tokyo:20261023T103000', 'DTEND;TZID=Asia/Tokyo:20261023T120000', 'SUMMARY:Universal Studios Japan', 'LOCATION:大阪市此花區', 'END:VEVENT',
      'BEGIN:VEVENT', 'UID:b', 'DTSTART;VALUE=DATE:20261024', 'SUMMARY:自由活動', 'END:VEVENT',
      'END:VCALENDAR',
    ].join('\r\n'));
    expect(draft.days).toHaveLength(2);
    expect(draft.days[0].items[0]).toMatchObject({ title: 'Universal Studios Japan', startTime: '10:30', durationMinutes: 90, address: '大阪市此花區' });
    expect(draft.days[1].items[0].startTime).toBeUndefined();
  });
});
```

- [ ] **Step 3: 執行測試確認紅燈**

Run: `npx vitest run tests/itinerary-import.test.ts tests/ics-import.test.ts`

Expected: FAIL because the parser functions are not implemented.

## Task 2: 實作通用 Markdown／純文字解析器

**Files:**
- Create: `lib/markdown-itinerary-parser.ts`
- Modify: `lib/itinerary-import.ts`
- Test: `tests/itinerary-import.test.ts`

- [ ] **Step 1: 實作輸入正規化與日期／標題辨識**

`ImportedItemDraft`、`ImportedDayDraft` 與 `ImportedTripDraft` 的唯一定義放在 `lib/itinerary-import.ts`，`parseMarkdownItinerary` 只匯入並回傳該契約：

```ts
import type { ImportedTripDraft } from './itinerary-import';

export function parseMarkdownItinerary(input: string, referenceDate?: string): ImportedTripDraft;
```

The parser will normalize full-width punctuation, Markdown emphasis, bullets and line breaks; support `YYYY/MM/DD`, `YYYY-MM-DD`, `MM/DD`, `MM 月 DD 日`, `Day N`, Chinese／English weekday labels, `HH:mm～HH:mm`, and relative periods such as 上午／下午／晚上. It will preserve unknown text as notes instead of inventing exact times.

- [ ] **Step 2: Reuse existing AI parser for short booking lines**

Call `parseFlightText` for flight-shaped lines and `parseItineraryNote` for short natural-language lines. Map their results into `ImportedItemDraft`; never hardcode Osaka or any other destination.

- [ ] **Step 3: Implement inclusive date range and missing-day filling**

Use UTC date arithmetic to avoid local DST shifts. For a range, generate every calendar date; create empty days for gaps; assign headings and items to matching dates. Add warnings for invalid dates or ambiguous year-only dates.

- [ ] **Step 4: Run parser tests**

Run: `npx vitest run tests/itinerary-import.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit parser changes**

```bash
git add lib/markdown-itinerary-parser.ts lib/itinerary-import.ts tests/itinerary-import.test.ts
git commit -m "feat: 新增通用文字行程解析器"
```

## Task 3: 實作 ICS 解析器

**Files:**
- Create: `lib/ics-import.ts`
- Test: `tests/ics-import.test.ts`

- [ ] **Step 1: 實作 ICS unfolding 與欄位解析**

```ts
export function parseIcsCalendar(input: string): ImportedTripDraft;
```

Unfold continuation lines, parse `SUMMARY`, `DESCRIPTION`, `LOCATION`, `DTSTART`, `DTEND`, `TZID`, `VALUE=DATE` and escaped text. Convert timed events to `HH:mm` and duration minutes; preserve all-day events without a fabricated time; clamp cross-midnight duration to the actual date span. Invalid events become warnings while valid events remain importable.

- [ ] **Step 2: Run ICS tests**

Run: `npx vitest run tests/ics-import.test.ts`

Expected: PASS.

- [ ] **Step 3: Commit ICS changes**

```bash
git add lib/ics-import.ts tests/ics-import.test.ts
git commit -m "feat: 支援 ICS 行程匯入解析"
```

## Task 4: 實作來源辨識、日期映射、去重與 safe payload

**Files:**
- Modify: `lib/itinerary-import.ts`
- Test: `tests/itinerary-import.test.ts`

- [ ] **Step 1: 實作來源辨識與標準解析入口**

```ts
export type ImportSource = 'text' | 'ics';
export function parseImportSource(input: string, source: ImportSource): ImportedTripDraft;
```

Use `parseIcsCalendar` for ICS and `parseMarkdownItinerary` plus existing AI helpers for text. Return warnings, never throw for a single malformed line.

- [ ] **Step 2: 實作目標行程映射**

```ts
export type ImportTarget = { startDate: string; dayOffset: number };
export function mapDraftToTargetTrip(draft: ImportedTripDraft, target: ImportTarget): Array<{
  location_name: string;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  day_number: number;
  time: string | null;
  duration_minutes: number | null;
  category: string;
  notes: string | null;
}>;
```

If a source date exists, map it relative to the selected target start date; otherwise apply `dayOffset`. Normalize empty strings to `null`, retain user-provided addresses, and use `spot` as the safe category fallback.

- [ ] **Step 3: 實作去重與預覽摘要**

```ts
export function mergeImportedItems(existing: readonly { id?: string; day_number: number; location_name: string; time?: string | null }[], incoming: readonly { day_number: number; location_name: string; time?: string | null }[]): { added: typeof incoming; skipped: typeof incoming };
```

Normalize whitespace/case for comparison. The dedupe key is `day_number + normalized title + HH:mm`; same title at a different time remains importable.

- [ ] **Step 4: Persist safe payloads with sequential error collection**

Keep persistence in the page/modal boundary: call the existing `saveItineraryItem` once per safe payload, collect `{ saved, failed }`, and continue after an individual failure. Do not modify Weather/Packing/Recommendation internals. The caller must await the existing `reload` after all writes finish.

- [ ] **Step 5: Run merge tests and commit**

Run: `npx vitest run tests/itinerary-import.test.ts`

Expected: PASS.

```bash
git add lib/itinerary-import.ts lib/itinerary-api.ts tests/itinerary-import.test.ts
git commit -m "feat: 新增行程匯入合併與去重流程"
```

## Task 5: 建立 ItineraryImportModal

**Files:**
- Create: `src/components/ItineraryImportModal.tsx`
- Create or modify: `tests/itinerary-import-modal.test.tsx`

- [ ] **Step 1: 建立 UI interaction tests**

Cover source switching, text input, `.ics` file selection, target trip selection, day offset, preview counts, confirm disabled while parsing/saving, error display, and successful `onImported` callback.

- [ ] **Step 2: 實作 Modal state machine**

Use states `input → preview → saving → result`. Props:

```ts
type ItineraryImportModalProps = {
  visible: boolean;
  currentTripId: string;
  trips: Array<{ id: string; title: string; start_date: string; end_date: string }>;
  onClose: () => void;
  onImported: (summary: { targetTripId: string; saved: number; skipped: number; failed: number }) => Promise<void>;
};
```

The modal will use a `TextInput` for A/C content, a browser file input only on web for B, and a target-trip picker. It will display parsed days/items and warnings before any mutation. No external AI request is required.

- [ ] **Step 3: Run UI tests and commit**

Run: `npx vitest run tests/itinerary-import-modal.test.tsx`

Expected: PASS.

```bash
git add src/components/ItineraryImportModal.tsx tests/itinerary-import-modal.test.tsx
git commit -m "feat: 新增一鍵匯入行程預覽視窗"
```

## Task 6: Integrate into trip detail page

**Files:**
- Modify: `src/app/trips/[id].tsx`
- Modify: `tests/trip-detail-modules.test.ts` or `tests/itinerary-import-modal.test.tsx`

- [ ] **Step 1: Add entry button and modal state**

Add `importVisible` state and a 44px touch target labelled `📥 一鍵匯入行程`. Pass the current trip and available trips into `ItineraryImportModal`.

- [ ] **Step 2: Wire batch save and reload**

On confirm, call `mapDraftToTargetTrip`, filter duplicates against the selected trip's current items, persist safe payloads, then await the existing `reload()` before closing. Keep the selected Day and force a fresh item array so Timeline renders the imported items immediately.

- [ ] **Step 3: Add parent integration test**

Render the page with a mocked import callback, confirm an item, and assert the save helper plus `reload` are called and the imported item appears in the selected Day view.

- [ ] **Step 4: Run focused integration tests and commit**

Run: `npx vitest run tests/itinerary-import-modal.test.tsx tests/trip-detail-modules.test.ts`

Expected: PASS.

```bash
git add "src/app/trips/[id].tsx" tests/trip-detail-modules.test.ts tests/itinerary-import-modal.test.tsx
git commit -m "feat: 串接行程匯入與時間軸即時刷新"
```

## Task 7: Full quality gate

**Files:** no additional source changes unless a failing test identifies a concrete contract mismatch.

- [ ] **Step 1: Run all tests**

Run: `npm test`

Expected: all existing tests plus import tests pass.

- [ ] **Step 2: Run type checking**

Run: `npm run type-check`

Expected: `tsc --noEmit` exits with code 0.

- [ ] **Step 3: Run production build verification**

Run: `npm run verify:build`

Expected: existing `dist` output verification passes. If a clean build is required, run `npm run build` first.

- [ ] **Step 4: Review scope and final commit**

Run: `git diff --check` and `git status --short`; verify no Weather, Packing, Recommendation or expense core files were changed. Use a Traditional Chinese Conventional Commit message for any final correction.
