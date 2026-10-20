# Packing Filters & Feedback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Use checkbox steps to track verification.

**Goal:** 落實已核准的 Phase C 規格，將新增分類與檢視分開，重複新增時有可見回饋。

**Architecture:** 完整 items 保持唯一來源；純函式衍生分類／未完成／我的項目列表，progress 仍使用完整 items。重複判定沿用 packingItemKey，提示並展開、高亮既有項目。新增採同步 ref 鎖與 scope 檢查。

**Tech Stack:** Expo 55、React Native/Web、TypeScript、Vitest。

### Task 1：純過濾函式

- [x] 在 `tests/packing-filters.test.ts` 建立 filterPackingItems 測試：空清單、三條件交集、共用所有人、未指派排除、匿名保護、不更動原資料。
- [x] 執行 `npm.cmd test -- --run tests/packing-filters.test.ts`，確認缺少函式而失敗。
- [x] `lib/packing-utils.ts` 加入 PackingViewFilters 與 filterPackingItems；依 category、is_checked 與 assigned_to/assigned_to_all 回傳新陣列。
- [x] 重跑確認通過。

### Task 2：互動測試先行

- [x] 建立 `tests/packing-filter-ui.test.ts`：實際點擊分類／未完成／我的、分類新增、空狀態、刷新、重複名稱與連點。
- [x] 執行新測試確認缺少 UI 或舊行為失敗。
- [x] 修改 `src/components/PackingPanel.tsx`：新增分類選單保持原用途；舊分類列改為明確的檢視列，預設全部，加入未完成／我的項目，清除篩選可用。
- [x] groups 改用 visibleItems，progress 繼續使用 items。重複新增不清空輸入，展開原分類、清除檢視篩選並高亮原項目。
- [x] 同步鎖攔截按鈕及鍵盤重複新增；成功、失敗與 scope 切換正確釋放，舊回應不能寫入新行程。
- [x] 高亮 timer 在卸載／scope 變更清理；檢視狀態在 scope 變更重設。
- [x] 重跑互動測試及既有 `tests/form-refresh-regressions.test.ts`、`tests/packing.test.ts`。
- [x] 審查發現慢讀取被新增失效後未補載：新增 deferred-list 失敗測試，修正完成後補載。
- [x] 審查發現補載可覆蓋離線新增：`tests/offline-api.test.ts` 先重現 queued create 及 pending check/delete 遺失，再於 `lib/packing-api.ts` 合併 scoped outbox 對應快取。

### Task 3：審查與驗證

- [x] 依 requesting-code-review 進行獨立唯讀審查，針對確定缺陷先補 Red 再修 Green。兩項 Important 已修正，複核未發現其他 Important。
- [x] 執行 `npm.cmd test -- --run`（130 檔、898 項）、`npm.cmd run type-check`、`npm.cmd run build`、`npm.cmd run verify:build`；全部 exit 0。
- [x] 更新規格及 UX 追蹤文件，記錄實際證據。無 migration，不自動提交或部署。
