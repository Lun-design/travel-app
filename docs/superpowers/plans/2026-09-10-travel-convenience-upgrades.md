# Travel Convenience Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add low-risk, cross-platform quick sharing for a day itinerary and one-tap copying of place address/coordinates without changing the database schema.

**Architecture:** Keep formatting in pure `lib` helpers so it can be tested without React Native. `TimelinePanel` owns the day-share action, while `TimelineCard` owns place-level copy actions. Clipboard and native share fallbacks stay at the UI boundary.

**Tech Stack:** React Native/Expo, Expo Router, Vitest, existing itinerary/map-link helpers.

---

### Task 1: Day itinerary text and place action helpers

**Files:**
- Create: `lib/itinerary-share.ts`
- Create: `lib/place-actions.ts`
- Test: `tests/itinerary-share.test.ts`
- Test: `tests/place-actions.test.ts`

- [x] Write tests for deterministic day sorting, missing values, navigation links, address formatting, and coordinate formatting.
- [x] Implement pure helpers using the existing itinerary sort and Google Maps URL helpers.
- [x] Run the focused Vitest files and confirm they pass.

### Task 2: Timeline UI actions

**Files:**
- Modify: `src/components/trip-detail/TimelinePanel.tsx`
- Modify: `src/components/ItineraryTimeline.shared.tsx`

- [x] Add a day-level “複製今日行程” action using browser Clipboard/Web Share with a native Share fallback.
- [x] Add “複製地址” and “複製座標” actions to timeline cards only when values exist.
- [x] Keep existing Google Maps navigation and all weather/packing/expense behavior unchanged.
- [x] Add clear Alert feedback for success and unavailable data.

### Task 3: Verification

**Files:**
- No additional production files.

- [x] Run `npm test`.
- [x] Run `npm run type-check`.
- [x] Run `npm run build` and `npm run verify:build`.
