# Trip Settings Unsaved Protection Implementation Plan

**Goal:** 實作已確認的UX-15B，不改變立即設定與原API。

**Architecture:** TripSettingsModal以userId/tripId識別scope，開啟時記錄四欄基準。關閉檢查差異，底部顯示確認列。ref鎖與session token防止重複儲存及過期結果干擾。

**Tech Stack:** React、React Native、Vitest interaction harness。

## Task 1：Red

- 新增 `tests/settings-unsaved-protection.test.ts`，呼叫真實表單的onPress/onRequestClose/onChange，涵蓋規格驗收情境。
- `npm.cmd test -- --run tests/settings-unsaved-protection.test.ts` 確認新增功能缺失而失敗。

## Task 2：Green

- `src/components/TripSettingsModal.tsx`新增scope props、baseline與session refs、關閉確認列、同步儲存鎖及錯誤訊息安全收斂。
- `src/app/trips/[id].tsx`傳入目前帳號與行程ID，不修改onSave或立即設定callback。
- `tests/timezone-modal-integration.test.ts`補傳scope，保留既有payload斷言。
- `npm.cmd test -- --run tests/settings-unsaved-protection.test.ts tests/timezone-modal-integration.test.ts`，預期全通過。

## Task 3：審查與驗證

- 獨立唯讀審查，每個確認缺陷先測試重現再修正。
- `npm.cmd test -- --run`、`npm.cmd run type-check`、`npm.cmd run build`、`npm.cmd run verify:build`、`git diff --check`。
- 更新UX追蹤清單的實際驗證數據；手機／桌面實機驗收另外標示。不自動提交、推送、部署或migration。
