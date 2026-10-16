# Draft Protection and Travel Mode Implementation Plan

**Goal:** Ship the four approved opt-in conveniences without changing saved itinerary semantics.
**Architecture:** Scoped JSON draft storage + shared hook/notice UI; shared form layout; independent next-stop selector and label-only timezone helper. Existing API services remain canonical.
**Tech Stack:** Expo55, React Native Web, TypeScript, Vitest, browser localStorage.

## 1. Draft core and protection
- [x] Add `tests/form-drafts.test.ts` covering key isolation, corrupt/expired data, changed base, file exclusion, conditional clear.
- [x] Implement `lib/form-drafts.ts`, `src/hooks/useFormDraft.ts`, `src/components/FormDraftNotice.tsx`.
- [x] Hook interaction tests verify initial untouched form, recovery consent, dirty close options, storage failures, commit cleanup and beforeunload. Add `DraftNavigationGuard.tsx` using React Navigation usePreventRemove for SPA/native navigation actions, with consent-only replay of the original action.

## 2. Form integration and layout
- [x] Implement shared `FormModalLayout.tsx` with keyboard/safe-area protection and pinned footer; test structural boundaries.
- [x] Integrate itinerary/expense/upload/metadata snapshots, original initialization boundaries and success-only cleanup. Preserve onSave/onRefresh and consecutive creation.
- [x] Test failures preserve drafts; duplicate clicks are guarded; metadata drafts do not store binary files.

## 3. Travel mode and time context
- [x] Write `tests/travel-mode.test.ts` for sorted scoped stations, clamped manual steps, vouchers bound to station and label precedence.
- [x] Implement `lib/travel-mode.ts`, `lib/time-context.ts`, `NextStopMode.tsx`; wire via TimelinePanel and existing voucher callback.
- [x] Add text labels to TimelineCard, form and shortcut display without modifying persisted values.
- [x] Interaction tests cover opt-in/next/previous/exit/empty and original time immutability.

## 4. Verification
- [x] Run all tests, type-check, build:web, verify:build and git diff --check. Final: 810 tests / 121 files passed; TypeScript exit 0; Expo Web export + PWA verification exit 0; diff check passed (Windows CRLF notices only).
- [x] Independently review changes and fix important findings with failing regression tests first. Busy forms now block editing; pending place lookups are invalidated at save start. Recovery must be resolved before editing; completed saves clear only the matching draft.
- [x] Document device-only drafts and native/browser limitations; no automatic commit/push/deploy.

## Manual acceptance after deployment
1. 新增景點填名稱、選 Day 2 → 取消 → 繼續編輯：內容應不變。再次取消 → 保留草稿 → 重新開啟 → 恢復：名稱/天數應一致。儲存並新增下一筆後，舊草稿應消失。
2. 費用填名稱/金額/分攤 → 重整頁面（瀏覽器可能提供原生離開提示）→ 重新開啟表單：先詢問恢復，不自動覆寫；確認後保留金額與分攤。返回上一頁亦需先處理未儲存提示。
3. 票券新增與編輯填預約編號/日期/備註 → 取消保留 → 重開恢復；新增附件必須重選。上傳成功而清單刷新失敗，不重複上傳。
4. 另裝置修改同一筆景點/費用/票券後，重新載入含舊草稿的裝置：應提示線上資料已更新，禁止直接恢復。不同帳號/行程看不到彼此草稿；登出沿用既有清理。
5. 旅途模式需主動開啟；上一站/下一站手動切換，首末站按鈕停用，相關票券只屬於當站。切換 Day 重設檢視；退出不改時間、排序、完成狀態。
6. 台灣時間航班與日本時間抵達保留原字面值；未知標記顯示依行程時區，不推測時差。
7. 手機開鍵盤、旋轉螢幕，確認底部操作可見且最後欄位可捲到。需以實機 Safari/Chrome 補驗，非僅單元測試。

## Platform limits
- 草稿僅本機瀏覽器 JSON；七天後不提供恢復，登出清理。不是雲端同步，也不是附件備份。裝置禁止 localStorage 或原生執行環境沒有此 API 時，顯示未保留的警告，不能假裝已保存。
- beforeunload 提示受瀏覽器與 OS 限制，手機強制關閉不一定有提示；每次完成輸入的 React 更新皆嘗試同步保存本機草稿。
- 沒有修改 Supabase Schema、既有 time 值或排序資料；未提交、推送或部署。
