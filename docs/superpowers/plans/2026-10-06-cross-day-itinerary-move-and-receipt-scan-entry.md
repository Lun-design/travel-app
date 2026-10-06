# 跨天移動景點與收據掃描入口調整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 從時間軸卡片選單跨天搬移景點，並移除 ExpenseModal 的收據掃描入口。

**Architecture:** 新增純函式整理來源日和目標日項目，再由 itinerary API 以單一 `move_itinerary_item_to_day` RPC 保存；離線時透過 `move-day` mutation 重播。TimelineCard 顯示目標日 Modal，Trip Detail 負責樂觀更新／復原／切日。ExpenseModal 只拔除掃描 UI wiring，保留 OCR 模組與商品明細手動編輯。

**Tech Stack:** Expo SDK 55 / React Native, TypeScript, Supabase Postgres RPC, Vitest, existing offline store.

---

### Task 1: 跨日移動純函式

**Files:**
- Create: `lib/itinerary-move.ts`
- Test: `tests/itinerary-move.test.ts`

- [x] **Step 1: Write failing behavior tests.**

測試來源日 `[a,b,c]`、目標日 `[d,e]`，把 `b` 搬到 Day 2 後，Day 1 為 `a:0,c:1`，Day 2 為 `d:0,e:1,b:2`；確認 `b.time` 和其他欄位保留、輸入陣列未被修改。另測試同日／缺少 ID／無效 target day 回傳原陣列或受控錯誤。

- [x] **Step 2: Run the focused test and confirm failure.**

Run: `npx vitest run tests/itinerary-move.test.ts`
Expected: FAIL because `moveItineraryItemAcrossDays` is not implemented.

- [x] **Step 3: Implement the smallest pure helper.**

Export `moveItineraryItemAcrossDays(items, itemId, targetDay)`，只搬移指定 item，依原 `position` 排序來源日與目標日，保留所有 item 欄位及時間，更新兩日的 `position` 為從 0 開始連續整數。來源或目標日缺少項目時也回傳 immutable 結果。

- [x] **Step 4: Re-run focused tests.**

Run: `npx vitest run tests/itinerary-move.test.ts`
Expected: all focused cases PASS.

### Task 2: 原子 Supabase API 與離線重播

**Files:**
- Modify: `lib/itinerary-api.ts`
- Modify: `lib/offline-store.ts`
- Modify: `lib/offline-replay.ts`
- Create: `supabase/migrations/20261006000000_atomic_move_itinerary_item_day.sql`
- Test: `tests/itinerary-move-api.test.ts`
- Create: `tests/offline-replay.test.ts`

- [x] **Step 1: Add failing tests for RPC payload and offline queue.**

Assert `moveItineraryItemToDay(itemId, targetDay)` calls `supabase.rpc('move_itinerary_item_to_day', { p_item_id: itemId, p_target_day_number: targetDay })`; when `shouldQueueOffline(error)` is true, assert the snapshot item gets target `day_number` and compacted positions, and a mutation `{ entity: 'itinerary', operation: 'move-day', resourceId: itemId, payload: { targetDay } }` is enqueued. Add a replay test that dispatches `move-day` to the same API with `replaying: true`.

- [x] **Step 2: Run focused tests and confirm failure.**

Run: `npx vitest run tests/itinerary-move-api.test.ts tests/offline-replay.test.ts`
Expected: FAIL because the move API and mutation operation do not exist.

- [x] **Step 3: Implement migration and API.**

Create an authenticated `SECURITY INVOKER` function `public.move_itinerary_item_to_day(p_item_id uuid, p_target_day_number integer)` with `search_path = public, private`. Verify authentication, edit permission via `private.can_edit_trip`, item existence, and target day within `(trips.end_date - trips.start_date + 1)`. Read the item’s trip/source day; temporarily move affected positions out of the active range; set the item to target day; compact source positions in existing order and append the moved item after target-day items. Keep the SQL operation in one function transaction. Revoke public execution and grant authenticated execution.

Implement `moveItineraryItemToDay` in `lib/itinerary-api.ts`; on success update offline snapshot with `moveItineraryItemAcrossDays`; on network errors enqueue `move-day`, update the snapshot, and resolve as queued; rethrow non-network errors. Extend `OfflineMutationOperation` and route the new operation through `lib/offline-replay.ts`.

- [x] **Step 4: Re-run focused tests.**

Run: `npx vitest run tests/itinerary-move-api.test.ts tests/offline-replay.test.ts`
Expected: all focused API/replay cases PASS.

### Task 3: Timeline card picker and parent state synchronization

**Files:**
- Modify: `src/components/ItineraryTimeline.shared.tsx`
- Modify: `src/components/ItineraryTimeline.web.tsx`
- Modify: `src/components/ItineraryTimeline.native.tsx`
- Modify: `src/components/trip-detail/TimelinePanel.tsx`
- Modify: `src/app/trips/[id].tsx`
- Test: `tests/cross-day-move-ui.test.ts`

- [x] **Step 1: Add failing UI wiring tests.**

Assert shared TimelineCard exposes the menu action “移至其他天”, the picker lists passed days except the current day, confirmation invokes `onMoveToDay(item, targetDay)`, and the Trip Detail handler sets the target day after successful persistence. Assert handler restores the previous global item array and exposes an error on API failure.

- [x] **Step 2: Run UI wiring test and confirm failure.**

Run: `npx vitest run tests/cross-day-move-ui.test.ts`
Expected: FAIL because the menu action and callback path are absent.

- [x] **Step 3: Implement picker and parent callback path.**

- Add optional `availableDays` and `onMoveToDay` to `ItineraryTimelineProps` / TimelineCard props; pass `days` from TimelinePanel through platform timeline implementations. Add a Modal with day chips, exclude current day, keep confirmation disabled until a different valid day is selected, and show a submitting state. Trip Detail snapshots all `data.items`, applies `moveItineraryItemAcrossDays` via immutable `setItems`, calls `moveItineraryItemToDay` with the existing offline scope, reloads while retaining optimistic state if the network read fails, switches `day` to the selected day, and rolls back plus throws on a real mutation error. The card closes on success; on failure it remains open and displays an Alert.

- [x] **Step 4: Re-run UI wiring and move helper tests.**

Run: `npx vitest run tests/cross-day-move-ui.test.ts tests/itinerary-move.test.ts`
Expected: all cases PASS.

### Task 4: Remove receipt scanning entry from ExpenseModal

**Files:**
- Modify: `src/components/ExpenseModal.tsx`
- Modify: `tests/receipt-ocr.test.ts`

- [x] **Step 1: Add failing ExpenseModal assertions.**

Assert ExpenseModal source no longer imports/renders `ReceiptScanButton`, has no camera prompt or scan notice state, while retaining `sumReceiptItems`, `receiptItems`, manual “新增明細” controls, and `receipt_items` save mapping.

- [x] **Step 2: Run focused test and confirm failure.**

Run: `npx vitest run tests/receipt-ocr.test.ts`
Expected: FAIL because scan UI is still wired into ExpenseModal.

- [x] **Step 3: Remove only scanner UI wiring.**

Remove `ReceiptScanButton` and scan-result-only imports/state/callback/timer from ExpenseModal. Retain `ReceiptItem` and `sumReceiptItems` imports, manual line-item editing, OCR files, scanner component, dependency, and persisted `receipt_items` behavior.

- [x] **Step 4: Re-run focused test.**

Run: `npx vitest run tests/receipt-ocr.test.ts`
Expected: all receipt tests PASS with the new no-scan-button assertion.

### Task 5: Full verification

**Files:** all files above.

- [x] **Step 1: Run all tests.**

Run: `npm test -- --run`
Expected: all test files and cases PASS.

- [x] **Step 2: Run TypeScript validation.**

Run: `npm run type-check`
Expected: `tsc --noEmit` exits 0.

- [x] **Step 3: Inspect the final diff.**

Run: `git diff --check` and `git status --short`; confirm no unrelated edits and no whitespace errors.
