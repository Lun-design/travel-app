# Production Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent private Supabase data from leaking through the PWA cache, clear browser offline artifacts on logout, and tighten trip-member RLS without breaking the current schema/API.

**Architecture:** Keep static asset caching in the Service Worker, explicitly exclude Supabase REST/Storage/Auth data, and expose a small browser-only cache cleanup helper used by normal logout and invalid-session recovery. Add one forward-only Supabase migration with security-definer membership helpers and explicit policies for profiles, expenses, expense splits, packing items, documents, vouchers, and the travel-documents bucket; retain legacy columns for compatibility.

**Tech Stack:** Expo Router web static export, Service Worker, Supabase PostgreSQL RLS, TypeScript, Vitest.

---

### Task 1: Lock down private PWA caching

**Files:**
- Modify: `public/sw.js`
- Modify: `tests/pwa.test.ts`

- [x] **Step 1: Write the failing source-contract test**

Assert the Service Worker has a private-resource guard and a logout cleanup message handler, while no longer treating `/rest/v1/` or `/storage/v1/` as cacheable resources.

- [x] **Step 2: Run the focused test and verify it fails**

Run `npm test -- tests/pwa.test.ts`; expect failure because the current worker caches Supabase paths.

- [x] **Step 3: Implement the minimal worker change**

Add `isPrivateDataResource(url)` before the generic image/document checks, return `false` for Supabase REST/Storage/Auth paths, and add a `message` handler for `CLEAR_RUNTIME_CACHE` that deletes runtime caches.

- [x] **Step 4: Run the focused test and verify it passes**

Run `npm test -- tests/pwa.test.ts`; expect all PWA tests to pass.

### Task 2: Clear browser cache artifacts during logout/recovery

**Files:**
- Create: `lib/offline-cache.ts`
- Create: `tests/offline-cache.test.ts`
- Modify: `src/app/index.tsx`
- Modify: `src/components/AuthGate.tsx`
- Modify: `lib/supabase.ts`

- [x] **Step 1: Write failing helper tests**

Mock `caches`, `navigator.serviceWorker.controller`, and localStorage; verify `clearOfflineCache()` deletes keys beginning with `travel-planner-runtime-`, removes only `travel-planner-offline:` local-storage entries, and posts `CLEAR_RUNTIME_CACHE`.

- [x] **Step 2: Run the focused test and verify it fails**

Run `npm test -- tests/offline-cache.test.ts`; expect module-not-found/failing assertions before the helper exists.

- [x] **Step 3: Implement the browser-safe helper and call sites**

Guard browser globals for Expo static rendering. Call the helper before `supabase.auth.signOut()` on the home screen, before AuthGate clears an invalid session, and from Supabase JWT recovery before local sign-out. Do not delete the persisted theme preference.

- [x] **Step 4: Run focused tests and type-check**

Run `npm test -- tests/offline-cache.test.ts tests/pwa.test.ts` and `npx --no-install tsc --noEmit`; expect success.

### Task 3: Add the RLS hardening migration

**Files:**
- Create: `supabase/migrations/20260906000000_harden_trip_data_access.sql`
- Create: `tests/security-migration.test.ts`

- [x] **Step 1: Write migration contract tests**

Check that the migration creates a trip/user membership helper, restricts profile visibility to self/co-trip members, validates expense payers and split users against the same trip, adds explicit packing-item policies, and restricts document storage deletion to the uploader or trip editor.

- [x] **Step 2: Run the focused test and verify it fails**

Run `npm test -- tests/security-migration.test.ts`; expect failure because the migration is absent.

- [x] **Step 3: Implement the forward-only SQL migration**

Drop superseded policy names, recreate explicit select/insert/update/delete policies, keep legacy columns/tables for compatibility, and add indexes for split users and packing assignees. Use `private.is_trip_member_for_user(trip_id, user_id)` as a security-definer helper so RLS checks do not recurse through `trip_members`.

- [x] **Step 4: Run SQL contract tests and the full verification suite**

Run `npm test`, `npx --no-install tsc --noEmit`, and `npm run build`; expect all tests, type-check, and Expo export to pass.

### Task 4: Review deployment diff and handoff

**Files:**
- Verify: `git diff --check`, `git status --short`

- [x] **Step 1: Confirm no private cache paths remain in the worker**
- [x] **Step 2: Confirm the new migration is the latest timestamp and reversible by a follow-up migration if needed**
- [x] **Step 3: Report exact verification counts and the Supabase migration command**

Supabase deployment command: `npx supabase db push` from the project root after reviewing the SQL in the dashboard/local database.
