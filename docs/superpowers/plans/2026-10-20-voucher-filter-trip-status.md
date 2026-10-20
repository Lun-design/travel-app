# Phase B：票券篩選與首頁狀態 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** 修復 UX-02 與 UX-03，保留既有新增、編輯、刪除、預覽、綁定與行程管理功能。

**Architecture:** 票券以 allVouchers 為唯一資料源，分類與過期開關只控制衍生結果。以 account/trip scope 與 request generation 排除過時回應；首頁使用驗證後的日曆日期比較，包含結束日。

**Tech Stack:** Expo 55、React Native/Web、TypeScript、Vitest。

### Task 1：票券一致性

- [x] 新增 `tests/voucher-filter-consistency.test.ts`，實際操作過期、分類、上傳回調、編輯回調與跨行程請求；已確認 5 項失敗。
- [x] 修改 `src/components/VouchersPanel.tsx`：移除可獨立失效的顯示清單 state；保留分類；拒絕舊 scope/generation 回應與卸載後回寫。
- [x] 執行 `npm.cmd test -- --run tests/voucher-filter-consistency.test.ts`，全量驗證包含此檔 15 項互動案例。

### Task 2：首頁狀態

- [x] 新增 `tests/trip-status.test.ts`：涵蓋未來、當日、結束日、結束後、閏日與無效日期；已確認缺少 helper 而失敗。
- [x] 在 `lib/trip-dates.ts` 加入 `tripStatusLabel(startDate, endDate, today?)`；today 預設採裝置的本地日曆日期，日期欄位不做時區位移。
- [x] `src/app/index.tsx` 改以 start_date/end_date 呼叫 helper，不更動其他按鈕。
- [x] 執行 `npm.cmd test -- --run tests/trip-status.test.ts`，10 項通過。

### Task 3：驗證與交付

- [x] 執行全量 `npm.cmd test -- --run`（128 檔、877 項通過）、`npm.cmd run type-check`、`npm.cmd run build`、`npm.cmd run verify:build`；全部 exit 0。
- [x] 獨立檢查 diff 與競態保護，修正已確認問題並補測試。審查兩項 Important 已修正且複核通過。
- [x] 更新 `docs/audits/2026-10-20-ux-improvement-backlog.md`，記錄真實驗證結果。無 migration；不自動提交或部署。
