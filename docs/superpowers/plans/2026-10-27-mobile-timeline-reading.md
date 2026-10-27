# Mobile Timeline Reading Implementation Plan

> Execute approved display-only work in the current workspace using TDD and a read-only review checkpoint. No automatic commit or deployment.

**Goal:** Reduce mobile upper-page rows and card dead space while retaining every existing action.

**Architecture:** Small display-only components handle tools disclosure, card slot layout and transparent navigation artwork. Pure helpers handle exact duplicate notes and fully-synced classification. Parent callbacks/data remain unchanged.

**Tech Stack:** Expo 55, RN/Web, React, Vitest. Exact Expo55 docs read before code changes.

## Task 1 — Red tests

- [ ] Create `tests/mobile-timeline-reading.test.ts` for exact notes, `isFullySynced`, `TimelineTools`, `TimelineCardLayout`, `NavigationPuppy`, and 48px mobile FAB. Example: `expect(getTimelineDisplayNotes({ title: '機場', time: '06:05', notes: '06:05 機場' })).toBeNull()`; additional notes must stay unchanged.
- [ ] Add regression to `tests/sync-state.test.ts` (or existing banner test) verifying `hideHealthy` hides only complete success, not pending/offline/error/undo/conflicts.
- [ ] Run targeted tests and record missing behavior failures before implementation.

## Task 2 — Display helpers and structure

- [ ] Add `lib/timeline-display.ts` exact-line comparison; add `isFullySynced` in `lib/undo-sync.ts` without changing `getSyncPresentation` results.
- [ ] Add `src/components/trip-detail/TimelineTools.tsx`: `expanded = !compact || open`, always-mounted hidden body, original controls passed as children; parent keys by trip/day.
- [ ] Add `src/components/TimelineCardLayout.tsx` slots `image`, `heading`, `details`: mobile details sibling of heading row, desktop details inside content column.
- [ ] Add `src/components/NavigationPuppy.tsx` with transparent `journal-reading` crop (source union bounds 44,64–200,184 of 240px); outer 28px, inner 43px positioned -8/-9. Do not alter GIF bytes.
- [ ] Add `src/components/trip-detail/TripAddButton.tsx` to preserve callback with 48px compact glyph / normal desktop label.

## Task 3 — Integrate without data changes

- [ ] Integrate slot layout into `ItineraryTimeline.shared.tsx`; keep each original handler/Modal once. Use display notes only in rendered card and expansion length, not persistence or exports.
- [ ] Integrate mobile tools in `TimelinePanel.tsx`, leaving map outside and original defaults unchanged. Pass theme to NextStopMode. Keep warnings/convenience content visible.
- [ ] Add optional dense metrics to `DashboardMetricsBar.tsx`: nowrap horizontal scroll, original complete labels retained.
- [ ] Add optional `hideHealthy` in `OfflineSyncBanner.tsx`; put tiny healthy status in existing Header kicker via optional prop. Integrate in `[id].tsx`; preserve all nonhealthy banners.
- [ ] Replace root FAB with `TripAddButton` using existing positions/insets/callback. Keep 144px clearance. Update obsolete layout/source assertions only, retain all behavioral tests.

## Task 4 — Review, verification, tracking

- [ ] Request independent read-only review of slot boundaries/Modals, scope cleanup, sync classification, notes preservation and asset background claims.
- [ ] For confirmed bugs, first add failing test then fix.
- [ ] Run `npm.cmd test -- --run`, `npm.cmd run type-check`, `npm.cmd run build`, then `npm.cmd run verify:build`; `git diff --check`.
- [ ] Record actual test/build evidence and pending mobile visual QA in UX tracker. Do not claim screenshots/device checks without evidence.

## Execution record — 2026-10-27

All implementation tasks and independent read-only review completed. Initial regression tests failed before implementation. Review found internal whitespace over-normalization and a 32px metrics viewport clipping its action; both received failing regression tests, then fixes (preserved internal whitespace; 44px viewport). Re-review found no outstanding issues.

Final verification: 145 test files / 1,135 tests passed; type-check, production Web build, and subsequent verify:build exited 0. UX-16C records the changes. Real mobile/browser visual acceptance remains pending because no browser surface was available. No commit, deployment, migration, or source GIF editing performed.
