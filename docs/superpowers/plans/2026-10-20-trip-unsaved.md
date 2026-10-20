# Trip Unsaved Protection Implementation Plan

**Goal:** 保護 CreateTripModal 新增／編輯中的未儲存內容，保留原 API。

**Architecture:** 在既有元件內記錄本次開啟的欄位基準與 scope。關閉要求經 dirty 判定，確認列留在同一 Modal；儲存用同步 ref 鎖與 session token 防止舊非同步結果影響新表單。

**Tech Stack:** React、React Native、Vitest interaction harness。

### Task 1：Red

- 新增 `tests/trip-unsaved-protection.test.ts`，透過真實元件的 onPress、onChangeText、onRequestClose 驗證取消／返回、放棄、初始化、失敗保留、防連點。
- 執行 `npm.cmd test -- --run tests/trip-unsaved-protection.test.ts`，確認缺少保護的預期失敗。

### Task 2：Green

- 修改 `src/components/CreateTripModal.tsx`：記錄六欄基準，關閉進入確認列；維持同 scope 輸入，開啟與切 scope 重設。ref 阻止重複提交，token 阻止舊結果關閉新 scope。
- 原有 callback/payload 與時間選擇器不變。所有編輯欄位與取消在儲存中禁用。
- 執行新測試及 `tests/timezone-modal-integration.test.ts`。

### Task 3：驗證與記錄

- 執行 `npm.cmd test -- --run`、`npm.cmd run type-check`、`npm.cmd run build`、`npm.cmd run verify:build` 與 `git diff --check`。
- 更新 `docs/audits/2026-10-20-ux-improvement-backlog.md`，僅記錄實際驗證結果，保留人工手機／桌面驗收事項。
- 不自動提交、部署或操作遠端資料庫。
