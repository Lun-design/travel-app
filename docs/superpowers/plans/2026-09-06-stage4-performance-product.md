# Stage 4 Performance and Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove the home-screen member N+1 pattern, split trip-detail responsibilities into focused modules, and export itinerary events as a timezone-aware `.ics` calendar.

**Architecture:** Add a guarded Supabase RPC with a service fallback, extract trip-detail data orchestration into a hook plus presentational panels, and keep calendar generation pure so it works in tests and both Web/native adapters. Existing offline snapshots and API signatures remain compatible.

**Tech Stack:** Expo Router 55, React Native, Supabase RPC/Postgres, TypeScript, Vitest, iCalendar RFC 5545 text.

---

### Task 1: Home trip/member aggregation

**Files:**
- Create: `supabase/migrations/20260906020000_trip_list_with_members.sql`
- Modify: `lib/trips.ts`
- Modify: `src/app/index.tsx`
- Test: `tests/trips-aggregation.test.ts`

- [x] **Step 1: Write the failing service tests**

Test `listTripsWithMembers` with a mocked `supabase.rpc` response containing one trip and a JSON member list; assert the result preserves `TripMemberWithProfile` fields. Add a second test where RPC returns a missing-function error and assert the service uses `listTrips` plus `listTripMembers` fallback.

- [x] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- tests/trips-aggregation.test.ts`

Expected: FAIL because `listTripsWithMembers` is not exported.

- [x] **Step 3: Add the migration and minimal service implementation**

Create a `security invoker` SQL function returning `trip_id`, trip fields, and `members jsonb`, filterable by the authenticated user. Add `listTripsWithMembers(options?)` that calls `supabase.rpc('list_trips_with_members')`, maps rows, and falls back only for missing-function/schema errors. Reuse existing `listTrips`/`listTripMembers` and offline scope handling for the fallback.

- [x] **Step 4: Replace home-screen N+1 loading**

Call `listTripsWithMembers()` once in `src/app/index.tsx`, derive the existing `trips` array and `members` map from its result, and remove the per-trip `Promise.all(...listTripMembers...)` loop. Keep the local-session lookup and existing error/loading UI unchanged.

- [x] **Step 5: Run focused and regression tests**

Run: `npm test -- tests/trips-aggregation.test.ts tests/trip-list.test.ts`

Expected: all focused tests pass.

---

### Task 2: Pure calendar serialization and download adapter

**Files:**
- Create: `lib/calendar.ts`
- Test: `tests/calendar.test.ts`

- [x] **Step 1: Write failing serializer tests**

Cover escaped commas/semicolons/backslashes/newlines, CRLF output, `DTSTART`/`DTEND` using the trip timezone, duration-based end times, daily departure fallback when `item.time` is absent, `LOCATION`, and a 15-minute `VALARM`.

- [x] **Step 2: Run the focused tests and verify they fail**

Run: `npm test -- tests/calendar.test.ts`

Expected: FAIL because `buildTripIcs` is not defined.

- [x] **Step 3: Implement pure ICS helpers**

Define `CalendarTrip`, `CalendarItem`, and `CalendarExportOptions`. Implement `escapeIcsText`, convert local trip-date/time values with the existing timezone helpers, use `duration_minutes ?? 60`, and emit one `VEVENT` per itinerary item with stable UID and `VALARM:-PT15M`.

- [x] **Step 4: Implement the platform adapter**

Export `exportTripCalendar(trip, items)` that creates a Blob/object URL and clicks a temporary download anchor on Web; on non-Web return the ICS string without accessing `window` or `document` at module load time.

- [x] **Step 5: Run focused tests**

Run: `npm test -- tests/calendar.test.ts`

Expected: all calendar tests pass.

---

### Task 3: Trip detail data hook and modular panels

**Files:**
- Create: `src/hooks/useTripDetailData.ts`
- Create: `src/components/trip-detail/TripDetailHeader.tsx`
- Create: `src/components/trip-detail/TripDetailTabs.tsx`
- Create: `src/components/trip-detail/TimelinePanel.tsx`
- Create: `src/components/trip-detail/ExpensesPanel.tsx`
- Modify: `src/app/trips/[id].tsx`
- Test: `tests/trip-detail-modules.test.ts`

- [x] **Step 1: Write a route/module contract test**

Read the route and new module sources and assert the route imports `useTripDetailData`, `TripDetailHeader`, `TripDetailTabs`, `TimelinePanel`, and `ExpensesPanel`; assert the hook exposes loading/error/data and reconnect refresh behavior.

- [x] **Step 2: Run the focused test and verify it fails**

Run: `npm test -- tests/trip-detail-modules.test.ts`

Expected: FAIL because the hook and modules do not exist.

- [x] **Step 3: Extract data orchestration**

Move trip/member/item/expense/voucher loading, offline scope, pending/conflict refresh, and online reconnect sync into `useTripDetailData`. Return stable callbacks for `reload`, `resolveConflict`, and optimistic reorder/save wrappers.

- [x] **Step 4: Extract presentational modules**

Move existing Header, segmented tabs, timeline/map, and expenses JSX/styles into focused components. Preserve all current props, theme behavior, safe-area padding, map toggle, modals, and FAB actions. The route retains tab selection and modal state only.

- [x] **Step 5: Add calendar action to the timeline header**

Add a compact `匯出行事曆` button in `TimelinePanel` that calls `exportTripCalendar` with the current trip and items, and displays an Alert on adapter errors.

- [x] **Step 6: Run focused tests and type-check**

Run: `npm test -- tests/trip-detail-modules.test.ts tests/trip-detail-responsive.test.ts` and `npm run type-check`.

Expected: focused tests pass and TypeScript exits 0.

---

### Task 4: Full verification and handoff

**Files:**
- Verify: all changed files, `supabase/migrations/20260906020000_trip_list_with_members.sql`

- [x] **Step 1: Run the complete test suite**

Run: `npm test`

Expected: every test passes with no real network dependency.

- [x] **Step 2: Run type-check and Web build**

Run: `npm run type-check` and `npm run build:web`

Expected: TypeScript exits 0, Expo static export succeeds, and Service Worker generation completes.

- [x] **Step 3: Review the diff**

Run: `git diff --check` and verify no private Supabase endpoints are added to Service Worker precache rules.
