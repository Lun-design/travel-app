# Voucher Accessibility Implementation Plan

**Goal:** 完成已核准UX-13B，原有票券流程不變。

**Architecture:** 僅修改VouchersPanel的Pressable語義與樣式；單選項沿用selectionKeyboardProps。測試用既有interaction harness執行真實handler，API與子表單在邊界mock。

**Tech Stack:** React Native、RNWeb、Vitest。

## 1. Red

- 新增 `tests/voucher-accessibility.test.ts`，測分類/Day/景點checked、44px、含名稱操作入口、確認/取消及Space/Enter互動。
- `npm.cmd test -- --run tests/voucher-accessibility.test.ts` 確認缺少語義與尺寸而失敗。

## 2. Green

- `src/components/VouchersPanel.tsx`增加群組、checked/expanded/disabled/busy、操作名稱與44px樣式；radio加鍵盤輔助，不更動API handlers。
- `tests/voucher-filter-consistency.test.ts`僅補鍵盤helper模組解析，保留既有篩選/刪除/狀態測試。
- 執行新測試、selection-keyboard與voucher-filter-consistency回歸。

## 3. Verify

- 獨立唯讀審查，確認缺陷先Red再Green。
- 執行 `npm.cmd test -- --run`、`npm.cmd run type-check`、`npm.cmd run build`、`npm.cmd run verify:build`、`git diff --check`。
- 更新UX追蹤清單；不提交、不推送、不部署。實機觸控／閱讀器另行驗收。
