# 行程常用資訊整合與手機溢位修正 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 將住宿、集合與一般常用地點整合進單一常用資訊面板，並修正手機摘要列與日期籤的裁切。

**Architecture:** `TripInfoShortcuts` 負責唯一入口、常用地點清單、管理與導航；既有 shortcut 型別/API 以相容 migration 新增 `place` 類別。摘要列以可換行的顯示避免橫向隱藏，DayTabs 依卡片固定步距對齊選取日期。

**Tech Stack:** Expo SDK 55、React Native 0.83、TypeScript、Supabase SQL migration。

---

### Task 1: 擴充常用資訊釘選類型

**Files:**
- Modify: `lib/trip-shortcuts.ts`
- Modify: `lib/trip-shortcuts-api.ts`
- Create: `supabase/migrations/20261028000000_trip_info_pins_place_kind.sql`

- [ ] 擴充 `ShortcutKind` 為 `hotel | meeting | place`；解析本機快取及雲端資料時接受新增類型，文字輸出標籤分別為住宿資訊、集合資訊、常用地點。
- [ ] 在 API 輸入驗證中接受 `place`，保留現有 per-pin upsert/delete 和 RLS 行為。
- [ ] 新 migration 在 transaction 中僅更新 `trip_info_pins` 的 kind check constraint，允許 `hotel`、`meeting`、`place`；不得刪除或更新既有資料。
- [ ] 若能使用本機 SQL lint／migration 檢查腳本，執行該檢查；否則以 SQL diff 逐行確認 migration 只變更約束。

### Task 2: 合併常用資訊入口和地址清單

**Files:**
- Modify: `src/components/trip-detail/TripInfoShortcuts.tsx`
- Modify: `src/app/trips/[id].tsx`

- [x] 將時間軸上方入口改成單一小狗主題「常用資訊」按鈕，摘要顯示釘選筆數；點擊開啟底部面板。
- [x] 面板內每筆顯示名稱、純文字類別標籤及完整地址，導航為主要操作，複製／分享留在次要操作；移除同步說明及非必要日／時區行。列表和管理共用單一原生 Modal。
- [x] 現有管理流程新增第三種「常用地」類別；保留 owner/editor 權限、最多 12 筆上限、既有 pin 同步、快取 fallback 及使用者原有住宿／集合釘選。
- [x] 從行程頁移除行前準備卡片；打包／票券功能仍由既有分頁提供。行程切換仍重設本地面板狀態。

### Task 3: 修正手機摘要列與日期籤裁切

**Files:**
- Modify: `src/components/DashboardMetricsBar.tsx`
- Modify: `src/components/DayTabs.tsx`

- [x] Dense 摘要列在窄螢幕允許換行、保留所有統計，不以水平裁切隱藏金額；將本日及全程金額文案縮短但保留兩者含義。
- [x] Dense 日期籤依 80px 卡寬與 6px gap 計算穩定捲動位置，選到尾端日期時避免部分日期籤切字；非 dense 日期籤外觀不變。

### Task 4: 更新追蹤文件並驗證

**Files:**
- Modify: `docs/audits/2026-10-20-ux-improvement-backlog.md`
- Verify: `npm.cmd run type-check`
- Verify: `npm.cmd run build`
- Verify: `npm.cmd run verify:build`
- Verify: `git diff --check`

- [x] 在 UX 改善追蹤文件註明本機完成範圍、migration 狀態及實機驗收限制。
- [x] 執行 TypeScript type-check，確認 exit code 0。
- [x] 執行正式 Web build，確認 exit code 0。
- [x] 執行 PWA 輸出驗證，確認 exit code 0。
- [x] 執行最後一輪 type-check、build、verify:build 與 diff whitespace 檢查；不新增／執行測試、不 stage、不 commit、不 push、不部署。SQL migration 已逐行檢視約束變更範圍。
