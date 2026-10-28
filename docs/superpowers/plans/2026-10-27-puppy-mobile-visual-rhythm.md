# Puppy Mobile Visual Rhythm Implementation Plan

> **For agentic workers:** Execute this plan inline, task by task. Preserve user-provided work and do not commit automatically.

**Goal:** Make every mobile itinerary stop visibly part of the user's puppy travel journal while keeping the day selector and timeline compact.

**Architecture:** Reuse the existing `PuppyMascot` registry and user-supplied transparent GIFs. Assign a stable, ID-seeded mascot to each stop and avoid adjacent repeats. Keep route summaries text-only, auto-scroll the selected date fully into view, and reduce mobile spacing around the inline add button.

**Tech Stack:** Expo SDK 55, React Native/Web, TypeScript.

---

## File map

- `lib/puppy.ts`: extend display-only mascot identifiers; do not alter avatar IDs or the existing category mapping.
- `src/components/PuppyMascot.tsx`: static `require` bindings for the small curated GIF set.
- `src/assets/images/puppy/`: copied user-provided source files, preserving bytes.
- `src/components/DayTabs.tsx`: keep compact tabs the same size and scroll the selected tab into full view.
- `src/components/ItineraryTimeline.shared.tsx`: render a prominent decorative mascot beside every card; keep route summaries plain text.
- `src/components/ItineraryTimeline.web.tsx` and `src/components/ItineraryTimeline.native.tsx`: assign stable, non-repeating neighboring decorations without changing route data.
- `tests/puppy-journal.test.ts` and mobile layout assertions: only update stale source expectations if they specifically assert the removed navigation mascot; do not add or run tests in this task.
- `docs/audits/2026-10-20-ux-improvement-backlog.md`: record final implementation/verification evidence and the still-pending real-device visual check.

## Task 1 — Add a small, curated display-only art set

Copy only the approved lightweight animations from `C:\Users\張晉綸\Desktop\debug` into `src/assets/images/puppy/`, using semantic names. Planned: `一起摇.gif` (daily tab), `安慰小鸡毛.gif` and `贴贴咯.gif` (alternating route transition accents). Preserve original frames; exclude all non-selected source images.

Add the three names to `PuppyArtId` and `PuppyMascot`'s static source map. Keep `PUPPY_IDS` unchanged so decorations never become profile-avatar options.

## Task 2 — Keep day tabs even and put the chapter puppy on the timeline rail

Give every compact tab the same 80×50px dimensions and keep the selected state to the existing color/shadow. Auto-scroll the selected date into full view. In the web and native timeline renderers, pass a 44px decorative puppy to every itinerary card; keep each image non-interactive and hidden from accessibility. Choose art deterministically from the item's ID and avoid repeating neighboring art.

## Task 3 — Give the timeline a little more puppy personality

Keep route summaries plain text and preserve all route data, distance, mode selection, and navigation URLs. Move the compact mobile Add button into normal page flow immediately before the timeline cards; leave the desktop floating Add button unchanged. Keep bottom scroll clearance and all current callbacks intact.

Remove `NavigationPuppy` from the Google Maps button while retaining the compass glyph, label, 44px target and existing press handler. Keep route pills text-only. Move compact Add into normal mobile page flow before the timeline and tighten its top/bottom spacing; leave desktop position and callbacks unchanged.

## Task 4 — Validate and record

Run TypeScript check and production Web build (do not run test commands unless the user asks). Inspect `git diff --check` and `git status --short`. Confirm the selected tab and route decorations use only explicit local static assets and have `pointerEvents="none"`/accessibility hidden. Update the UX tracker with what changed and the honest limitation: no actual mobile/browser screenshot is available in this session.

Do not change routes, trip data, database schema, user photos, categories or navigation behavior. Do not stage, commit, push or deploy.

## Execution record — 2026-10-27

- Added three original transparent GIFs selected by the user: `journal-dance`, `journal-comfort`, and `journal-hearts`.
- Compact day tabs now share a fixed size; the first card's timeline rail displays a 32px puppy. Route summaries are plain text. The mobile Add button now appears before the cards in normal scroll flow; desktop retains its floating action.
- Updated existing static-source assertions to describe the new presentation contract; did not add or execute tests.
- `npm.cmd run type-check`, `npm.cmd run build`, `npm.cmd run verify:build`, and `git diff --check` passed. A real mobile/browser screen is not available in this session, so visual confirmation remains pending.
- No database, trip data, navigation URL, or Git metadata changed. No commit, push, or deployment.

## Follow-up — 2026-10-28: Add a visible dog to every stop

### Files

- `lib/puppy.ts`: curate the ten display-only art IDs and select a stable image by itinerary ID, avoiding the previous item's art.
- `src/components/PuppyMascot.tsx`: register four additional local GIFs from the user's supplied set.
- `src/assets/images/puppy/`: copy the four transparent originals byte-for-byte.
- `src/components/ItineraryTimeline.shared.tsx`, `.native.tsx`, `.web.tsx`: render a larger mascot on every timeline rail, with deterministic per-item assignment.
- `src/components/DayTabs.tsx`: scroll the selected 80px tab fully into view when selection or viewport size changes.
- `src/components/trip-detail/TimelineViewport.tsx` and `TimelinePanel.tsx`: tighten compact top and add-button spacing.
- `docs/superpowers/specs/2026-10-27-puppy-mobile-visual-rhythm-design.md` and `docs/audits/2026-10-20-ux-improvement-backlog.md`: keep design records accurate.

### Execution

1. Copy `扯脸.gif`, `吹头发.gif`, `打闹.gif`, and `摸肚肚.gif` to explicit `journal-*.gif` names and verify SHA-256 matches plus transparent first-frame corners.
2. Extend the display-art union and `PuppyMascot` static source map; leave `PUPPY_IDS` and profile-avatar logic unchanged.
3. Implement stable ID hashing in `lib/puppy.ts`; if a stop hashes to its predecessor's art, advance one slot so adjacent stop decorations differ.
4. Pass a mascot to every `TimelineCard`; render it at 44px in the left rail with pointer and accessibility disabled.
5. Add an 80px tab `ScrollView` ref and viewport measurement; center the selected tab on initial layout and selection changes.
6. Set compact timeline viewport top padding to zero and remove extra mobile add-button vertical margins; leave desktop spacing unchanged.
7. Run `npm.cmd run type-check`, `npm.cmd run build`, `npm.cmd run verify:build`, and `git diff --check`. Do not add or run tests under the current workspace instruction.

### Review decisions

- Use a deterministic pseudo-random assignment by item ID instead of runtime randomness so mascot images do not jump on re-render.
- Keep all four new assets local; do not require API/storage access and do not modify item records.
- Do not commit or push; Git metadata is read-only in this workspace.
- Validation result: `npm.cmd run type-check`, `npm.cmd run build`, `npm.cmd run verify:build`, and `git diff --check` pass. No tests were added or run, and a real mobile screenshot remains unavailable for visual acceptance.
