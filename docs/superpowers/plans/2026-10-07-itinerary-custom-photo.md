# 景點自訂封面照片實作計畫

**Goal:** 讓使用者從相簿選圖、預覽、壓縮並上傳景點封面至公開讀取的 Supabase bucket，且可恢復預設。

**Architecture:** `lib/spot-photo-upload.ts` 處理驗證、壓縮與 Storage 上傳；燈箱管理選擇和預覽狀態；既有 `preview_url` 更新鏈負責持久化與同步。Migration 建立專用 bucket 與最小權限 policy。

**Tech Stack:** Expo SDK 55 Image Picker / ImageManipulator、Supabase Storage、React Native、Vitest。

---

### Task 1: 儲存與驗證

- [ ] 在 `tests/spot-photo-upload.test.ts` 先新增失敗測試：非法格式、過大圖片、上傳公開 URL、Storage 失敗。
- [ ] 執行單檔測試確認 Red。
- [ ] 新增 `lib/spot-photo-upload.ts`，實作 2 MiB 檢查、壓縮及公開 URL 上傳。
- [ ] 新增 `supabase/migrations/20261007000000_itinerary_photos.sql`，建立公開讀取且只有行程編輯者可寫的 bucket。
- [ ] 執行單檔測試確認 Green。

### Task 2: 燈箱操作與資料同步

- [ ] 在 `tests/itinerary-lightbox.test.ts` 及持久化測試先加入本機預覽、確認上傳、恢復預設、URL 清空的失敗測試。
- [ ] 執行單檔測試確認 Red。
- [ ] 修改 `ItineraryTimeline.shared.tsx` 與 `src/app/trips/[id].tsx`，串接 picker、上傳、成功提示、失敗回復和預設還原。
- [ ] 執行單檔測試確認 Green。

### Task 3: 驗證

- [x] 補分享頁資料映射與照片渲染的 Red/Green 測試。
- [ ] 執行 `npm test -- --run`。
- [ ] 執行 `npm run type-check`。
- [ ] 檢查 diff 與 migration 上線需求。
