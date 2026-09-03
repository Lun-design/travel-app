# 多人共編旅遊規劃 App：階段一設計

## 目標

建立 Expo（TypeScript、Expo Router）專案骨架與 Supabase 資料庫遷移，支援兩位以上使用者共同規劃行程與記帳。

## 技術範圍

- 行動端：Expo、React Native、TypeScript、Expo Router。
- 資料庫與驗證：Supabase PostgreSQL 與 Supabase Auth。
- UI 元件庫不在本階段安裝；後續 UI 階段再選擇 React Native Paper 或 NativeWind。

## 資料模型

### trips

旅行主檔包含 `id`、`created_by`、`title`、`destination`、`start_date`、`end_date`、`invite_code` 與 `created_at`。`invite_code` 為唯一、隨機且不可預測的分享碼。

### trip_members

成員表包含 `trip_id`、`user_id`、`role` 與 `joined_at`；`(trip_id, user_id)` 必須唯一。`role` 僅能是 `owner`、`editor` 或 `viewer`。

### itinerary_items 與 expenses

兩表皆以 `trip_id` 關聯旅行並新增 `created_by`，用來辨識建立項目的使用者。其餘欄位遵循使用者提供的第一階段需求。

## 資料流程與權限

建立旅行後，資料庫 trigger 會將 `trips.created_by` 自動寫入 `trip_members`，角色為 `owner`。邀請流程透過一個 `security definer` RPC 函式完成：登入使用者提供邀請碼，函式找到旅行並以 `editor` 角色建立成員記錄；已加入者可安全地重複呼叫而不產生重複資料。

RLS 以 `trip_members` 作為唯一授權依據：

- owner、editor、viewer 可讀取其所屬旅行、行程與支出。
- owner、editor 可新增、修改、刪除其所屬旅行的行程與支出。
- owner 可更新旅行資料並管理成員；editor 不可自行變更成員角色或提權。
- 行程與支出的寫入會要求 `created_by = auth.uid()`；更新與刪除是否限制為建立者不在本階段限制，讓合作者能共同維護。

## 專案檔案

專案將包含 Expo Router 的 `app/` 結構、`lib/supabase.ts`、`.env.example`、TypeScript 與 Expo 設定，以及 `supabase/migrations/` 下的一份可在 Supabase SQL Editor 執行的 SQL 檔案。

## 錯誤處理與驗證

SQL 將以外鍵、非空約束、日期與角色檢查約束保護資料完整性，並加上依 `trip_id` 與 `user_id` 的索引。前端 Supabase client 在缺失公開環境變數時會提供明確的設定錯誤。

本階段以型別檢查與 SQL 靜態檢查驗證產物；真正的 RLS 驗證須在已連接 Supabase 專案、具有測試帳號的環境中執行。
