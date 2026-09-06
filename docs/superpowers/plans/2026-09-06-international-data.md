# International Data Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add destination timezone correctness, resilient live/manual exchange rates, and explicit weather forecast source labels without breaking existing trips.

**Architecture:** Store an IANA timezone on trips and route all calendar interpretation through `lib/timezone.ts`. Add a fetch-injectable exchange-rate service that layers manual overrides, persisted snapshots, live rates, and defaults. Extend weather summaries with a source enum and render the source beside timeline weather.

**Tech Stack:** Expo Router, React Native, TypeScript, Supabase SQL migrations, `Intl.DateTimeFormat`, Vitest.

---

### Task 1: Timezone utility and schedule integration

**Files:**
- Create: `lib/timezone.ts`
- Test: `tests/timezone.test.ts`
- Modify: `lib/schedule.ts`
- Modify: `src/app/trips/[id].tsx`
- Modify: `src/components/ItineraryTimeline.shared.tsx`

- [x] Write tests for valid/invalid IANA zones, destination-local weekday/date, and fallback to `Asia/Taipei`.
- [x] Add `timezone` to `ScheduleContext` and use the utility for weekday/date calculations.
- [x] Pass `trip.timezone` from the trip page and expose source-safe labels without browser globals.
- [x] Run `node node_modules/vitest/vitest.mjs run tests/timezone.test.ts tests/schedule.test.ts` and type-check.

### Task 2: Trip schema, types, and settings UI

**Files:**
- Create: `supabase/migrations/20260906010000_trip_timezones.sql`
- Modify: `lib/trips.ts`
- Modify: `src/components/CreateTripModal.tsx`
- Modify: `src/components/TripSettingsModal.tsx`
- Test: `tests/security-migration.test.ts`

- [x] Add nullable-safe `timezone text not null default 'Asia/Taipei'` with a non-empty check and backfill existing rows.
- [x] Extend create/update payload types while retaining the default for old callers.
- [x] Add a validated IANA timezone field to create/settings forms and send it through `updateTrip`.
- [x] Add migration contract assertions and run the focused tests.

### Task 3: Live exchange-rate service and expense UI

**Files:**
- Modify: `lib/exchange-rates.ts`
- Modify: `src/app/trips/[id].tsx`
- Modify: `src/components/ExpenseList.tsx`
- Modify: `src/components/ExpenseModal.tsx`
- Test: `tests/exchange-rates.test.ts`

- [x] Add `ExchangeRateSnapshot`, safe storage helpers, API parsing, TTL-aware cache, and manual lock/clear methods.
- [x] Preserve `convertToTwd` as a pure function and let callers pass the resolved snapshot rates.
- [x] Load one snapshot per trip-detail screen, show source/last-updated text, and allow locking the selected currency rate.
- [x] Mock all fetch/storage in tests and verify live, cache, manual, default, and offline behavior.

### Task 4: Weather source metadata and labels

**Files:**
- Modify: `lib/weather-api.ts`
- Modify: `src/components/ItineraryTimeline.shared.tsx`
- Test: `tests/weather.test.ts`

- [x] Add `source` and `isSimulated` to `WeatherSummary` and set them in live/mock paths.
- [x] Render a compact `模擬預報` label for mock/historical fallback and `即時預報` for live responses.
- [x] Keep the existing alert thresholds and mock values unchanged.
- [x] Run weather tests with the network-blocking test setup.

### Task 5: Full verification and handoff

**Files:**
- Verify: `package.json`, `dist/sw.js`, all changed files

- [x] Run the complete Vitest suite and `tsc --noEmit`.
- [x] Run Expo web export and regenerate the service worker.
- [x] Run `git diff --check` and review migration ordering.
- [x] Report the Supabase command and the UI behavior of each fallback source.
