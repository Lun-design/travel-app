# 多人共編旅遊規劃 App 初始化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 Expo Router TypeScript 專案、Supabase client 與多人共編資料庫 migration。

**Architecture:** `app/` 承載 Expo Router 路由，`lib/supabase.ts` 建立單一 client。資料庫以 `trip_members` 作為唯一授權來源；trigger 建立 owner，RPC 依邀請碼新增 editor。

**Tech Stack:** Expo、React Native、TypeScript、Expo Router、Supabase JS、PostgreSQL、Supabase Auth。

---

### Task 1: 初始化儲存庫與 Expo 專案

**Files:**
- Create: `.git/`、`package.json`、`app/_layout.tsx`、`app/index.tsx`、`app.json`、`tsconfig.json`、`.gitignore`

- [ ] **Step 1: 初始化 Git**

Run: `git init`

Expected: 空 Git repository 初始化成功。

- [ ] **Step 2: 建立 Expo Router TypeScript 專案**

Run: `npx create-expo-app@latest . --template default@sdk-55 --yes`

Expected: 產生 Expo 專案檔案與依賴。

- [ ] **Step 3: 驗證 Expo 設定**

Run: `npx expo config --type public`

Expected: exit code 0。

### Task 2: 實作可測試的 Supabase 設定與 client

**Files:**
- Create: `lib/supabase-config.ts`、`lib/supabase.ts`、`.env.example`、`tests/supabase-env.test.ts`
- Modify: `package.json`

- [ ] **Step 1: 寫失敗測試**

```ts
import { expect, it } from 'vitest';
import { readSupabaseConfig } from '../lib/supabase-config';
it('rejects a missing URL', () => {
  expect(() => readSupabaseConfig({ EXPO_PUBLIC_SUPABASE_ANON_KEY: 'key' }))
    .toThrow('EXPO_PUBLIC_SUPABASE_URL is required');
});
```

- [ ] **Step 2: 確認測試因設定模組不存在而失敗**

Run: `npx vitest run tests/supabase-env.test.ts`

Expected: FAIL，找不到 `lib/supabase-config`。

- [ ] **Step 3: 安裝並實作**

Run: `npx expo install @supabase/supabase-js react-native-url-polyfill && npm install -D vitest`

```ts
export function readSupabaseConfig(env: Record<string, string | undefined>) {
  const url = env.EXPO_PUBLIC_SUPABASE_URL;
  const anonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
  if (!url) throw new Error('EXPO_PUBLIC_SUPABASE_URL is required');
  if (!anonKey) throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY is required');
  return { url, anonKey };
}
```

`lib/supabase.ts` 匯入 polyfill、`createClient` 與此函式，並使用 `process.env` 建立並匯出 `supabase`。

- [ ] **Step 4: 建立 `.env.example`**

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

- [ ] **Step 5: 確認測試通過**

Run: `npx vitest run tests/supabase-env.test.ts`

Expected: PASS，1 test passed。

### Task 3: 建立多人共編 migration

**Files:**
- Create: `supabase/migrations/20260903000000_create_travel_planner.sql`

- [ ] **Step 1: 建立資料表與完整性約束**

建立 UUID 的 `trips`、`trip_members`、`itinerary_items`、`expenses`；在 `trips` 建立 `created_by` 與唯一 `invite_code`，在後三張表建立必要的 `created_by`，並為 `(trip_id, user_id)`、行程和支出 `trip_id` 建立索引。

- [ ] **Step 2: 建立共享流程**

建立 after-insert trigger 將旅行建立者加入為 owner；建立 `security definer` 的 `join_trip_by_invite_code(p_invite_code text)`，只允許已登入使用者加入並一律授予 editor。

- [ ] **Step 3: 啟用及定義 RLS**

建立 `private.is_trip_member`、`private.can_edit_trip`、`private.is_trip_owner` helper functions。所有成員可讀；owner/editor 可 CRUD 行程項目與支出；僅 owner 可改旅行和管理成員；行程與支出寫入要求 `created_by = auth.uid()`。

- [ ] **Step 4: 靜態檢查 migration**

Run: `rg -n "create table public.(trips|trip_members|itinerary_items|expenses)|join_trip_by_invite_code|enable row level security" supabase/migrations/20260903000000_create_travel_planner.sql`

Expected: 四個資料表、RPC 與所有 RLS 啟用敘述均出現在輸出中。

### Task 4: 驗證與提交

**Files:**
- Verify: 專案所有新增檔案

- [ ] **Step 1: 執行型別檢查與測試**

Run: `npx tsc --noEmit && npx vitest run`

Expected: exit code 0。

- [ ] **Step 2: 檢查版本控制狀態並建立提交**

Run: `git status --short && git add . && git commit -m "feat: bootstrap collaborative travel planner"`

Expected: 所有階段一檔案已提交。
