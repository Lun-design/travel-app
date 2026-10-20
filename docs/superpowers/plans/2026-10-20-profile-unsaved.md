# Profile Unsaved Protection Implementation Plan

**Goal:** 對UserProfileModal實作關閉確認、非同步隔離及防連點，維持既有上傳／同步行為。

**Architecture:** 原元件加入本次開啟baseline、session token、選圖token與save ref鎖。關閉時僅丟棄尚未保存狀態；存檔各階段需session有效。profiles helper可選expectedUserId於寫入前核對目前登入者。

**Tech Stack:** React Native、Expo55 DocumentPicker、Supabase、Vitest interaction harness。

## 1. Red

- 新增 `tests/profile-unsaved-protection.test.ts`，模擬選檔與上傳延遲，執行元件真實handlers。
- `tests/profiles.test.ts`新增expectedUserId與目前帳號不符時無寫入測試。
- `npm.cmd test -- --run tests/profile-unsaved-protection.test.ts tests/profiles.test.ts`，確認預期失敗。

## 2. Green

- 修改 `src/components/UserProfileModal.tsx`：共用關閉確認；同步鎖；token隔離；取消選圖；失敗保留預覽；disabled與busy語義。
- `lib/profiles.ts`保留原input與回傳格式，可選第二參數expectedUserId，不符拋出受控錯誤，任何寫入之前中止。
- 不修改父層onSaved，繼續沿用getCurrentProfile、updateCurrentProfile、uploadProfileAvatar。
- 執行新測試、profiles測試與 `tests/form-refresh-regressions.test.ts`。

## 3. 審查與驗證

- 獨立唯讀審查確認關閉與async分支；確認缺陷先補失敗測試才修正。
- `npm.cmd test -- --run`、`npm.cmd run type-check`、`npm.cmd run build`、`npm.cmd run verify:build`、`git diff --check`。
- 更新UX追蹤清單，標示實機待驗收；不提交、推送、部署或migration。
