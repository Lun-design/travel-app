# Place Search and Drag Reorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 簡化景點建立流程，並讓 Web、iOS 與 Android 都能以拖曳手把重新排序景點。

**Architecture:** 地理搜尋的 debounce、快取、限流與取消過期結果集中在 `lib/geocoding.ts`，Modal 只負責畫面狀態。排序採平台元件分流：Web 使用 `@hello-pangea/dnd`，Native 使用 `react-native-draggable-flatlist`，兩者共用 `position` 正規化與 Supabase 寫回函式。

**Tech Stack:** Expo Router、React Native、Nominatim-compatible Search API、Vitest、@hello-pangea/dnd、react-native-draggable-flatlist。

---

### Task 1: 可測試的搜尋排程與快取

**Files:**
- Modify: `lib/geocoding.ts`
- Modify: `tests/geocoding.test.ts`

- [ ] 先測試查詢字串正規化、最短長度、快取命中與過期回應忽略規則。
- [ ] 實作 400ms debounce controller、記憶體快取及每秒最多一次網路請求。
- [ ] 公開 Nominatim endpoint 僅允許明確提交；自架或允許 autocomplete 的 endpoint 才開啟背景查詢。
- [ ] 執行 `npm.cmd test -- tests/geocoding.test.ts`。

### Task 2: 簡化景點 Modal

**Files:**
- Modify: `src/components/ItineraryItemModal.tsx`

- [ ] 景點名稱變更時串接搜尋 controller，呈現載入、空結果與下拉選項。
- [ ] 選取結果後填入 `location_name`、`address`、`latitude`、`longitude`。
- [ ] 將類別、難度、停留時間、備註與 Marker 微調收進「更多設定」折疊區。
- [ ] Modal 關閉或切換項目時取消排程，避免過期回應覆蓋新狀態。

### Task 3: 純排序轉換

**Files:**
- Modify: `lib/itinerary.ts`
- Modify: `tests/itinerary.test.ts`

- [ ] 先測試拖放來源與目的索引的轉換、無效索引及連續 `position`。
- [ ] 實作 `reorderItineraryItems(items, from, to)`，回傳不突變原陣列的新陣列。
- [ ] 執行 `npm.cmd test -- tests/itinerary.test.ts`。

### Task 4: 平台拖曳元件

**Files:**
- Create: `src/components/ItineraryTimeline.shared.tsx`
- Create: `src/components/ItineraryTimeline.web.tsx`
- Create: `src/components/ItineraryTimeline.native.tsx`
- Modify: `src/components/ItineraryTimeline.tsx`
- Modify: `src/app/_layout.tsx`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] 安裝兩個拖曳套件並以 `GestureHandlerRootView` 包住 App 根節點。
- [ ] 抽出共用景點卡片、距離過渡資訊與拖放完成後的 optimistic update。
- [ ] Web 使用 `DragDropContext`、`Droppable`、`Draggable` 與專屬 Grip handle。
- [ ] Native 使用長按 Grip handle 啟動 `DraggableFlatList`。
- [ ] 拖放後重新編號 `position`，呼叫 `updateItineraryItemsOrder`；失敗時還原並顯示錯誤。

### Task 5: 完整驗證

**Files:**
- Verify all modified files

- [ ] 執行 `npm.cmd test`，確認全部測試通過。
- [ ] 執行 `npx.cmd tsc --noEmit`，確認型別檢查通過。
- [ ] 執行 Expo Web export，確認平台分流與靜態渲染可建置。
- [ ] 執行 `git diff --check` 並檢查變更範圍。
