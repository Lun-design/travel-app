# Puppy Travel Journal Implementation Plan

> **For agentic workers:** Execute tasks in this session, with TDD and a read-only review checkpoint. Preserve the user's existing workspace; no automatic commit, push or deployment.

**Goal:** Apply the approved oat/coffee puppy-journal art direction without changing data or navigation behavior.

**Architecture:** Extend the display-only puppy source union without adding new profile-avatar choices. Keep palette/layout presentation in `lib/trip-journal.ts`; use code-native View-based line icons so controls do not require another font package. Change component styling/composition only; preserve all callbacks and native Modal dismissal handling.

**Tech Stack:** Expo 55, React Native 0.83/Web, React 19, Vitest interaction harness. Expo's exact v55 docs read before code changes.

**Execution record:** Tasks 1–3 implemented. Initial targeted Red: 19 failures; date/tab and dark-mode cases also failed before changes. Reviewer issues reproduced in four failing cases, then fixed. Final full suite: 144 files / 1114 tests passed; type-check and Web build exit 0. Browser/device visual acceptance remains manual after deployment. No automatic git or migration actions.

## Task 1 — Tests first

Files: `tests/puppy-journal.test.ts`, `tests/trip-information-density.test.ts`.

- [ ] Add failing assertions for three contextual journal assets, legacy avatar IDs unchanged, category/transport selection, theme-aware palette, compact header puppy visible at 76px and desktop at 106px, decorative pointer isolation, 44px controls, information disclosure unchanged.
- [ ] Expected examples: `expect(getNavigationPuppy('hotel', 'DRIVING')).toBe('-6')`; `expect(getNavigationPuppy('transit', 'DRIVING')).toBe('journal-drive')`; `expect(getTripJournalPalette(getAppTheme('dark')).paper).not.toBe('#FFFDF8')`.
- [ ] Run `npm.cmd test -- --run tests/puppy-journal.test.ts tests/trip-information-density.test.ts`; verify failure is missing presentation behavior.

## Task 2 — Contextual artwork and presentation primitives

Files: `lib/puppy.ts`, `lib/trip-journal.ts`, `src/components/PuppyMascot.tsx`, `src/components/trip-detail/JournalIcon.tsx`, three GIFs in `src/assets/images/puppy/`.

- [ ] Copy only `贴贴.gif`, `趴趴.gif`, `-17.gif` from user-supplied directory to semantic `journal-together.gif`, `journal-reading.gif`, `journal-drive.gif`. Preserve original pixels/animation; check actual transparency metadata. No blend modes or image regeneration.
- [ ] Keep `PUPPY_IDS` unchanged. Add `PuppyArtId = PuppyId | 'journal-together' | 'journal-reading' | 'journal-drive'` and contextual navigation mapping; add explicit static require entries in `PuppyMascot`.
- [ ] Return journal palette for light mode (`page: '#F7F3EB', paper: '#FFFDF8', ink: '#49392E', accent: '#8C6D58'`) and existing theme colors for dark mode.
- [ ] Implement search, back, more and close icons with non-interactive RN Views and strokes; outer buttons retain accessibility labels.

## Task 3 — Apply approved layout and visual hierarchy

Files: `TripDetailHeader.tsx`, `TripTravelInfo.tsx`, `DayTabs.tsx`, `TripDetailTabs.tsx`, `ItineraryTimeline.shared.tsx`, `src/app/trips/[id].tsx`.

- [ ] Header: visible together artwork 76/106px, compact actions vertical (2 × 44px) to leave title width at 320px; desktop actions horizontal. No extra hero. Keep original safe area, permissions, callbacks, queued iOS dismissal and scope cleanup.
- [ ] Info strip: reading puppy 44px beside existing disclosure, warm unified surface, no new permanent content row; shortcuts and always-mounted body unchanged.
- [ ] Dense dates: warm readable muted text and coffee selected state, maintain 56px strip/44px target and original labels/callbacks. Functional tabs: subtle underline and smaller type, 44px target and horizontal scroll; original tab IDs/labels intact.
- [ ] Cards: keep real thumbnail and badges; navigation art 28px with 44px active pill and theme-aware warm background. `navigationPuppyId(item.category, segment?.mode)` is presentation only; URL generation remains untouched. Empty state uses existing friendly double-dog art. Keep 144px FAB clearance.
- [ ] Adjust only obsolete visual/source assertions (44px mascot cap, 20px navigation dog); retain behavioral regressions.
- [ ] Run targeted tests, then full suite; investigate any non-visual failures before continuing.

## Task 4 — Review and delivery

- [ ] Request independent read-only code review for layout arithmetic, accessibility, dark theme, asset binding, original behavior and scope.
- [ ] Fix confirmed issues with Red → Green tests.
- [ ] Execute `npm.cmd test -- --run`, `npm.cmd run type-check`, `npm.cmd run build`, then `npm.cmd run verify:build` only after build finishes; `git diff --check`.
- [ ] Update UX tracker with actual evidence and visual/on-device limitations. Browser automation was unavailable during preview; do not claim screenshot or device verification without it.
- [ ] Hand off uncommitted changes and short desktop/mobile acceptance checklist. No database migration.
