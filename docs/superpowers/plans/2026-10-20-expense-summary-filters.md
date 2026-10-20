# Phase E Expense Summary & Filters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 提供個人剩餘應付／應收與費用篩選，保留既有確認與分帳算法。

**Architecture:** 抽出 scoped 結清紀錄 hook，由 ExpensesPanel 提供同一份狀態給 BudgetDashboard 與 ExpenseList；BudgetDashboard 單獨使用時保留內建載入能力。純篩選 helper 沿用既有逐筆剩餘轉帳計算。摘要永遠依完整 expenses，篩選只影響列表。

**Tech Stack:** Expo 55、React Native/Web、TypeScript、Supabase 現有 API、Vitest。

### Task 1：測試先行

- [x] 新增 `tests/expense-view-filters.test.ts`：付款人／分攤人、部分／完全結清、自付、無關的全域轉帳、類別交集及原陣列不變。
- [x] 新增互動測試：摘要 17,833、已平衡、頭像、載入／錯誤、預算展開與儲存、清除篩選及搜尋定位。
- [x] 新增結清資料 hook 測試：只載一次、即時更新、取消／scope 隔離、失敗不清空舊資料、操作更新不被舊讀取覆蓋。
- [x] 針對新能力確認 Red，再修改實作。

### Task 2：實作

- [x] `src/hooks/useSettlementRecords.ts` 提供 records/loading/error/hasLoaded/reload/add/remove，以帳號／行程與 request generation 防止競態，清理訂閱。
- [x] `BudgetDashboard.tsx` 接受可選共用來源；新增個人頭像、姓名、應付／應收／已平衡與完整總支出；預算／圖表可展開，結清入口保留。
- [x] `ExpensesPanel.tsx` 共享 hook，不以 remount 清掉正在編輯的預算；逐筆結清後重讀紀錄並呼叫原父層刷新。
- [x] `lib/expense-view-filters.ts` 使用既有 normalizeCategory 與 createExpenseSettlementTransfers；不修改金額或結清算法。
- [x] `ExpenseList.tsx` 保留完整來源及所有 action safety，衍生顯示清單；本地成功 settledIds 立即移出待結清篩選；scope 變更重設，搜尋定位清除檢視限制。
- [x] 重跑新測試與 Phase A、既有 member shares、analytics、settlement 回歸。

### Task 3：驗證與交付

- [x] 獨立唯讀審查；確定缺陷先補失敗測試再修正。
- [x] 全量 npm test -- --run（133 檔／941 項）、npm run type-check、npm run build、npm run verify:build 全部 exit 0。
- [x] 更新 UX 追蹤文件；本機完成不等於已部署，不自動提交／部署／migration。

補充：審查找到同費用重複搜尋定位會被篩選隱藏，已 Red→Green 修正並複核；analytics 單一外幣原額誤當 TWD 的呈現問題亦以失敗測試重現後修正，原始結清幣別與轉帳金額不變。
