# Travel Convenience Implementation Plan

**Goal:** Add four approved conveniences without removing existing actions or rewriting itinerary data.
**Architecture:** Small focused helpers/components; additive optional props. Existing save service stays canonical. Device preferences store only scoped IDs; file availability reads CacheStorage.
**Tech Stack:** Expo 55, React Native Web, TypeScript, Vitest, existing browser localStorage preferences, existing Supabase services.

## Task 1 — Simple editor and consecutive creation
- [x] Add failing interaction tests for default hidden time, full edit, day selection, consecutive save/reset, failed save retention and synchronous duplicate guard.
- [x] Modify `ItineraryItemModal.tsx`: `save(keepOpen = false)`, optional `onSaveAndContinue`, ref guard and per-form/request versions. Move optional fields under existing more settings; editing expands by default.
- [x] Modify trip route save handler to accept keep-open option; keep normal close/scroll behavior. Refresh must not close continued form.
- [x] Run focused Vitest test.

## Task 2 — Preparation summary
- [x] Test scoped offline counts with saved, missing, failed and foreign-trip files.
- [x] Add `lib/trip-preparation.ts`, `TripPreparationOverview.tsx`: read packing and cached presence, cancelled effects, focus refresh, collapsed summary + navigation callbacks.
- [x] Integrate timeline-only, and refresh after ticket close/packing revision.
- [x] Run focused Vitest test.

## Task 3 — Important information
- [x] Test preference parsing, account/trip isolation, deleted ID handling, privacy-safe shared text.
- [x] Add `lib/trip-shortcuts.ts` and `TripInfoShortcuts.tsx` with local persisted IDs, explicit picker, copy/navigation/share feedback and guarded async persistence.
- [x] Integrate after preparation summary, show local-preference label.
- [x] Run focused tests.

## Task 4 — Empty states and final verification
- [x] Test three empty-trip callbacks and no onboarding when itinerary populated.
- [x] Add `TripGettingStarted.tsx` via optional TimelinePanel slot; use existing add/import/invite handlers.
- [x] Run `npm.cmd test -- --run`, `npm.cmd run type-check`, `npm.cmd run build:web`, `git diff --check`. Result: 784 tests / 115 files passed; TypeScript passed; Expo Web export and `verify:build` passed; diff check passed (Windows line-ending notices only).
- [x] Review diff for lost form data, stale responses, day changes resetting continued form, unhandled promises and existing functionality changes. Independent review identified and regression tests fixed insertion-cursor scope and deleted-pin capacity.

## Manual acceptance after deployment
1. 新增只填名稱、選 Day 2，連續儲存兩筆，最後一般儲存關閉；確認兩筆各自保留且未自動填時間。
2. 編輯舊景點，確認地址/時間/備註/分類仍在，沒有因簡易模式被清空。
3. 展開行前準備，切到打包清單勾選後返回；票券離線儲存後關閉預覽，數量立即更新。手機與 PC 各自檢查，不共用快取狀態。
4. 重要資訊設定住宿與集合點，驗證複製/導航/分享，修改原景點後快捷卡顯示新資料；釘選偏好僅本機、登出清除。
5. 空行程三個入口均可開啟既有流程；已有行程不再顯示新手引導。

本機儲存採既有瀏覽器 localStorage（不是新增 AsyncStorage 套件）；受限/不支援裝置顯示明確錯誤與重試，不假裝已儲存。未修改資料庫 Schema，未部署或推送。
