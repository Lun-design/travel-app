# Offline Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist scoped trip data in IndexedDB, queue offline mutations, and synchronize them safely when the browser reconnects.

**Architecture:** A small storage adapter hides IndexedDB and exposes a memory implementation for tests. An independent sync service owns queue ordering, network-error detection, and conflict resolution; existing Supabase APIs are adapted at their boundaries. Screens persist snapshots and react to reconnect events without putting private data into the service-worker cache.

**Tech Stack:** Expo Router web, TypeScript, native IndexedDB, Supabase JS, React Native events, Vitest.

---

### Task 1: Scoped offline store and mutation model

**Files:**
- Create: `lib/offline-store.ts`
- Modify: `lib/offline-cache.ts`
- Test: `tests/offline-store.test.ts`

- [x] Define `OfflineScope`, `OfflineSnapshot`, `OfflineMutation`, and `OfflineConflict` types with `userId`/`tripId` keys.
- [x] Implement an IndexedDB adapter that opens `travel-planner-offline-v1`, creates `snapshots` and `mutations` stores, and falls back to an in-memory adapter when `indexedDB` is unavailable.
- [x] Implement `getSnapshot`, `putSnapshot`, `enqueueMutation`, `listMutations`, `removeMutation`, `markConflict`, and `clearAll` while serializing every operation through the adapter.
- [x] Extend `clearOfflineCache` to call `clearAll()` before deleting runtime Cache Storage, preserving theme preference.
- [x] Test scope isolation, snapshot round trips, mutation persistence, and cleanup using the memory adapter.

### Task 2: Queue synchronization and conflict resolution

**Files:**
- Create: `lib/offline-sync.ts`
- Test: `tests/offline-sync.test.ts`

- [x] Add `isNetworkError` that recognizes offline browser state, failed fetch, and common network error messages but does not classify RLS/validation errors as offline.
- [x] Add `createOfflineSyncService({ store, execute, now })`; coalesce same-resource mutations by newest `clientTimestamp`, execute in timestamp order, remove successes, and retain failed mutations as conflicts.
- [x] Implement `resolveConflict(conflictId, 'keep-local' | 'use-remote')`; keep-local returns the mutation to pending, use-remote removes it without retrying.
- [x] Add `startOnlineSync` to attach a browser-safe `online` listener and return a cleanup function; native and SSR environments become no-ops.
- [x] Test ordering, deduplication, non-network error propagation, conflict resolution, and online-event synchronization with injected dependencies.

### Task 3: Offline-aware API boundaries

**Files:**
- Modify: `lib/itinerary-api.ts`
- Modify: `lib/packing-api.ts`
- Modify: `lib/expenses-api.ts`
- Modify: `lib/trips.ts`
- Test: `tests/offline-api.test.ts`

- [x] Add an optional `{ offlineScope }` argument to list/mutation functions without breaking existing callers.
- [x] On successful reads, persist the relevant collection into the scoped snapshot; on network read failures, return that cached collection.
- [x] On network mutation failures, enqueue a typed mutation and return an optimistic record for create/update operations; preserve immediate errors for invalid payloads and authorization failures.
- [x] Ensure queued create mutations omit local-only ids when replayed, while update/delete/order operations retain their resource ids.
- [x] Test cached reads, optimistic creates, queue payloads, and non-network errors with mocked Supabase responses.

### Task 4: Trip detail and packing UI integration

**Files:**
- Modify: `src/app/index.tsx`
- Modify: `src/app/trips/[id].tsx`
- Modify: `src/components/PackingPanel.tsx`
- Create: `src/components/OfflineSyncBanner.tsx`
- Test: `tests/offline-ui-contract.test.ts`

- [x] Pass the authenticated user id as the offline scope and persist/load trip detail snapshots for itinerary, expenses, packing, members, and vouchers.
- [x] Make packing toggles, add/delete, template import, itinerary save/delete/reorder, and expense save/delete optimistic while offline.
- [x] Subscribe to online/offline transitions; trigger background sync on reconnect and refresh affected screens after successful replay.
- [ ] Render a compact offline/pending banner and conflict actions labelled `保留本機` and `採用雲端`; keep the banner hidden when there is no pending work.
- [x] Keep logout cleanup wired through `clearOfflineCache` so cached private data cannot survive sign-out.

### Task 5: Verification and handoff

**Files:**
- Verify: `public/sw.js`, `scripts/generate-service-worker.mjs`, all changed files

- [x] Run `npm test` and verify every test passes with network requests blocked.
- [x] Run `npm run type-check`.
- [x] Run `npm run build:web` and regenerate the service worker; verify private Supabase paths remain excluded from Cache Storage.
- [x] Run `git diff --check`, review the migration list (no schema migration is needed), and document the offline behavior and fallback limits.
