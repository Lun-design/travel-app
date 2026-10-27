# Trip Information Density Implementation Plan

**Goal:** 減少行程頁頂部層數，保留全部既有功能入口與資料流。

**Architecture:** Header管理動作集中於獨立Modal；Timeline日期列使用dense DayTabs；TripTravelInfo純顯示容器以display:none收納常駐元件並傳送important expandRequest。父層只改組合、不改handlers。

**Tech Stack:** Expo55、React Native/Web、Vitest interaction harness。

## 1. TDD：Header與日期導覽

- 新增 `tests/trip-information-density.test.ts` 驗證初始Header不列管理按鈕、搜尋／返回直接可用、更多選單保留原callback／權限／旅伴資料。
- 測dense DayTabs保留日期與onChange且不超過56px；測TimelinePanel單一日期列原更多操作仍可觸發。
- 執行新測試確認Red，實作 `TripDetailHeader.tsx`、`DayTabs.tsx`、`TimelinePanel.tsx` 最小顯示層變更。

## 2. TDD：資訊收納

- 新增TripTravelInfo純UI容器的開關、常駐子元件、scope與快捷展開測試。新增TripInfoShortcuts expandRequest回歸。
- 實作 `TripTravelInfo.tsx`，`TripInfoShortcuts.tsx`僅新增展開request prop；`src/app/trips/[id].tsx`組合兩原元件，空白引導維持外部。
- 舊member測試改用多hook harness並先開選單；僅替換與已核准移除Hero相衝突的舊視覺斷言，不刪掉權限、日期與導航回歸。

## 3. 驗證

- 獨立唯讀審查；確認缺陷先補Red再修Green。
- 執行 `npm.cmd test -- --run`、`npm.cmd run type-check`、`npm.cmd run build`、`npm.cmd run verify:build`、`git diff --check`。
- 視覺檢查手機／桌面可用環境；不建立真實行程或寫入使用者資料。更新追蹤清單與實際驗證限制。
- 不自動提交、推送、部署或migration。
