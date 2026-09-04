# 行程營業時間與碰撞預警 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 為行程時間軸加入每日出發時間、停留與交通推算、每週營業時間判斷，以及時間重疊與關門預警。

**Architecture:** Supabase 只儲存 `trips.default_departure_time` 與 `itinerary_items.opening_hours` 設定；`lib/schedule.ts` 以純函式計算每站排程與警告。時間軸在載入後使用同一排程結果渲染卡片，排序、編輯或重新載入後自然重新計算。

**Tech Stack:** Expo Router、React Native、Supabase PostgreSQL、TypeScript、Vitest。

---

### Task 1: 定義排程純邏輯與失敗測試

**Files:**
- Create: `tests/schedule.test.ts`
- Create: `lib/schedule.ts`

- [ ] **Step 1: Write the failing tests**

涵蓋第一站時間回退、後續站交通與停留推算、`null` duration、重疊，以及每日營業時段、公休、多時段與跨午夜。

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `npm.cmd test -- tests/schedule.test.ts`
Expected: FAIL because `lib/schedule.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure functions**

提供 `parseOpeningHours`、`isOpenAt`、`buildDaySchedule` 與輸出型別；以 UTC 日期與分鐘整數計算，duration null 使用 60。

- [ ] **Step 4: Run focused and existing itinerary tests**

Run: `npm.cmd test -- tests/schedule.test.ts tests/itinerary.test.ts`
Expected: all tests pass.

### Task 2: Migration 與前端資料型別/API

**Files:**
- Create: `supabase/migrations/20260903130000_itinerary_schedule_warnings.sql`
- Modify: `lib/itinerary.ts`
- Modify: `lib/trips.ts`

- [ ] **Step 1: Add the migration**

以 `if not exists` 新增 `trips.default_departure_time time`、`itinerary_items.opening_hours jsonb`，並將 `duration_minutes` 的資料庫 default 設為 60（不修改既有 null）。

- [ ] **Step 2: Extend shared types and trip save payloads**

新增 `OpeningHours` 型別、`opening_hours` 與 `default_departure_time` 欄位；現有 API 將欄位原樣傳遞。

- [ ] **Step 3: Run TypeScript check**

Run: `npx.cmd tsc --noEmit`
Expected: exit 0.

### Task 3: 編輯 Modal 的時間設定

**Files:**
- Modify: `src/components/ItineraryItemModal.tsx`
- Create: `src/components/TripSettingsModal.tsx`
- Modify: `src/components/CreateTripModal.tsx`
- Modify: `lib/trips.ts`

- [ ] **Step 1: Add a default departure time input to trip settings**

輸入 `HH:mm`，空白送 null；開啟 Modal 時載入既有值。

- [ ] **Step 2: Add weekly opening-hours editor to itinerary item advanced fields**

提供週一至週日公休切換與最多兩個 `open`/`close` 時段；輸入不完整時送 null，儲存為符合 `OpeningHours` 的 jsonb。

- [ ] **Step 3: Run TypeScript check**

Run: `npx.cmd tsc --noEmit`
Expected: exit 0.

### Task 4: 時間軸警告 UI

**Files:**
- Modify: `src/components/ItineraryTimeline.shared.tsx`
- Modify: `src/components/ItineraryTimeline.tsx`
- Modify: `src/components/ItineraryTimeline.web.tsx`
- Modify: `src/components/ItineraryTimeline.native.tsx`
- Modify: `src/app/trips/[id].tsx`

- [ ] **Step 1: Pass schedule context into the timeline**

傳入旅程起始日期、每日出發時間與當日排序景點；timeline 呼叫 `buildDaySchedule`。

- [ ] **Step 2: Render arrival/departure and warning badges**

黃色顯示 `⚠️ 抵達時景點可能已休息`，紅色顯示 `❌ 行程時間重疊`；不影響既有編輯、刪除、拖曳操作。

- [ ] **Step 3: Re-run unit tests and type check**

Run: `npm.cmd test` and `npx.cmd tsc --noEmit`
Expected: all tests pass and TypeScript exits 0.

### Task 5: Final verification

**Files:**
- No additional files.

- [ ] **Step 1: Check patch whitespace and status**

Run: `git diff --check` and `git status --short`.

- [ ] **Step 2: Verify the Web server responds**

Run: `Invoke-WebRequest -UseBasicParsing http://localhost:8082/trips/test-id`.
Expected: HTTP 200 while preserving the running Expo process.
