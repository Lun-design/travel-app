# 階段二行程管理與地圖介面 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 實作行程列表、Day 行程內頁、景點 CRUD、Nominatim 搜尋與 react-native-maps 路線。

**Architecture:** 將 Supabase 查詢封裝於 `lib/trips.ts`，純資料轉換與 Nominatim client 放在 `lib/`，畫面拆成列表、時間軸、Modal、地圖元件。頁面只負責狀態協調與錯誤呈現。

**Tech Stack:** Expo Router、React Native、react-native-maps、Supabase JS、OpenStreetMap Nominatim、Vitest。

---

### Task 1: 依測試建立純函式與 Nominatim client

**Files:** `lib/geocoding.ts`, `lib/itinerary.ts`, `tests/itinerary.test.ts`, `tests/geocoding.test.ts`

- [ ] 寫出 Nominatim JSON 解析、查無結果錯誤、Day 篩選排序與 Polyline 座標測試。
- [ ] 執行 `npm test` 確認先因模組不存在而失敗。
- [ ] 實作 `searchNominatim(query)`（按鈕觸發、User-Agent、結果映射）與 `filterAndSortItems`、`coordinatesForPolyline`。
- [ ] 執行 `npm test` 確認通過。

### Task 2: 擴充資料庫欄位 migration 與 Supabase 查詢層

**Files:** `supabase/migrations/20260903010000_extend_itinerary_items.sql`, `lib/trips.ts`

- [ ] Migration 新增 `duration_minutes`、`difficulty`，以新 constraint 支援 `trail`、`outdoor` 並保留既有資料。
- [ ] 建立 trips、items 的 list/get/create/update/delete 函式，所有操作使用既有 `supabase` client。
- [ ] 以 TypeScript 型別描述 Item 與 Trip，將錯誤原樣交給頁面呈現。

### Task 3: 安裝地圖套件與建立首頁／行程內頁

**Files:** `package.json`, `src/app/index.tsx`, `src/app/trips/[tripId].tsx`, `src/components/TripCard.tsx`, `src/components/TripListItem.tsx`, `src/components/DayTabs.tsx`, `src/components/ItineraryTimeline.tsx`, `src/components/TripMap.tsx`

- [ ] 安裝 `react-native-maps` 並建立混合式首頁，最近行程置頂卡片、其餘清單。
- [ ] 建立行程內頁，固定 Day tabs；上半部地圖、下半部時間軸。
- [ ] Map 只渲染有座標 Marker，至少兩個座標才渲染 Polyline；空狀態與載入錯誤可見。

### Task 4: 景點 Modal 與 CRUD 互動

**Files:** `src/components/ItineraryItemModal.tsx`, `src/components/NominatimResults.tsx`, `src/app/trips/[tripId].tsx`

- [ ] Modal 支援 create/edit/delete，欄位包含名稱、地址、分類、時間、停留分鐘、難度、備註。
- [ ] 按搜尋才呼叫 Nominatim；查無結果可拖曳 Marker 手動定位。
- [ ] 儲存 payload 帶入 `created_by`，刪除要求確認，成功後重新載入當日資料。

### Task 5: 最終驗證

- [ ] 執行 `npm test`、`npx tsc --noEmit`、`npx expo config --type public`。
- [ ] 執行 `git status --short`，確認只包含預期變更。
