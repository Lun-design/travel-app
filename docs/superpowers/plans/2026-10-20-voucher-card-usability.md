# Voucher Card Usability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 落實已核准 Phase D：卡片就地複製、真實離線狀態、手動下載與可操作的列表提示。

**Architecture:** 複製沿用 copyVoucherReference；小型 VoucherOfflineAction 元件管理快取檢查、下載鎖、AbortController 與前景事件。VouchersPanel 保持單一資料來源及原 scope/generation 防護，僅新增讀取狀態、就地操作與空結果分流。

**Tech Stack:** Expo 55、React Native/Web、TypeScript、Vitest、既有 Cache Storage。

### Task 1：測試先行

- [x] 擴充 `tests/voucher-filter-consistency.test.ts`：複製按鈕屬於正確卡片、缺編號無按鈕、不開預覽；loading/error/offline/僅過期/篩選無結果有正確提示與 handler。
- [x] 新增 `tests/voucher-offline-action.test.ts`：真實 memory file store、下載成功與失敗、防連點、scope/file version、回前景、cleanup。
- [x] 面板 9 項新增需求先執行 Red；離線新元件先寫測試（初次因元件尚不存在無法載入），實作後 10 項通過；另補 preview revision 取消下載與三種 loading 失效的 Red→Green 回歸。

### Task 2：最小實作

- [x] 新增 `src/components/VoucherOfflineAction.tsx`，重用 getVoucherFileKey、saveVoucherOffline 與 canStoreVoucherOffline，狀態不寫 DB。
- [x] `src/components/VouchersPanel.tsx` 移除上方複製群，卡片預約編號旁新增獨立按鈕及 selectable 文字；操作列允許換行。
- [x] loading/error/offline 分流，不清空已載入資料；重試、清除篩選、展開過期、新增入口維持可用。
- [x] 預覽關閉後更新離線 revision，卡片重新讀實際快取；舊 scope 回呼不生效，且重查不取消其他下載。
- [x] 重跑新測試與 Phase B、voucher-files、既有上傳測試，確認 Green。

### Task 3：審查與交付

- [x] 獨立唯讀審查；已確認缺陷先補失敗測試再修正，最終複核無 Critical／Important。
- [x] 全量 npm test -- --run（131 檔／921 項）、npm run type-check、npm run build、npm run verify:build 全部 exit 0。
- [x] 更新規格及 UX 追蹤文件與實機驗收步驟；不自動提交、部署或 migration。
